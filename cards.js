// Burnout Card Game - Card Definitions

const CARDS = {
  recovery: [
    { id: 'holiday', name: 'Holiday', hp: 25, emoji: '🏖️', description: 'Take a well-deserved vacation!', copies: 2 },
    { id: 'good_sleep', name: 'Good Sleep', hp: 15, emoji: '😴', description: 'A full 8 hours of uninterrupted rest.', copies: 3 },
    { id: 'spa', name: 'Spa Day', hp: 15, emoji: '🧖', description: 'Full body relaxation and rejuvenation.', copies: 2 },
    { id: 'massage', name: 'Massage', hp: 15, emoji: '💆', description: 'Deep tissue stress relief.', copies: 2 },
    { id: 'yoga', name: 'Yoga', hp: 10, emoji: '🧘', description: 'Namaste your stress away.', copies: 3 },
    { id: 'running', name: 'Running', hp: 10, emoji: '🏃', description: "Runner's high kicks in!", copies: 3 },
    { id: 'cycling', name: 'Cycling', hp: 10, emoji: '🚴', description: 'Fresh air and freedom on two wheels.', copies: 2 },
    { id: 'hiking', name: 'Hiking', hp: 10, emoji: '🥾', description: 'Nature heals the soul.', copies: 2 },
    { id: 'movie_night', name: 'Movie Night', hp: 10, emoji: '🎬', description: 'Popcorn, couch, zero responsibilities.', copies: 3 },
    { id: 'board_game', name: 'Board Game Night', hp: 10, emoji: '🎲', description: 'Analog fun with friends.', copies: 2 },
    { id: 'nice_dinner', name: 'Nice Dinner', hp: 10, emoji: '🍽️', description: 'Good food, good mood.', copies: 3 },
    { id: 'social', name: 'Social', hp: 5, emoji: '☕', description: 'Catching up with friends over coffee.', copies: 3 },
    { id: 'afternoon_tea', name: 'Afternoon Tea', hp: 5, emoji: '🫖', description: 'A small moment of peace.', copies: 4 },
    { id: 'sick_leave', name: 'Sick Leave', hp: 20, emoji: '🤒', description: 'Doctor says rest. Skip next turn.', copies: 2, skipNextTurn: true },
  ],
  damage: [
    { id: 'overtime', name: 'Overtime', hp: -30, emoji: '⏰', description: '"We need this by tomorrow."', copies: 3 },
    { id: 'crunch_week', name: 'Crunch Week', hp: -20, emoji: '💀', description: 'Deadlines everywhere. No escape.', copies: 3 },
    { id: 'toxic_manager', name: 'Toxic Manager', hp: -20, emoji: '🐍', description: '"Per my last email..."', copies: 2 },
    { id: 'long_meeting', name: 'Long Meeting', hp: -15, emoji: '😵', description: 'This could have been an email.', copies: 4 },
    { id: 'performance_review', name: 'Performance Review', hp: -10, emoji: '📋', description: '"Let\'s discuss your growth areas."', copies: 4 },
    { id: 'monday_blues', name: 'Monday Blues', hp: -10, emoji: '😩', description: 'The weekend was too short.', copies: 4 },
  ],
  action: [
    { id: 'delegate', name: 'Delegate', emoji: '📤', description: 'Give 1 damage card to another player.', copies: 4, actionType: 'delegate' },
    { id: 'steal_lunch', name: 'Steal Lunch', emoji: '🍱', description: 'Steal 10 HP from another player.', copies: 3, actionType: 'steal', amount: 10 },
    { id: 'boundaries', name: 'Boundaries', emoji: '🛡️', description: 'Block the next Delegate or Steal targeting you.', copies: 4, actionType: 'shield' },
    { id: 'networking', name: 'Networking', emoji: '👀', description: "Look at another player's hand.", copies: 3, actionType: 'peek' },
    { id: 'coffee_run', name: 'Coffee Run', emoji: '☕', description: 'Draw 2 extra cards this turn.', copies: 3, actionType: 'draw', amount: 2 },
    { id: 'team_building', name: 'Team Building', emoji: '🤝', description: 'All players heal +5 HP.', copies: 2, actionType: 'heal_all', amount: 5 },
    { id: 'layoff', name: 'Layoff', emoji: '✂️', description: 'Target player discards 2 random cards.', copies: 2, actionType: 'discard_target', amount: 2 },
    { id: 'quiet_quitting', name: 'Quiet Quitting', emoji: '🤫', description: 'Skip your HP drain this turn.', copies: 3, actionType: 'skip_drain' },
  ],
  policy: [
    // Positive policies
    { id: 'work_life_balance', name: 'Work-Life Balance', emoji: '⚖️', description: 'Burnout reduced by 5 each turn.', copies: 2, policyType: 'positive', effect: 'reduce_drain', amount: 5 },
    { id: 'flexible_hours', name: 'Flexible Hours', emoji: '🕐', description: 'Gain 5 HP at start of your turn.', copies: 2, policyType: 'positive', effect: 'heal_on_turn', amount: 5 },
    { id: 'four_day_week', name: 'Four-Day Week', emoji: '📅', description: 'Draw 1 extra card each turn.', copies: 2, policyType: 'positive', effect: 'extra_draw', amount: 1 },
    { id: 'gym_membership', name: 'Gym Membership', emoji: '💪', description: 'Gain 5 extra HP whenever you recover.', copies: 2, policyType: 'positive', effect: 'bonus_recovery', amount: 5 },
    // Negative policies
    { id: 'micromanagement', name: 'Micromanagement', emoji: '🔍', description: 'Burnout increased by 5.', copies: 2, policyType: 'negative', effect: 'increase_drain', amount: 5 },
    { id: 'toxic_workplace', name: 'Toxic Workplace', emoji: '☠️', description: 'Lose 5 extra HP each turn.', copies: 2, policyType: 'negative', effect: 'extra_damage', amount: 5 },
    { id: 'kpi_pressure', name: 'KPI Pressure', emoji: '📊', description: 'Recovery cards heal 5 less.', copies: 2, policyType: 'negative', effect: 'reduce_recovery', amount: 5 },
    { id: 'pto_denied', name: 'PTO Denied', emoji: '🚫', description: 'Holiday cards have no effect.', copies: 2, policyType: 'negative', effect: 'block_holiday' },
  ],
  reaction: [
    { id: 'email_on_holiday', name: 'Email While on Holiday', emoji: '📧', description: 'Cancel someone\'s Holiday card.', copies: 2, trigger: 'holiday_played', effect: 'cancel_card' },
    { id: 'urgent_meeting', name: 'Urgent Meeting', emoji: '🚨', description: 'Reduce someone\'s recovery by 10.', copies: 2, trigger: 'recovery_played', effect: 'reduce_recovery', amount: 10 },
    { id: 'weekend_call', name: 'Weekend Call', emoji: '📱', description: 'After recovery, they lose 10 HP.', copies: 2, trigger: 'recovery_played', effect: 'damage_after', amount: 10 },
    { id: 'not_my_job', name: 'Not My Job', emoji: '🙅', description: 'Cancel a card targeting you.', copies: 3, trigger: 'targeted', effect: 'cancel_card' },
    { id: 'cover_for_me', name: 'Can You Cover For Me?', emoji: '🔄', description: 'Redirect a card targeting you.', copies: 2, trigger: 'targeted', effect: 'redirect' },
    { id: 'reply_all', name: 'Reply All', emoji: '📨', description: 'Copy an action card with new target.', copies: 2, trigger: 'action_played', effect: 'copy_action' },
  ],
  chaos: [
    { id: 'mass_layoff', name: 'Mass Layoff', emoji: '💣', description: 'Everyone loses 50 HP.', copies: 1, chaosType: 'damage_all', amount: 50 },
    { id: 'budget_cuts', name: 'Budget Cuts', emoji: '💸', description: 'Everyone loses 20 HP.', copies: 1, chaosType: 'damage_all', amount: 20 },
    { id: 'corporate_restructure', name: 'Corporate Restructure', emoji: '🏢', description: 'Everyone loses 30 HP.', copies: 1, chaosType: 'damage_all', amount: 30 },
    { id: 'corporate_merger', name: 'Corporate Merger', emoji: '🤝', description: 'Combine two players\' hands, shuffle, deal evenly.', copies: 1, chaosType: 'merge_hands' },
    { id: 'knowledge_transfer', name: 'Knowledge Transfer', emoji: '🔀', description: 'Two players exchange hands.', copies: 1, chaosType: 'swap_hands' },
    { id: 'economic_downturn', name: 'Economic Downturn', emoji: '📉', description: 'All recovery halved until your next turn.', copies: 1, chaosType: 'halve_recovery' },
  ],
};

