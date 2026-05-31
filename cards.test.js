import { describe, it, expect } from 'vitest';
const { CARDS, buildDeck, shuffleDeck, getPlayerDrain, getPlayerExtraDraw, getPlayerHealBonus, getPlayerTurnHeal, isHolidayBlocked, canPlayPolicy } = require('./cards');

// ─── Deck Building ────────────────────────────────────────────────────────────

describe('buildDeck', () => {
  it('returns an array of cards', () => {
    const deck = buildDeck();
    expect(Array.isArray(deck)).toBe(true);
    expect(deck.length).toBeGreaterThan(0);
  });

  it('each card has required fields', () => {
    const deck = buildDeck();
    for (const card of deck) {
      expect(card).toHaveProperty('uid');
      expect(card).toHaveProperty('id');
      expect(card).toHaveProperty('name');
      expect(card).toHaveProperty('category');
      expect(card).toHaveProperty('description');
      expect(typeof card.uid).toBe('string');
      expect(card.uid.length).toBeGreaterThan(0);
    }
  });

  it('has correct number of copies for each card', () => {
    const deck = buildDeck();
    for (const category of Object.keys(CARDS)) {
      for (const cardDef of CARDS[category]) {
        const count = deck.filter(c => c.id === cardDef.id).length;
        expect(count).toBe(cardDef.copies);
      }
    }
  });

  it('includes all categories', () => {
    const deck = buildDeck();
    const categories = new Set(deck.map(c => c.category));
    expect(categories.has('recovery')).toBe(true);
    expect(categories.has('damage')).toBe(true);
    expect(categories.has('action')).toBe(true);
    expect(categories.has('policy')).toBe(true);
    expect(categories.has('reaction')).toBe(true);
    expect(categories.has('chaos')).toBe(true);
  });

  it('each card has a unique uid', () => {
    const deck = buildDeck();
    const uids = deck.map(c => c.uid);
    expect(new Set(uids).size).toBe(uids.length);
  });

  it('recovery cards have positive hp', () => {
    const deck = buildDeck();
    const recovery = deck.filter(c => c.category === 'recovery');
    for (const card of recovery) {
      expect(card.hp).toBeGreaterThan(0);
    }
  });

  it('damage cards have negative hp', () => {
    const deck = buildDeck();
    const damage = deck.filter(c => c.category === 'damage');
    for (const card of damage) {
      expect(card.hp).toBeLessThan(0);
    }
  });

  it('policy cards have policyType', () => {
    const deck = buildDeck();
    const policies = deck.filter(c => c.category === 'policy');
    for (const card of policies) {
      expect(['positive', 'negative']).toContain(card.policyType);
      expect(card.effect).not.toBeNull();
    }
  });

  it('reaction cards have trigger', () => {
    const deck = buildDeck();
    const reactions = deck.filter(c => c.category === 'reaction');
    for (const card of reactions) {
      expect(card.trigger).not.toBeNull();
      expect(card.effect).not.toBeNull();
    }
  });

  it('chaos cards have chaosType', () => {
    const deck = buildDeck();
    const chaos = deck.filter(c => c.category === 'chaos');
    for (const card of chaos) {
      expect(card.chaosType).not.toBeNull();
    }
  });

  it('chaos cards are rare (1 copy each)', () => {
    const deck = buildDeck();
    for (const cardDef of CARDS.chaos) {
      const count = deck.filter(c => c.id === cardDef.id).length;
      expect(count).toBe(1);
    }
  });

  it('all cards have emoji', () => {
    const deck = buildDeck();
    for (const card of deck) {
      expect(card.emoji).toBeDefined();
      expect(card.emoji.length).toBeGreaterThan(0);
    }
  });
});

// ─── Shuffle ──────────────────────────────────────────────────────────────────

describe('shuffleDeck', () => {
  it('returns same number of cards', () => {
    const deck = buildDeck();
    const shuffled = shuffleDeck(deck);
    expect(shuffled.length).toBe(deck.length);
  });

  it('does not mutate original deck', () => {
    const deck = buildDeck();
    const original = [...deck];
    shuffleDeck(deck);
    expect(deck).toEqual(original);
  });

  it('contains same cards (different order)', () => {
    const deck = buildDeck();
    const shuffled = shuffleDeck(deck);
    const deckIds = deck.map(c => c.uid).sort();
    const shuffledIds = shuffled.map(c => c.uid).sort();
    expect(shuffledIds).toEqual(deckIds);
  });

  it('produces different order (probabilistic)', () => {
    const deck = buildDeck();
    const s1 = shuffleDeck(deck);
    const s2 = shuffleDeck(deck);
    // Very unlikely both shuffles produce same order
    const same = s1.every((c, i) => c.uid === s2[i].uid);
    expect(same).toBe(false);
  });
});

// ─── Policy Helpers ───────────────────────────────────────────────────────────

