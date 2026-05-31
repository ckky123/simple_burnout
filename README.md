# 🔥 Burnout — Corporate Survival Card Game

> Everyone works. Not everyone survives.

A multiplayer party card game where you try to outlast your coworkers in a toxic corporate environment. Play recovery cards to heal, delegate damage to others, and deploy policies to gain an edge.

**Live:** [simple-burnout.onrender.com](https://simple-burnout.onrender.com)

---

## Tech Stack

- **Backend:** Node.js + Express + Socket.IO
- **Frontend:** Vanilla HTML/CSS/JS
- **Testing:** Vitest (100% line coverage on game logic)
- **Hosting:** Render.com (free tier)

---

## How to Play

### Setup
- 2–8 players (bots available for solo play)
- Everyone starts with **100 HP**
- Each player is dealt **5 cards**

### Turn Flow

```
┌─────────────────────────────────────────┐
│ YOUR TURN                               │
├─────────────────────────────────────────┤
│ 1. Lose HP (burnout drain: 10 base)     │
│ 2. Policy effects apply                 │
│ 3. Force play 1 damage card (if in hand)│
│ 4. Draw 2 cards (+policy bonus)         │
│ 5. Play up to 3 cards                   │
│ 6. Discard down to 5 if over limit      │
│ 7. End turn → next player               │
└─────────────────────────────────────────┘
```

### Win Condition
**Last player standing wins.** If your HP hits 0, you're eliminated (burned out).

---

## Card Categories

### 🟢 Recovery Cards (36 cards)

Heal yourself. Affected by policy modifiers.

| Card | HP | Copies | Notes |
|---|---|---|---|
| Holiday | +25 | 2 | Blocked by PTO Denied policy |
| Good Sleep | +15 | 3 | |
| Spa Day | +15 | 2 | |
| Massage | +15 | 2 | |
| Yoga | +10 | 3 | |
| Running | +10 | 3 | |
| Cycling | +10 | 2 | |
| Hiking | +10 | 2 | |
| Movie Night | +10 | 3 | |
| Board Game Night | +10 | 2 | |
| Nice Dinner | +10 | 3 | |
| Social | +5 | 3 | |
| Afternoon Tea | +5 | 4 | |
| Sick Leave | +20 | 2 | Skip next turn |

### 🔴 Damage Cards (20 cards)

Hurt you. **Forced to play one per turn** if in your hand. Use Delegate to pass them to others!

| Card | HP | Copies | Notes |
|---|---|---|---|
| Overtime | -30 | 3 | Devastating |
| Crunch Week | -20 | 3 | |
| Toxic Manager | -20 | 2 | |
| Long Meeting | -15 | 4 | |
| Performance Review | -10 | 4 | |
| Monday Blues | -10 | 4 | |

### 🔵 Action Cards (24 cards)

Interactive cards that affect other players.

| Card | Effect | Copies |
|---|---|---|
| Delegate | Give 1 damage card to another player | 4 |
| Steal Lunch | Steal 10 HP from another player | 3 |
| Boundaries | Block next Delegate or Steal targeting you (shield) | 4 |
| Networking | Look at another player's hand | 3 |
| Coffee Run | Draw 2 extra cards this turn | 3 |
| Team Building | All players heal +5 HP | 2 |
| Layoff | Target player discards 2 random cards | 2 |
| Quiet Quitting | Skip your HP drain this turn (refund 10 HP) | 3 |

### 🟡 Policy Cards (16 cards)

Permanent effects played in front of you. **Max 2 policies per player.**

#### Positive Policies

| Card | Effect | Copies |
|---|---|---|
| Work-Life Balance ⚖️ | Burnout drain reduced by 5 each turn | 2 |
| Flexible Hours 🕐 | Gain 5 HP at start of your turn | 2 |
| Four-Day Week 📅 | Draw 1 extra card each turn | 2 |
| Gym Membership 💪 | Gain 5 extra HP whenever you recover | 2 |

#### Negative Policies

| Card | Effect | Copies |
|---|---|---|
| Micromanagement 🔍 | Burnout drain increased by 5 | 2 |
| Toxic Workplace ☠️ | Lose 5 extra HP each turn | 2 |
| KPI Pressure 📊 | Recovery cards heal 5 less | 2 |
| PTO Denied 🚫 | Holiday cards have no effect | 2 |

### ⚡ Reaction Cards (15 cards)

Can be played **immediately during another player's turn**. Only one reaction per card.

| Card | Trigger | Effect | Copies |
|---|---|---|---|
| Email While on Holiday 📧 | Someone plays Holiday | Cancel their Holiday | 2 |
| Urgent Meeting 🚨 | Someone recovers HP | Reduce their recovery by 10 | 2 |
| Weekend Call 📱 | Someone recovers HP | They lose 10 HP after recovery | 2 |
| Not My Job 🙅 | You are targeted | Cancel the card | 3 |
| Can You Cover For Me? 🔄 | You are targeted | Redirect card to another player | 2 |
| Reply All 📨 | Any action card played | Copy it with a new target | 2 |

### 💣 Chaos Cards (6 cards)

Very rare (1 copy each). Game-changing effects.

| Card | Effect | Copies |
|---|---|---|
| Mass Layoff 💣 | Everyone loses 50 HP | 1 |
| Budget Cuts 💸 | Everyone loses 20 HP | 1 |
| Corporate Restructure 🏢 | Everyone loses 30 HP | 1 |
| Corporate Merger 🤝 | Combine two players' hands, shuffle, deal evenly | 1 |
| Knowledge Transfer 🔀 | Two players exchange hands | 1 |
| Economic Downturn 📉 | All recovery halved until your next turn | 1 |

---

## Deck Composition

| Category | Cards | Percentage |
|---|---|---|
| Recovery (Green) | 36 | 33% |
| Damage (Red) | 20 | 18% |
| Action (Blue) | 24 | 22% |
| Policy (Yellow) | 16 | 15% |
| Reaction (Purple) | 15 | 14% |
| Chaos (Black) | 6 | 5% |
| **Total** | **117** | **100%** |

---

## Balance Math

### Survival Without Playing Cards
- 100 HP ÷ 10 per turn = **10 turns** (dead by turn 10)
- With forced damage cards, could be faster

### Average Turn (Playing Cards)
- Draw 2 cards → likely 1 recovery + 1 other
- Average recovery: ~+10 HP
- Net per turn: -10 (drain) + 10 (heal) = **0 HP** (break even)
- Skilled players survive longer through strategy

### Aggression Balance
- Delegate + Overtime = -30 HP to target (brutal but blockable with Boundaries)
- Steal Lunch = -10/+10 swing (20 HP difference)
- Players need 2-3 big hits + natural drain to die
- Games last ~10-20 turns (15-30 min for 4-6 players)

---

## Player Count

| Players | Game Length | Fun Level |
|---|---|---|
| 2 (with bots) | ~10 min | Good for testing |
| 3-4 | 15-20 min | Good |
| 4-6 | 20-30 min | Best |
| 7-8 | 30-40 min | More chaos |

---

## Run Locally

```bash
npm install
npm start
```

Open `http://localhost:3000`. Add bots in the lobby to play solo.

## Run Tests

```bash
npm test              # Run once
npm run test:watch    # Watch mode
npm run test:coverage # With coverage report
```

## Deploy to Render

1. Push to GitHub
2. Render.com → New → Web Service
3. Connect repo, Build: `npm install`, Start: `npm start`
4. Deploy (free tier works fine)

---

## Strategy Tips

- **Hold Delegate cards** — they let you pass damage cards to others instead of taking the hit yourself
- **Boundaries is your best friend** — blocks Delegate and Steal
- **Positive policies early** — Work-Life Balance or Flexible Hours compound over many turns
- **Play negative policies on others** — Micromanagement on the leader is devastating
- **Save Chaos cards** — Mass Layoff when you're ahead can seal the game
- **Don't hoard damage cards** — you're forced to play one per turn anyway
