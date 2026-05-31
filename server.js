const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { buildDeck, shuffleDeck, getPlayerDrain, getPlayerExtraDraw, getPlayerHealBonus, getPlayerTurnHeal, isHolidayBlocked, canPlayPolicy } = require('./cards');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// ============== GAME MANAGER ==============
const rooms = new Map();

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  if (rooms.has(code)) return generateRoomCode();
  return code;
}

function drawCard(room) {
  if (room.deck.length === 0) {
    if (room.discard.length === 0) return null;
    room.deck = shuffleDeck(room.discard);
    room.discard = [];
  }
  return room.deck.pop();
}

function getPublicRoom(room, forPlayerId) {
  return {
    code: room.code, state: room.state,
    players: room.players.map(p => ({ name: p.name, hp: p.hp, alive: p.alive, isHost: p.id === room.host, isYou: p.id === forPlayerId, isBot: p.isBot || false })),
    isHost: forPlayerId === room.host,
  };
}

function getPlayerState(room, playerId) {
  const player = room.players.find(p => p.id === playerId);
  return {
    yourHand: player ? player.hand : [],
    yourHp: player ? player.hp : 0,
    yourShield: player ? player.shield : false,
    yourPolicies: player ? (player.policies || []) : [],
    isYourTurn: room.players[room.currentTurn]?.id === playerId,
    currentPlayerName: room.players[room.currentTurn]?.name || '',
    cardsPlayed: room.cardsPlayedThisTurn,
    maxCards: 3,
    deckSize: room.deck.length,
    players: room.players.map(p => ({ name: p.name, hp: p.hp, alive: p.alive, shield: p.shield, cardCount: p.hand.length, isYou: p.id === playerId, policies: (p.policies || []).map(pol => ({ name: pol.name, emoji: pol.emoji, policyType: pol.policyType })) })),
    globalEffects: room.globalEffects || {},
  };
}

function broadcastGameState(room) {
  for (const p of room.players) {
    if (p.isBot) continue;
    io.to(p.id).emit('game_state', { state: getPlayerState(room, p.id) });
  }
}

function checkWin(room) {
  const alivePlayers = room.players.filter(p => p.alive);
  if (alivePlayers.length <= 1) {
    room.state = 'finished';
    const winner = alivePlayers[0] || null;
    io.to(room.code).emit('game_over', {
      winner: winner ? winner.name : 'Nobody',
      players: room.players.map(p => ({ name: p.name, hp: p.hp, alive: p.alive })),
    });
    return true;
  }
  return false;
}

function nextTurn(room) {
  const alivePlayers = room.players.filter(p => p.alive);
  if (alivePlayers.length <= 1) { checkWin(room); return; }
  let next = (room.currentTurn + 1) % room.players.length;
  let tries = 0;
  while (!room.players[next].alive && tries < room.players.length) {
    next = (next + 1) % room.players.length;
    tries++;
  }
  room.currentTurn = next;
  startTurn(room);
}