describe('getPlayerDrain', () => {
  it('returns 10 for player with no policies', () => {
    const player = { policies: [] };
    expect(getPlayerDrain(player)).toBe(10);
  });

  it('reduces drain with Work-Life Balance', () => {
    const player = { policies: [{ effect: 'reduce_drain', amount: 5 }] };
    expect(getPlayerDrain(player)).toBe(5);
  });

  it('increases drain with Micromanagement', () => {
    const player = { policies: [{ effect: 'increase_drain', amount: 5 }] };
    expect(getPlayerDrain(player)).toBe(15);
  });

  it('increases drain with Toxic Workplace', () => {
    const player = { policies: [{ effect: 'extra_damage', amount: 5 }] };
    expect(getPlayerDrain(player)).toBe(15);
  });

  it('stacks multiple policies', () => {
    const player = { policies: [
      { effect: 'reduce_drain', amount: 5 },
      { effect: 'increase_drain', amount: 5 },
    ]};
    expect(getPlayerDrain(player)).toBe(10);
  });

  it('never goes below 0', () => {
    const player = { policies: [
      { effect: 'reduce_drain', amount: 5 },
      { effect: 'reduce_drain', amount: 5 },
      { effect: 'reduce_drain', amount: 5 },
    ]};
    expect(getPlayerDrain(player)).toBe(0);
  });

  it('handles undefined policies', () => {
    const player = { policies: undefined };
    expect(getPlayerDrain(player)).toBe(10);
  });
});

describe('getPlayerExtraDraw', () => {
  it('returns 0 with no policies', () => {
    expect(getPlayerExtraDraw({ policies: [] })).toBe(0);
  });

  it('returns extra draw from Four-Day Week', () => {
    expect(getPlayerExtraDraw({ policies: [{ effect: 'extra_draw', amount: 1 }] })).toBe(1);
  });

  it('stacks multiple', () => {
    expect(getPlayerExtraDraw({ policies: [
      { effect: 'extra_draw', amount: 1 },
      { effect: 'extra_draw', amount: 1 },
    ] })).toBe(2);
  });
});

describe('getPlayerHealBonus', () => {
  it('returns 0 with no policies', () => {
    expect(getPlayerHealBonus({ policies: [] })).toBe(0);
  });

  it('adds bonus from Gym Membership', () => {
    expect(getPlayerHealBonus({ policies: [{ effect: 'bonus_recovery', amount: 5 }] })).toBe(5);
  });

  it('subtracts from KPI Pressure', () => {
    expect(getPlayerHealBonus({ policies: [{ effect: 'reduce_recovery', amount: 5 }] })).toBe(-5);
  });

  it('combines positive and negative', () => {
    expect(getPlayerHealBonus({ policies: [
      { effect: 'bonus_recovery', amount: 5 },
      { effect: 'reduce_recovery', amount: 5 },
    ] })).toBe(0);
  });
});

describe('getPlayerTurnHeal', () => {
  it('returns 0 with no policies', () => {
    expect(getPlayerTurnHeal({ policies: [] })).toBe(0);
  });

  it('returns heal from Flexible Hours', () => {
    expect(getPlayerTurnHeal({ policies: [{ effect: 'heal_on_turn', amount: 5 }] })).toBe(5);
  });
});

describe('isHolidayBlocked', () => {
  it('returns false with no policies', () => {
    expect(isHolidayBlocked({ policies: [] })).toBe(false);
  });

  it('returns true with PTO Denied', () => {
    expect(isHolidayBlocked({ policies: [{ effect: 'block_holiday' }] })).toBe(true);
  });

  it('returns false with other policies', () => {
    expect(isHolidayBlocked({ policies: [{ effect: 'reduce_drain', amount: 5 }] })).toBe(false);
  });
});

describe('canPlayPolicy', () => {
  it('returns true with 0 policies', () => {
    expect(canPlayPolicy({ policies: [] })).toBe(true);
  });

  it('returns true with 1 policy', () => {
    expect(canPlayPolicy({ policies: [{ name: 'test' }] })).toBe(true);
  });

  it('returns false with 2 policies', () => {
    expect(canPlayPolicy({ policies: [{ name: 'a' }, { name: 'b' }] })).toBe(false);
  });
});

// ─── Card Definitions Integrity ───────────────────────────────────────────────

describe('CARDS definitions', () => {
  it('all recovery cards have hp > 0', () => {
    for (const card of CARDS.recovery) {
      expect(card.hp).toBeGreaterThan(0);
      expect(card.name).toBeDefined();
      expect(card.copies).toBeGreaterThan(0);
    }
  });

  it('all damage cards have hp < 0', () => {
    for (const card of CARDS.damage) {
      expect(card.hp).toBeLessThan(0);
      expect(card.name).toBeDefined();
      expect(card.copies).toBeGreaterThan(0);
    }
  });

  it('all action cards have actionType', () => {
    for (const card of CARDS.action) {
      expect(card.actionType).toBeDefined();
      expect(card.name).toBeDefined();
    }
  });

  it('all policy cards have effect', () => {
    for (const card of CARDS.policy) {
      expect(card.effect).toBeDefined();
      expect(card.policyType).toBeDefined();
      expect(['positive', 'negative']).toContain(card.policyType);
    }
  });

  it('all reaction cards have trigger and effect', () => {
    for (const card of CARDS.reaction) {
      expect(card.trigger).toBeDefined();
      expect(card.effect).toBeDefined();
    }
  });

  it('all chaos cards have chaosType', () => {
    for (const card of CARDS.chaos) {
      expect(card.chaosType).toBeDefined();
    }
  });

  it('total deck size is reasonable (80-120 cards)', () => {
    const total = Object.values(CARDS).flat().reduce((sum, c) => sum + c.copies, 0);
    expect(total).toBeGreaterThanOrEqual(80);
    expect(total).toBeLessThanOrEqual(120);
  });
});