function buildDeck() {
  const deck = [];
  for (const category of Object.keys(CARDS)) {
    for (const card of CARDS[category]) {
      for (let i = 0; i < card.copies; i++) {
        deck.push({
          uid: Math.random().toString(36).substr(2, 9),
          id: card.id,
          name: card.name,
          category,
          emoji: card.emoji || '🃏',
          hp: card.hp || 0,
          description: card.description,
          actionType: card.actionType || null,
          amount: card.amount || 0,
          skipNextTurn: card.skipNextTurn || false,
          policyType: card.policyType || null,
          effect: card.effect || null,
          trigger: card.trigger || null,
          chaosType: card.chaosType || null,
        });
      }
    }
  }
  return deck;
}

function shuffleDeck(deck) {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// ─── Policy Helpers ───────────────────────────────────────────────────────────

function getPlayerDrain(player) {
  let drain = 10; // base drain
  for (const p of (player.policies || [])) {
    if (p.effect === 'reduce_drain') drain -= p.amount;
    if (p.effect === 'increase_drain') drain += p.amount;
    if (p.effect === 'extra_damage') drain += p.amount;
  }
  return Math.max(0, drain);
}

function getPlayerExtraDraw(player) {
  let extra = 0;
  for (const p of (player.policies || [])) {
    if (p.effect === 'extra_draw') extra += p.amount;
  }
  return extra;
}

function getPlayerHealBonus(player) {
  let bonus = 0;
  for (const p of (player.policies || [])) {
    if (p.effect === 'bonus_recovery') bonus += p.amount;
    if (p.effect === 'reduce_recovery') bonus -= p.amount;
  }
  return bonus;
}

function getPlayerTurnHeal(player) {
  let heal = 0;
  for (const p of (player.policies || [])) {
    if (p.effect === 'heal_on_turn') heal += p.amount;
  }
  return heal;
}

function isHolidayBlocked(player) {
  return (player.policies || []).some(p => p.effect === 'block_holiday');
}

function canPlayPolicy(player) {
  return (player.policies || []).length < 2;
}

module.exports = { CARDS, buildDeck, shuffleDeck, getPlayerDrain, getPlayerExtraDraw, getPlayerHealBonus, getPlayerTurnHeal, isHolidayBlocked, canPlayPolicy };