function startTurn(room) {
  const player = room.players[room.currentTurn];
  if (!player.alive) { nextTurn(room); return; }

  if (player.skipTurn) {
    player.skipTurn = false;
    io.to(room.code).emit('turn_skipped', { playerName: player.name });
    setTimeout(() => nextTurn(room), 1500);
    return;
  }

  room.cardsPlayedThisTurn = 0;

  // Clear expired global effects
  if (room.globalEffects && room.globalEffects.halveRecoveryUntil === player.id) {
    room.globalEffects.halveRecovery = false;
    room.globalEffects.halveRecoveryUntil = null;
  }

  // 1. Burnout drain
  const drain = getPlayerDrain(player);
  player.hp -= drain;

  // Apply turn heal from policies (Flexible Hours)
  const turnHeal = getPlayerTurnHeal(player);
  if (turnHeal > 0) player.hp = Math.min(100, player.hp + turnHeal);

  if (player.hp <= 0) {
    player.hp = 0; player.alive = false;
    broadcastGameState(room);
    setTimeout(() => {
      io.to(room.code).emit('turn_start_sequence', { playerName: player.name, drain, drawnCount: 0, forcedCard: null });
      io.to(room.code).emit('player_eliminated', { playerName: player.name });
      checkWin(room);
      if (room.state === 'playing') setTimeout(() => nextTurn(room), 2000);
    }, 500);
    return;
  }

  // 2. Draw cards (2 base + policy bonus)
  const totalDraw = 2 + getPlayerExtraDraw(player);
  const drawnCards = [];
  for (let i = 0; i < totalDraw; i++) { const c = drawCard(room); if (c) { player.hand.push(c); drawnCards.push(c); } }

  // 3. Force play one damage card if in hand
  const dmgIdx = player.hand.findIndex(c => c && c.category === 'damage');
  let forcedCard = null;
  if (dmgIdx !== -1) {
    forcedCard = player.hand.splice(dmgIdx, 1)[0];
    player.hp = Math.max(0, player.hp + forcedCard.hp);
    room.discard.push(forcedCard);
    if (player.hp <= 0) {
      player.alive = false;
      broadcastGameState(room);
      setTimeout(() => {
        io.to(room.code).emit('turn_start_sequence', {
          playerName: player.name, drain, drawnCount: drawnCards.length,
          forcedCard: { name: forcedCard.name, hp: forcedCard.hp, emoji: forcedCard.emoji, description: forcedCard.description },
        });
        io.to(room.code).emit('player_eliminated', { playerName: player.name });
        checkWin(room);
        if (room.state === 'playing') setTimeout(() => nextTurn(room), 2000);
      }, 500);
      return;
    }
  }

  if (player.isBot) {
    broadcastGameState(room);
    if (forcedCard) {
      setTimeout(() => {
        io.to(room.code).emit('forced_card', { playerName: player.name, card: { name: forcedCard.name, hp: forcedCard.hp, category: 'damage', description: forcedCard.description, emoji: forcedCard.emoji } });
      }, 800);
    }
    setTimeout(() => botPlayTurn(room, player), 1500);
    return;
  }

  broadcastGameState(room);

  // Emit turn_start sequence for anime popups
  setTimeout(() => {
    io.to(room.code).emit('turn_start_sequence', {
      playerName: player.name,
      drain,
      drawnCount: drawnCards.length,
      forcedCard: forcedCard ? { name: forcedCard.name, hp: forcedCard.hp, emoji: forcedCard.emoji, description: forcedCard.description } : null,
    });
  }, 500);
}

function playChaosCard(room, player, card, roomCode) {
  switch (card.chaosType) {
    case 'damage_all':
      for (const p of room.players) {
        if (p.alive) {
          p.hp = Math.max(0, p.hp - card.amount);
          if (p.hp <= 0) { p.alive = false; io.to(roomCode).emit('player_eliminated', { playerName: p.name }); }
        }
      }
      io.to(roomCode).emit('card_played', { playerName: player.name, card: { name: card.name, category: 'chaos', description: `Everyone loses ${card.amount} HP!` } });
      io.to(roomCode).emit('card_effect_popup', { emoji: card.emoji || '💣', name: card.name, hp: -card.amount, category: 'chaos', description: `Everyone loses ${card.amount} HP!`, context: `${player.name} played a CHAOS card!`, shake: true });
      if (checkWin(room)) return;
      broadcastGameState(room);
      break;
    case 'merge_hands': {
      const alive = room.players.filter(p => p.alive && p.id !== player.id);
      if (alive.length < 1) { broadcastGameState(room); return; }
      const target = alive[Math.floor(Math.random() * alive.length)];
      const combined = [...player.hand, ...target.hand].sort(() => Math.random() - 0.5);
      const half = Math.ceil(combined.length / 2);
      player.hand = combined.slice(0, half);
      target.hand = combined.slice(half);
      io.to(roomCode).emit('card_played', { playerName: player.name, card: { name: card.name, category: 'chaos', description: `Merged hands with ${target.name}!` } });
      broadcastGameState(room);
      break;
    }
    case 'swap_hands': {
      const alive = room.players.filter(p => p.alive && p.id !== player.id);
      if (alive.length < 1) { broadcastGameState(room); return; }
      const target = alive[Math.floor(Math.random() * alive.length)];
      const temp = player.hand;
      player.hand = target.hand;
      target.hand = temp;
      io.to(roomCode).emit('card_played', { playerName: player.name, card: { name: card.name, category: 'chaos', description: `Swapped hands with ${target.name}!` } });
      broadcastGameState(room);
      break;
    }
    case 'halve_recovery':
      room.globalEffects = room.globalEffects || {};
      room.globalEffects.halveRecovery = true;
      room.globalEffects.halveRecoveryUntil = player.id;
      io.to(roomCode).emit('card_played', { playerName: player.name, card: { name: card.name, category: 'chaos', description: 'All recovery halved until next turn!' } });
      broadcastGameState(room);
      break;
    default:
      broadcastGameState(room);
  }
}

