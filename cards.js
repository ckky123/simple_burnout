// Burnout Card Game - Card Definitions

const CARDS = {
  recovery: [
    { id: 'holiday', name: 'Holiday', hp: 25, description: 'Take a well-deserved vacation!', copies: 2 },
    { id: 'good_sleep', name: 'Good Sleep', hp: 15, description: 'A full 8 hours of uninterrupted rest.', copies: 3 },
    { id: 'spa', name: 'Spa Day', hp: 15, description: 'Full body relaxation and rejuvenation.', copies: 2 },
    { id: 'massage', name: 'Massage', hp: 15, description: 'Deep tissue stress relief.', copies: 2 },
    { id: 'yoga', name: 'Yoga', hp: 10, description: 'Namaste your stress away.', copies: 3 },
    { id: 'running', name: 'Running', hp: 10, description: "Runner's high kicks in!", copies: 3 },
    { id: 'cycling', name: 'Cycling', hp: 10, description: 'Fresh air and freedom on two wheels.', copies: 2 },
    { id: 'hiking', name: 'Hiking', hp: 10, description: 'Nature heals the soul.', copies: 2 },
    { id: 'movie_night', name: 'Movie Night', hp: 10, description: 'Popcorn, couch, zero responsibilities.', copies: 3 },
    { id: 'board_game', name: 'Board Game Night', hp: 10, description: 'Analog fun with friends.', copies: 2 },
    { id: 'nice_dinner', name: 'Nice Dinner', hp: 10, description: 'Good food, good mood.', copies: 3 },
    { id: 'social', name: 'Social', hp: 5, description: 'Catching up with friends over coffee.', copies: 3 },
    { id: 'afternoon_tea', name: 'Afternoon Tea', hp: 5, description: 'A small moment of peace.', copies: 4 },
    { id: 'sick_leave', name: 'Sick Leave', hp: 20, description: 'Doctor says rest. Skip next turn.', copies: 2, skipNextTurn: true },
  ],
  damage: [
    { id: 'overtime', name: 'Overtime', hp: -30, description: '"We need this by tomorrow."', copies: 3 },
    { id: 'crunch_week', name: 'Crunch Week', hp: -20, description: 'Deadlines everywhere. No escape.', copies: 3 },
    { id: 'toxic_manager', name: 'Toxic Manager', hp: -20, description: '"Per my last email..."', copies: 2 },
    { id: 'long_meeting', name: 'Long Meeting', hp: -15, description: 'This could have been an email.', copies: 4 },
    { id: 'performance_review', name: 'Performance Review', hp: -10, description: '"Let\'s discuss your growth areas."', copies: 4 },
    { id: 'monday_blues', name: 'Monday Blues', hp: -10, description: 'The weekend was too short.', copies: 4 },
  ],
  action: [
    { id: 'delegate', name: 'Delegate', description: 'Give 1 damage card to another player.', copies: 4, actionType: 'delegate' },
    { id: 'steal_lunch', name: 'Steal Lunch', description: 'Steal 10 HP from another player.', copies: 3, actionType: 'steal', amount: 10 },
    { id: 'boundaries', name: 'Boundaries', description: 'Block the next Delegate or Steal targeting you.', copies: 4, actionType: 'shield' },
    { id: 'networking', name: 'Networking', description: "Look at another player's hand.", copies: 3, actionType: 'peek' },
    { id: 'coffee_run', name: 'Coffee Run', description: 'Draw 2 extra cards this turn.', copies: 3, actionType: 'draw', amount: 2 },
    { id: 'team_building', name: 'Team Building', description: 'All players heal +5 HP.', copies: 2, actionType: 'heal_all', amount: 5 },
    { id: 'layoff', name: 'Layoff', description: 'Target player discards 2 random cards.', copies: 2, actionType: 'discard_target', amount: 2 },
    { id: 'quiet_quitting', name: 'Quiet Quitting', description: 'Skip your HP drain this turn.', copies: 3, actionType: 'skip_drain' },
  ]
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
          hp: card.hp || 0,
          description: card.description,
          actionType: card.actionType || null,
          amount: card.amount || 0,
          skipNextTurn: card.skipNextTurn || false,
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

module.exports = { CARDS, buildDeck, shuffleDeck };