function botPlayTurn(room, bot) {
  if (!bot.alive || room.state !== 'playing') return;
  let played = 0;

  // Play recovery if HP < 80
  while (played < 3) {
    const idx = bot.hand.findIndex(c => c && c.category === 'recovery' && bot.hp < 80);
    if (idx === -1) break;
    const card = bot.hand.splice(idx, 1)[0];
    bot.hp = Math.min(100, bot.hp + card.hp);
    if (card.skipNextTurn) bot.skipTurn = true;
    room.discard.push(card);
    played++;
    io.to(room.code).emit('card_played', { playerName: bot.name, card: { name: card.name, hp: card.hp, category: 'recovery' } });
  }

  // Play simple action cards
  while (played < 3) {
    // Find a playable action card
    let cardIdx = -1;
    for (let i = 0; i < bot.hand.length; i++) {
      const c = bot.hand[i];
      if (!c || c.category !== 'action') continue;
      if (c.actionType === 'shield' && !bot.shield) { cardIdx = i; break; }
      if (c.actionType === 'draw') { cardIdx = i; break; }
      if (c.actionType === 'skip_drain') { cardIdx = i; break; }
      if (c.actionType === 'steal') { cardIdx = i; break; }
      if (c.actionType === 'delegate' && bot.hand.some(x => x && x.category === 'damage' && x.uid !== c.uid)) { cardIdx = i; break; }
    }
    if (cardIdx === -1) break;

    const card = bot.hand[cardIdx];

    if (card.actionType === 'shield') {
      bot.hand.splice(cardIdx, 1); bot.shield = true; room.discard.push(card); played++;
      io.to(room.code).emit('card_played', { playerName: bot.name, card: { name: card.name, category: 'action', description: 'Shield activated!' } });
    } else if (card.actionType === 'draw') {
      bot.hand.splice(cardIdx, 1);
      for (let j = 0; j < card.amount; j++) { const c = drawCard(room); if (c) bot.hand.push(c); }
      room.discard.push(card); played++;
      io.to(room.code).emit('card_played', { playerName: bot.name, card: { name: card.name, category: 'action', description: 'Drew extra cards!' } });
    } else if (card.actionType === 'skip_drain') {
      bot.hand.splice(cardIdx, 1); bot.hp = Math.min(100, bot.hp + 10); room.discard.push(card); played++;
      io.to(room.code).emit('card_played', { playerName: bot.name, card: { name: card.name, category: 'action', description: 'Skipped burnout!' } });
    } else if (card.actionType === 'steal') {
      const targets = room.players.filter(p => p.alive && p.id !== bot.id);
      if (targets.length === 0) break;
      const target = targets[Math.floor(Math.random() * targets.length)];
      if (target.shield) { target.shield = false; io.to(room.code).emit('action_blocked', { playerName: bot.name, targetName: target.name, action: 'Steal' }); }
      else { const s = Math.min(card.amount, target.hp); target.hp -= s; bot.hp = Math.min(100, bot.hp + s); io.to(room.code).emit('card_played', { playerName: bot.name, card: { name: 'Steal Lunch', category: 'action', description: `Stole ${s} HP from ${target.name}!` } }); if (target.hp <= 0) { target.alive = false; io.to(room.code).emit('player_eliminated', { playerName: target.name }); } }
      bot.hand.splice(cardIdx, 1); room.discard.push(card); played++;
      if (checkWin(room)) return;
    } else if (card.actionType === 'delegate') {
      const dmgIdx = bot.hand.findIndex(c => c && c.category === 'damage' && c.uid !== card.uid);
      const targets = room.players.filter(p => p.alive && p.id !== bot.id);
      if (dmgIdx === -1 || targets.length === 0) break;
      const dmg = bot.hand[dmgIdx];
      const target = targets[Math.floor(Math.random() * targets.length)];
      if (target.shield) { target.shield = false; io.to(room.code).emit('action_blocked', { playerName: bot.name, targetName: target.name, action: 'Delegate' }); }
      else { target.hp = Math.max(0, target.hp + dmg.hp); io.to(room.code).emit('card_played', { playerName: bot.name, card: { name: 'Delegate', category: 'action', description: `Delegated ${dmg.name} to ${target.name}!` } }); if (target.hp <= 0) { target.alive = false; io.to(room.code).emit('player_eliminated', { playerName: target.name }); } }
      bot.hand = bot.hand.filter(c => c.uid !== card.uid && c.uid !== dmg.uid);
      room.discard.push(card, dmg); played++;
      if (checkWin(room)) return;
    } else {
      break; // Unknown action, stop
    }
  }

  while (bot.hand.length > 5) room.discard.push(bot.hand.pop());
  broadcastGameState(room);
  setTimeout(() => nextTurn(room), 1000);
}

// ============== SOCKET.IO ==============
io.on('connection', (socket) => {
  let currentRoom = null;
  let playerName = null;

  socket.on('create_room', (msg) => {
    const name = (msg.playerName || '').trim();
    if (!name || name.length > 20) { socket.emit('error_msg', { message: 'Name must be 1-20 chars' }); return; }
    const code = generateRoomCode();
    const room = {
      code, host: socket.id, state: 'lobby',
      players: [{ id: socket.id, name, hp: 100, hand: [], shield: false, skipTurn: false, alive: true }],
      deck: [], discard: [], currentTurn: 0, cardsPlayedThisTurn: 0, pendingAction: null,
    };
    rooms.set(code, room);
    socket.join(code);
    currentRoom = code; playerName = name;
    socket.emit('room_created', { roomCode: code, room: getPublicRoom(room, socket.id) });
  });

  socket.on('join_room', (msg) => {
    const name = (msg.playerName || '').trim();
    const code = (msg.roomCode || '').trim().toUpperCase();
    if (!name || name.length > 20) { socket.emit('error_msg', { message: 'Name must be 1-20 chars' }); return; }
    if (!rooms.has(code)) { socket.emit('error_msg', { message: 'Room not found' }); return; }
    const room = rooms.get(code);
    if (room.state !== 'lobby') { socket.emit('error_msg', { message: 'Game already started' }); return; }
    if (room.players.length >= 8) { socket.emit('error_msg', { message: 'Room full (max 8)' }); return; }
    if (room.players.some(p => p.name.toLowerCase() === name.toLowerCase())) { socket.emit('error_msg', { message: 'Name taken' }); return; }
    room.players.push({ id: socket.id, name, hp: 100, hand: [], shield: false, skipTurn: false, alive: true });
    socket.join(code);
    currentRoom = code; playerName = name;
    socket.emit('room_joined', { roomCode: code, room: getPublicRoom(room, socket.id) });
    socket.to(code).emit('player_joined', { room: getPublicRoom(room, null) });
  });

  socket.on('add_bot', () => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room || room.host !== socket.id || room.state !== 'lobby' || room.players.length >= 8) return;
    const botNames = ['Bot Karen 🤖', 'Bot Dave 🤖', 'Bot Susan 🤖', 'Bot Mike 🤖', 'Bot Linda 🤖', 'Bot Steve 🤖'];
    const usedNames = room.players.map(p => p.name);
    const botName = botNames.find(n => !usedNames.includes(n)) || `Bot ${room.players.length}`;
    const botId = `bot-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    room.players.push({ id: botId, name: botName, hp: 100, hand: [], shield: false, skipTurn: false, alive: true, isBot: true });
    io.to(currentRoom).emit('player_joined', { room: getPublicRoom(room, null) });
  });

  socket.on('start_game', () => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room || room.host !== socket.id) return;
    if (room.players.length < 2) { socket.emit('error_msg', { message: 'Need at least 2 players' }); return; }

    room.deck = shuffleDeck(buildDeck());
    room.discard = []; room.state = 'playing'; room.currentTurn = 0; room.pendingAction = null;
    for (const p of room.players) { p.hp = 100; p.hand = []; p.shield = false; p.skipTurn = false; p.alive = true; p.policies = []; }
    for (const p of room.players) { for (let i = 0; i < 5; i++) { const c = drawCard(room); if (c) p.hand.push(c); } }
    room.globalEffects = {};
    startTurn(room);
  });

  socket.on('play_cards', (msg) => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room || room.state !== 'playing') return;
    const player = room.players[room.currentTurn];
    if (player.id !== socket.id) { socket.emit('error_msg', { message: 'Not your turn' }); return; }
    if (room.cardsPlayedThisTurn >= 3) { socket.emit('error_msg', { message: 'Max 3 cards per turn' }); return; }

    const cardIndex = player.hand.findIndex(c => c.uid === msg.cardUid);
    if (cardIndex === -1) return;
    const card = player.hand[cardIndex];

    if (card.category === 'recovery') {
      // Check if holiday is blocked by PTO Denied policy
      if (card.id === 'holiday' && isHolidayBlocked(player)) {
        player.hand.splice(cardIndex, 1);
        room.cardsPlayedThisTurn++; room.discard.push(card);
        io.to(currentRoom).emit('card_played', { playerName: player.name, card: { name: card.name, hp: 0, category: 'recovery', description: '(blocked by PTO Denied!)' } });
        broadcastGameState(room);
        return;
      }
      player.hand.splice(cardIndex, 1);
      let healAmount = card.hp + getPlayerHealBonus(player);
      // Global effect: halve recovery
      if (room.globalEffects && room.globalEffects.halveRecovery) healAmount = Math.floor(healAmount / 2);
      healAmount = Math.max(0, healAmount);
      player.hp = Math.min(100, player.hp + healAmount);
      if (card.skipNextTurn) player.skipTurn = true;
      room.cardsPlayedThisTurn++; room.discard.push(card);
      io.to(currentRoom).emit('card_played', { playerName: player.name, card: { name: card.name, hp: healAmount, category: 'recovery' } });
      broadcastGameState(room);
    } else if (card.category === 'policy') {
      // Policy cards
      if (!canPlayPolicy(player)) { socket.emit('error_msg', { message: 'Max 2 policies per player' }); return; }
      player.hand.splice(cardIndex, 1);
      player.policies.push(card);
      room.cardsPlayedThisTurn++; room.discard.push(card);
      io.to(currentRoom).emit('card_played', { playerName: player.name, card: { name: card.name, category: 'policy', description: card.description } });
      broadcastGameState(room);
    } else if (card.category === 'chaos') {
      // Chaos cards
      player.hand.splice(cardIndex, 1);
      room.cardsPlayedThisTurn++; room.discard.push(card);
      playChaosCard(room, player, card, currentRoom);
    } else if (card.category === 'reaction') {
      // Reactions can only be played during other players' turns (handled separately)
      socket.emit('error_msg', { message: 'Reaction cards can only be played in response to other actions' });
      return;
    } else if (card.category === 'damage') {
      player.hand.splice(cardIndex, 1);
      player.hp = Math.max(0, player.hp + card.hp);
      room.cardsPlayedThisTurn++; room.discard.push(card);
      io.to(currentRoom).emit('card_played', { playerName: player.name, card: { name: card.name, hp: card.hp, category: 'damage' } });
      if (player.hp <= 0) { player.alive = false; io.to(currentRoom).emit('player_eliminated', { playerName: player.name }); checkWin(room); return; }
      broadcastGameState(room);
    } else if (card.category === 'action') {
      const alivePlayers = room.players.filter(p => p.alive && p.id !== player.id);
      if (card.actionType === 'delegate') {
        const dmgCards = player.hand.filter(c => c.category === 'damage' && c.uid !== card.uid);
        if (dmgCards.length === 0) { socket.emit('error_msg', { message: 'No damage cards to delegate' }); return; }
        room.pendingAction = { type: 'delegate', cardUid: card.uid, playerId: player.id };
        socket.emit('select_target', { action: 'delegate', targets: alivePlayers.map(p => p.name), damageCards: dmgCards.map(c => ({ uid: c.uid, name: c.name, hp: c.hp })) });
      } else if (card.actionType === 'steal') {
        room.pendingAction = { type: 'steal', cardUid: card.uid, playerId: player.id, amount: card.amount };
        socket.emit('select_target', { action: 'steal', targets: alivePlayers.map(p => p.name) });
      } else if (card.actionType === 'shield') {
        player.hand.splice(cardIndex, 1); player.shield = true; room.cardsPlayedThisTurn++; room.discard.push(card);
        io.to(currentRoom).emit('card_played', { playerName: player.name, card: { name: card.name, category: 'action', description: 'Shield activated!' } });
        broadcastGameState(room);
      } else if (card.actionType === 'peek') {
        room.pendingAction = { type: 'peek', cardUid: card.uid, playerId: player.id };
        socket.emit('select_target', { action: 'peek', targets: alivePlayers.map(p => p.name) });
      } else if (card.actionType === 'draw') {
        player.hand.splice(cardIndex, 1);
        for (let i = 0; i < card.amount; i++) { const c = drawCard(room); if (c) player.hand.push(c); }
        room.cardsPlayedThisTurn++; room.discard.push(card);
        io.to(currentRoom).emit('card_played', { playerName: player.name, card: { name: card.name, category: 'action', description: 'Drew extra cards!' } });
        broadcastGameState(room);
      } else if (card.actionType === 'heal_all') {
        player.hand.splice(cardIndex, 1);
        for (const p of room.players) { if (p.alive) p.hp = Math.min(100, p.hp + card.amount); }
        room.cardsPlayedThisTurn++; room.discard.push(card);
        io.to(currentRoom).emit('card_played', { playerName: player.name, card: { name: card.name, category: 'action', description: 'Everyone heals +5!' } });
        broadcastGameState(room);
      } else if (card.actionType === 'discard_target') {
        room.pendingAction = { type: 'discard_target', cardUid: card.uid, playerId: player.id, amount: card.amount };
        socket.emit('select_target', { action: 'layoff', targets: alivePlayers.map(p => p.name) });
      } else if (card.actionType === 'skip_drain') {
        player.hand.splice(cardIndex, 1); player.hp = Math.min(100, player.hp + 10); room.cardsPlayedThisTurn++; room.discard.push(card);
        io.to(currentRoom).emit('card_played', { playerName: player.name, card: { name: card.name, category: 'action', description: 'Skipped burnout drain!' } });
        broadcastGameState(room);
      }
    }
  });

  socket.on('select_target', (msg) => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room || !room.pendingAction || room.pendingAction.playerId !== socket.id) return;
    const action = room.pendingAction;
    const player = room.players.find(p => p.id === socket.id);
    const target = room.players.find(p => p.name === msg.targetName && p.alive);
    if (!target) return;
    const card = player.hand.find(c => c.uid === action.cardUid);
    if (!card) { room.pendingAction = null; return; }
    const cardIndex = player.hand.indexOf(card);

    if (action.type === 'steal') {
      if (target.shield) { target.shield = false; io.to(currentRoom).emit('action_blocked', { playerName: player.name, targetName: target.name, action: 'Steal Lunch' }); io.to(currentRoom).emit('card_effect_popup', { emoji: '🛡️', name: 'Blocked!', hp: 0, category: 'action', description: 'Boundaries absorbed the attack!', context: `${target.name} blocked ${player.name}'s Steal!` }); }
      else { const s = Math.min(action.amount, target.hp); target.hp -= s; player.hp = Math.min(100, player.hp + s); io.to(currentRoom).emit('card_played', { playerName: player.name, card: { name: 'Steal Lunch', category: 'action', description: `Stole ${s} HP from ${target.name}!` } }); io.to(currentRoom).emit('card_effect_popup', { emoji: '🍱', name: 'Steal Lunch', hp: -s, category: 'action', description: `${player.name} stole lunch!`, context: `${target.name} lost ${s} HP` }); if (target.hp <= 0) { target.alive = false; io.to(currentRoom).emit('player_eliminated', { playerName: target.name }); } }
      player.hand.splice(cardIndex, 1); room.cardsPlayedThisTurn++; room.discard.push(card); room.pendingAction = null;
      if (checkWin(room)) return;
      broadcastGameState(room);
    } else if (action.type === 'peek') {
      player.hand.splice(cardIndex, 1); room.cardsPlayedThisTurn++; room.discard.push(card); room.pendingAction = null;
      socket.emit('peek_result', { targetName: target.name, hand: target.hand.map(c => ({ name: c.name, category: c.category, hp: c.hp })) });
      io.to(currentRoom).emit('card_played', { playerName: player.name, card: { name: 'Networking', category: 'action', description: `Peeked at ${target.name}'s hand!` } });
      broadcastGameState(room);
    } else if (action.type === 'discard_target') {
      const discardCount = Math.min(action.amount, target.hand.length);
      for (let i = 0; i < discardCount; i++) { const rIdx = Math.floor(Math.random() * target.hand.length); room.discard.push(target.hand.splice(rIdx, 1)[0]); }
      player.hand.splice(cardIndex, 1); room.cardsPlayedThisTurn++; room.discard.push(card); room.pendingAction = null;
      io.to(currentRoom).emit('card_played', { playerName: player.name, card: { name: 'Layoff', category: 'action', description: `${target.name} lost cards!` } });
      broadcastGameState(room);
    } else if (action.type === 'delegate') {
      room.pendingAction.targetId = target.id; room.pendingAction.targetName = target.name;
      const dmgCards = player.hand.filter(c => c.category === 'damage' && c.uid !== action.cardUid);
      socket.emit('select_damage_card', { targetName: target.name, damageCards: dmgCards.map(c => ({ uid: c.uid, name: c.name, hp: c.hp })) });
    }
  });

  socket.on('select_card_to_delegate', (msg) => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room || !room.pendingAction || room.pendingAction.type !== 'delegate') return;
    const action = room.pendingAction;
    const player = room.players.find(p => p.id === socket.id);
    const target = room.players.find(p => p.id === action.targetId);
    if (!target || !target.alive) { room.pendingAction = null; return; }
    const delegateCard = player.hand.find(c => c.uid === action.cardUid);
    const damageCard = player.hand.find(c => c.uid === msg.damageCardUid && c.category === 'damage');
    if (!delegateCard || !damageCard) { room.pendingAction = null; return; }

    if (target.shield) { target.shield = false; io.to(currentRoom).emit('action_blocked', { playerName: player.name, targetName: target.name, action: 'Delegate' }); }
    else { target.hp = Math.max(0, target.hp + damageCard.hp); io.to(currentRoom).emit('card_played', { playerName: player.name, card: { name: 'Delegate', category: 'action', description: `Delegated ${damageCard.name} (${damageCard.hp} HP) to ${target.name}!` } }); if (target.hp <= 0) { target.alive = false; io.to(currentRoom).emit('player_eliminated', { playerName: target.name }); } }
    player.hand = player.hand.filter(c => c.uid !== delegateCard.uid && c.uid !== damageCard.uid);
    room.cardsPlayedThisTurn++; room.discard.push(delegateCard, damageCard); room.pendingAction = null;
    if (checkWin(room)) return;
    broadcastGameState(room);
  });

  socket.on('end_turn', () => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room || room.state !== 'playing') return;
    const player = room.players[room.currentTurn];
    if (player.id !== socket.id) return;

    // If hand > 5, ask player to choose which cards to discard
    if (player.hand.length > 5) {
      socket.emit('discard_required', {
        hand: player.hand,
        discardCount: player.hand.length - 5,
      });
      return;
    }

    room.pendingAction = null;
    nextTurn(room);
  });

  socket.on('discard_cards', (msg) => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room || room.state !== 'playing') return;
    const player = room.players[room.currentTurn];
    if (player.id !== socket.id) return;

    const uidsToDiscard = msg.cardUids || [];
    const required = player.hand.length - 5;
    if (uidsToDiscard.length !== required) {
      socket.emit('error_msg', { message: `Select exactly ${required} card(s) to discard` });
      return;
    }

    // Remove selected cards
    for (const uid of uidsToDiscard) {
      const idx = player.hand.findIndex(c => c.uid === uid);
      if (idx !== -1) {
        room.discard.push(player.hand.splice(idx, 1)[0]);
      }
    }

    room.pendingAction = null;
    nextTurn(room);
  });

  socket.on('new_game', () => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room || room.host !== socket.id) return;
    room.state = 'lobby'; room.deck = []; room.discard = []; room.currentTurn = 0; room.pendingAction = null;
    for (const p of room.players) { p.hp = 100; p.hand = []; p.shield = false; p.skipTurn = false; p.alive = true; p.policies = []; }
    io.to(currentRoom).emit('back_to_lobby', { room: getPublicRoom(room, null) });
  });

  socket.on('leave_room', () => handleDisconnect());

  socket.on('disconnect', () => handleDisconnect());

  function handleDisconnect() {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room) return;
    const idx = room.players.findIndex(p => p.id === socket.id);
    if (idx === -1) return;
    const name = room.players[idx].name;
    room.players.splice(idx, 1);
    socket.leave(currentRoom);

    if (room.players.length === 0) { rooms.delete(currentRoom); currentRoom = null; return; }
    if (room.host === socket.id) room.host = room.players[0].id;

    if (room.state === 'playing') {
      if (room.currentTurn >= room.players.length) room.currentTurn = 0;
      if (!checkWin(room)) {
        io.to(currentRoom).emit('player_left', { playerName: name, room: getPublicRoom(room, null) });
        broadcastGameState(room);
      }
    } else {
      io.to(currentRoom).emit('player_left', { playerName: name, room: getPublicRoom(room, null) });
    }
    currentRoom = null;
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Burnout game running on http://localhost:${PORT}`));
