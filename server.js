const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { buildDeck, shuffleDeck } = require('./cards');

// ============== RAW WEBSOCKET SERVER ==============
class WebSocketServer {
  constructor(server) {
    this.clients = new Map();
    server.on('upgrade', (req, socket, head) => this.handleUpgrade(req, socket, head));
  }

  handleUpgrade(req, socket, head) {
    if (req.url !== '/ws') { socket.destroy(); return; }
    const key = req.headers['sec-websocket-key'];
    if (!key) { socket.destroy(); return; }
    const acceptKey = crypto.createHash('sha1')
      .update(key + '258EAFA5-E914-47DA-95CA-5AB9FC6B882E').digest('base64');
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\nConnection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${acceptKey}\r\n\r\n`
    );
    const clientId = crypto.randomUUID();
    const client = { socket, id: clientId, roomCode: null, playerName: null };
    this.clients.set(clientId, client);
    socket.on('data', (buf) => this.handleData(client, buf));
    socket.on('close', () => this.handleClose(client));
    socket.on('error', () => this.handleClose(client));
    this.send(client, { type: 'connected', id: clientId });
  }

  handleData(client, buffer) {
    const frames = this.decodeFrames(buffer);
    for (const frame of frames) {
      if (frame === null) { client.socket.end(); return; }
      try { this.onMessage(client, JSON.parse(frame)); } catch (e) {}
    }
  }

  decodeFrames(buffer) {
    const frames = []; let offset = 0;
    while (offset < buffer.length) {
      if (offset + 2 > buffer.length) break;
      const opcode = buffer[offset] & 0x0f;
      const masked = (buffer[offset + 1] & 0x80) !== 0;
      let len = buffer[offset + 1] & 0x7f; offset += 2;
      if (opcode === 0x08) { frames.push(null); break; }
      if (len === 126) { if (offset+2>buffer.length) break; len = buffer.readUInt16BE(offset); offset+=2; }
      else if (len === 127) { if (offset+8>buffer.length) break; len = Number(buffer.readBigUInt64BE(offset)); offset+=8; }
      let mask = null;
      if (masked) { if (offset+4>buffer.length) break; mask = buffer.slice(offset, offset+4); offset+=4; }
      if (offset+len > buffer.length) break;
      const payload = buffer.slice(offset, offset+len);
      if (mask) { for (let i=0;i<payload.length;i++) payload[i]^=mask[i%4]; }
      offset += len;
      if (opcode === 0x01) frames.push(payload.toString('utf8'));
    }
    return frames;
  }

  send(client, data) {
    try { client.socket.write(this.encodeFrame(Buffer.from(JSON.stringify(data),'utf8'))); } catch(e){}
  }

  encodeFrame(buf) {
    let header;
    if (buf.length < 126) { header = Buffer.alloc(2); header[0]=0x81; header[1]=buf.length; }
    else if (buf.length < 65536) { header = Buffer.alloc(4); header[0]=0x81; header[1]=126; header.writeUInt16BE(buf.length,2); }
    else { header = Buffer.alloc(10); header[0]=0x81; header[1]=127; header.writeBigUInt64BE(BigInt(buf.length),2); }
    return Buffer.concat([header, buf]);
  }

  handleClose(client) { this.clients.delete(client.id); if (client.roomCode) gameManager.playerDisconnect(client); }
  onMessage(client, msg) { gameManager.handleMessage(client, msg); }
  broadcastToRoom(roomCode, data, excludeId = null) {
    for (const [id, c] of this.clients) { if (c.roomCode === roomCode && id !== excludeId) this.send(c, data); }
  }
}



// ============== GAME MANAGER ==============
class GameManager {
  constructor() { this.rooms = new Map(); }

  generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
    if (this.rooms.has(code)) return this.generateRoomCode();
    return code;
  }

  handleMessage(client, msg) {
    switch (msg.type) {
      case 'create_room': this.createRoom(client, msg); break;
      case 'join_room': this.joinRoom(client, msg); break;
      case 'start_game': this.startGame(client); break;
      case 'play_cards': this.playCards(client, msg); break;
      case 'end_turn': this.endTurn(client); break;
      case 'select_target': this.selectTarget(client, msg); break;
      case 'select_card_to_delegate': this.selectCardToDelegate(client, msg); break;
      case 'new_game': this.newGame(client); break;
      case 'leave_room': this.leaveRoom(client); break;
    }
  }

  createRoom(client, msg) {
    const name = (msg.playerName || '').trim();
    if (!name || name.length > 20) { wss.send(client, { type: 'error', message: 'Name must be 1-20 chars' }); return; }
    const roomCode = this.generateRoomCode();
    const room = {
      code: roomCode, host: client.id, state: 'lobby',
      players: [{ id: client.id, name, hp: 100, hand: [], shield: false, skipTurn: false, alive: true }],
      deck: [], discard: [], currentTurn: 0, cardsPlayedThisTurn: 0, drawnThisTurn: false,
      pendingAction: null,
    };
    this.rooms.set(roomCode, room);
    client.roomCode = roomCode; client.playerName = name;
    wss.send(client, { type: 'room_created', roomCode, room: this.getPublicRoom(room, client.id) });
  }

  joinRoom(client, msg) {
    const name = (msg.playerName || '').trim();
    const code = (msg.roomCode || '').trim().toUpperCase();
    if (!name || name.length > 20) { wss.send(client, { type: 'error', message: 'Name must be 1-20 chars' }); return; }
    if (!this.rooms.has(code)) { wss.send(client, { type: 'error', message: 'Room not found' }); return; }
    const room = this.rooms.get(code);
    if (room.state !== 'lobby') { wss.send(client, { type: 'error', message: 'Game already started' }); return; }
    if (room.players.length >= 8) { wss.send(client, { type: 'error', message: 'Room full (max 8)' }); return; }
    if (room.players.some(p => p.name.toLowerCase() === name.toLowerCase())) { wss.send(client, { type: 'error', message: 'Name taken' }); return; }
    room.players.push({ id: client.id, name, hp: 100, hand: [], shield: false, skipTurn: false, alive: true });
    client.roomCode = code; client.playerName = name;
    wss.send(client, { type: 'room_joined', roomCode: code, room: this.getPublicRoom(room, client.id) });
    wss.broadcastToRoom(code, { type: 'player_joined', room: this.getPublicRoom(room, null) }, client.id);
  }


  startGame(client) {
    const room = this.rooms.get(client.roomCode);
    if (!room || room.host !== client.id) return;
    if (room.players.length < 2) { wss.send(client, { type: 'error', message: 'Need at least 2 players' }); return; }

    room.deck = shuffleDeck(buildDeck());
    room.discard = [];
    room.state = 'playing';
    room.currentTurn = 0;
    room.pendingAction = null;

    // Reset all players
    for (const p of room.players) {
      p.hp = 100; p.hand = []; p.shield = false; p.skipTurn = false; p.alive = true;
    }
    // Deal 5 cards to each player
    for (const p of room.players) {
      for (let i = 0; i < 5; i++) {
        const card = this.drawCard(room);
        if (card) p.hand.push(card);
      }
    }

    this.startTurn(room);
  }

  startTurn(room) {
    const player = room.players[room.currentTurn];
    if (!player.alive) { this.nextTurn(room); return; }

    // Check skip turn (from Sick Leave)
    if (player.skipTurn) {
      player.skipTurn = false;
      wss.broadcastToRoom(room.code, { type: 'turn_skipped', playerName: player.name, room: this.getPublicRoom(room, null) });
      setTimeout(() => this.nextTurn(room), 1500);
      return;
    }

    // Lose 5 HP (burnout drain)
    player.hp -= 5;
    room.cardsPlayedThisTurn = 0;
    room.drawnThisTurn = false;

    // Check death
    if (player.hp <= 0) {
      player.hp = 0; player.alive = false;
      wss.broadcastToRoom(room.code, { type: 'player_eliminated', playerName: player.name, room: this.getPublicRoom(room, null) });
      if (this.checkWin(room)) return;
      setTimeout(() => this.nextTurn(room), 1500);
      return;
    }

    // Draw 2 cards
    for (let i = 0; i < 2; i++) {
      const card = this.drawCard(room);
      if (card) player.hand.push(card);
    }
    room.drawnThisTurn = true;

    // Notify all players about new turn
    this.broadcastGameState(room);
  }

  drawCard(room) {
    if (room.deck.length === 0) {
      if (room.discard.length === 0) return null;
      room.deck = shuffleDeck(room.discard);
      room.discard = [];
    }
    return room.deck.pop();
  }

  playCards(client, msg) {
    const room = this.rooms.get(client.roomCode);
    if (!room || room.state !== 'playing') return;
    const player = room.players[room.currentTurn];
    if (player.id !== client.id) { wss.send(client, { type: 'error', message: 'Not your turn' }); return; }
    if (room.cardsPlayedThisTurn >= 3) { wss.send(client, { type: 'error', message: 'Max 3 cards per turn' }); return; }

    const cardUid = msg.cardUid;
    const cardIndex = player.hand.findIndex(c => c.uid === cardUid);
    if (cardIndex === -1) { wss.send(client, { type: 'error', message: 'Card not in hand' }); return; }

    const card = player.hand[cardIndex];

    // Handle different card types
    if (card.category === 'recovery') {
      player.hand.splice(cardIndex, 1);
      player.hp = Math.min(100, player.hp + card.hp);
      if (card.skipNextTurn) player.skipTurn = true;
      room.cardsPlayedThisTurn++;
      room.discard.push(card);
      wss.broadcastToRoom(room.code, { type: 'card_played', playerName: player.name, card: { name: card.name, hp: card.hp, category: card.category }, room: this.getPublicRoom(room, null) });
      this.broadcastGameState(room);
    } else if (card.category === 'damage') {
      // Damage cards hurt yourself - you'd normally want to delegate these
      player.hand.splice(cardIndex, 1);
      player.hp = Math.max(0, player.hp + card.hp);
      room.cardsPlayedThisTurn++;
      room.discard.push(card);
      wss.broadcastToRoom(room.code, { type: 'card_played', playerName: player.name, card: { name: card.name, hp: card.hp, category: card.category }, room: this.getPublicRoom(room, null) });
      if (player.hp <= 0) { player.alive = false; wss.broadcastToRoom(room.code, { type: 'player_eliminated', playerName: player.name }); this.checkWin(room); return; }
      this.broadcastGameState(room);
    } else if (card.category === 'action') {
      this.playActionCard(room, player, card, cardIndex, client);
    }
  }


  playActionCard(room, player, card, cardIndex, client) {
    const alivePlayers = room.players.filter(p => p.alive && p.id !== player.id);
    switch (card.actionType) {
      case 'delegate':
        // Need to select target AND a damage card from hand
        const damageCards = player.hand.filter(c => c.category === 'damage' && c.uid !== card.uid);
        if (damageCards.length === 0) { wss.send(client, { type: 'error', message: 'No damage cards to delegate' }); return; }
        room.pendingAction = { type: 'delegate', cardUid: card.uid, cardIndex, playerId: player.id };
        wss.send(client, { type: 'select_target', action: 'delegate', targets: alivePlayers.map(p => p.name), damageCards: damageCards.map(c => ({ uid: c.uid, name: c.name, hp: c.hp })) });
        break;
      case 'steal':
        room.pendingAction = { type: 'steal', cardUid: card.uid, cardIndex, playerId: player.id, amount: card.amount };
        wss.send(client, { type: 'select_target', action: 'steal', targets: alivePlayers.map(p => p.name) });
        break;
      case 'shield':
        player.hand.splice(cardIndex, 1);
        player.shield = true;
        room.cardsPlayedThisTurn++;
        room.discard.push(card);
        wss.broadcastToRoom(room.code, { type: 'card_played', playerName: player.name, card: { name: card.name, category: 'action', description: 'Shield activated!' } });
        this.broadcastGameState(room);
        break;
      case 'peek':
        room.pendingAction = { type: 'peek', cardUid: card.uid, cardIndex, playerId: player.id };
        wss.send(client, { type: 'select_target', action: 'peek', targets: alivePlayers.map(p => p.name) });
        break;
      case 'draw':
        player.hand.splice(cardIndex, 1);
        for (let i = 0; i < card.amount; i++) { const c = this.drawCard(room); if (c) player.hand.push(c); }
        room.cardsPlayedThisTurn++;
        room.discard.push(card);
        wss.broadcastToRoom(room.code, { type: 'card_played', playerName: player.name, card: { name: card.name, category: 'action', description: 'Drew extra cards!' } });
        this.broadcastGameState(room);
        break;
      case 'heal_all':
        player.hand.splice(cardIndex, 1);
        for (const p of room.players) { if (p.alive) p.hp = Math.min(100, p.hp + card.amount); }
        room.cardsPlayedThisTurn++;
        room.discard.push(card);
        wss.broadcastToRoom(room.code, { type: 'card_played', playerName: player.name, card: { name: card.name, category: 'action', description: 'Everyone heals +5!' } });
        this.broadcastGameState(room);
        break;
      case 'discard_target':
        room.pendingAction = { type: 'discard_target', cardUid: card.uid, cardIndex, playerId: player.id, amount: card.amount };
        wss.send(client, { type: 'select_target', action: 'layoff', targets: alivePlayers.map(p => p.name) });
        break;
      case 'skip_drain':
        player.hand.splice(cardIndex, 1);
        player.hp = Math.min(100, player.hp + 5); // Refund the drain
        room.cardsPlayedThisTurn++;
        room.discard.push(card);
        wss.broadcastToRoom(room.code, { type: 'card_played', playerName: player.name, card: { name: card.name, category: 'action', description: 'Skipped burnout drain!' } });
        this.broadcastGameState(room);
        break;
    }
  }

  selectTarget(client, msg) {
    const room = this.rooms.get(client.roomCode);
    if (!room || !room.pendingAction || room.pendingAction.playerId !== client.id) return;
    const action = room.pendingAction;
    const player = room.players.find(p => p.id === client.id);
    const target = room.players.find(p => p.name === msg.targetName && p.alive);
    if (!target) { wss.send(client, { type: 'error', message: 'Invalid target' }); return; }

    const card = player.hand.find(c => c.uid === action.cardUid);
    if (!card) { room.pendingAction = null; return; }
    const cardIndex = player.hand.indexOf(card);

    switch (action.type) {
      case 'steal':
        if (target.shield) {
          target.shield = false;
          wss.broadcastToRoom(room.code, { type: 'action_blocked', playerName: player.name, targetName: target.name, action: 'Steal Lunch' });
        } else {
          const stolen = Math.min(action.amount, target.hp);
          target.hp -= stolen;
          player.hp = Math.min(100, player.hp + stolen);
          wss.broadcastToRoom(room.code, { type: 'card_played', playerName: player.name, card: { name: 'Steal Lunch', category: 'action', description: `Stole ${stolen} HP from ${target.name}!` } });
          if (target.hp <= 0) { target.alive = false; wss.broadcastToRoom(room.code, { type: 'player_eliminated', playerName: target.name }); }
        }
        player.hand.splice(cardIndex, 1);
        room.cardsPlayedThisTurn++;
        room.discard.push(card);
        room.pendingAction = null;
        if (this.checkWin(room)) return;
        this.broadcastGameState(room);
        break;
      case 'peek':
        player.hand.splice(cardIndex, 1);
        room.cardsPlayedThisTurn++;
        room.discard.push(card);
        room.pendingAction = null;
        wss.send(client, { type: 'peek_result', targetName: target.name, hand: target.hand.map(c => ({ name: c.name, category: c.category, hp: c.hp })) });
        wss.broadcastToRoom(room.code, { type: 'card_played', playerName: player.name, card: { name: 'Networking', category: 'action', description: `Peeked at ${target.name}'s hand!` } });
        this.broadcastGameState(room);
        break;
      case 'discard_target':
        if (target.hand.length > 0) {
          const discardCount = Math.min(action.amount, target.hand.length);
          for (let i = 0; i < discardCount; i++) {
            const rIdx = Math.floor(Math.random() * target.hand.length);
            room.discard.push(target.hand.splice(rIdx, 1)[0]);
          }
        }
        player.hand.splice(cardIndex, 1);
        room.cardsPlayedThisTurn++;
        room.discard.push(card);
        room.pendingAction = null;
        wss.broadcastToRoom(room.code, { type: 'card_played', playerName: player.name, card: { name: 'Layoff', category: 'action', description: `${target.name} lost cards!` } });
        this.broadcastGameState(room);
        break;
      case 'delegate':
        // Wait for card selection via selectCardToDelegate
        room.pendingAction.targetId = target.id;
        room.pendingAction.targetName = target.name;
        const dmgCards = player.hand.filter(c => c.category === 'damage' && c.uid !== action.cardUid);
        wss.send(client, { type: 'select_damage_card', targetName: target.name, damageCards: dmgCards.map(c => ({ uid: c.uid, name: c.name, hp: c.hp })) });
        break;
    }
  }


  selectCardToDelegate(client, msg) {
    const room = this.rooms.get(client.roomCode);
    if (!room || !room.pendingAction || room.pendingAction.type !== 'delegate') return;
    const action = room.pendingAction;
    const player = room.players.find(p => p.id === client.id);
    const target = room.players.find(p => p.id === action.targetId);
    if (!target || !target.alive) { room.pendingAction = null; return; }

    const delegateCard = player.hand.find(c => c.uid === action.cardUid);
    const damageCard = player.hand.find(c => c.uid === msg.damageCardUid && c.category === 'damage');
    if (!delegateCard || !damageCard) { wss.send(client, { type: 'error', message: 'Invalid card' }); room.pendingAction = null; return; }

    if (target.shield) {
      target.shield = false;
      wss.broadcastToRoom(room.code, { type: 'action_blocked', playerName: player.name, targetName: target.name, action: 'Delegate' });
    } else {
      target.hp = Math.max(0, target.hp + damageCard.hp);
      wss.broadcastToRoom(room.code, { type: 'card_played', playerName: player.name, card: { name: 'Delegate', category: 'action', description: `Delegated ${damageCard.name} (${damageCard.hp} HP) to ${target.name}!` } });
      if (target.hp <= 0) { target.alive = false; wss.broadcastToRoom(room.code, { type: 'player_eliminated', playerName: target.name }); }
    }

    player.hand = player.hand.filter(c => c.uid !== delegateCard.uid && c.uid !== damageCard.uid);
    room.cardsPlayedThisTurn++;
    room.discard.push(delegateCard, damageCard);
    room.pendingAction = null;
    if (this.checkWin(room)) return;
    this.broadcastGameState(room);
  }

  endTurn(client) {
    const room = this.rooms.get(client.roomCode);
    if (!room || room.state !== 'playing') return;
    const player = room.players[room.currentTurn];
    if (player.id !== client.id) return;

    // Discard down to 5
    while (player.hand.length > 5) {
      const idx = player.hand.length - 1;
      room.discard.push(player.hand.splice(idx, 1)[0]);
    }

    room.pendingAction = null;
    this.nextTurn(room);
  }

  nextTurn(room) {
    const alivePlayers = room.players.filter(p => p.alive);
    if (alivePlayers.length <= 1) { this.checkWin(room); return; }

    let next = (room.currentTurn + 1) % room.players.length;
    let tries = 0;
    while (!room.players[next].alive && tries < room.players.length) {
      next = (next + 1) % room.players.length;
      tries++;
    }
    room.currentTurn = next;
    this.startTurn(room);
  }

  checkWin(room) {
    const alivePlayers = room.players.filter(p => p.alive);
    if (alivePlayers.length <= 1) {
      room.state = 'finished';
      const winner = alivePlayers[0] || null;
      wss.broadcastToRoom(room.code, {
        type: 'game_over',
        winner: winner ? winner.name : 'Nobody',
        players: room.players.map(p => ({ name: p.name, hp: p.hp, alive: p.alive })),
        room: this.getPublicRoom(room, null)
      });
      return true;
    }
    return false;
  }

  newGame(client) {
    const room = this.rooms.get(client.roomCode);
    if (!room || room.host !== client.id) return;
    room.state = 'lobby';
    room.deck = []; room.discard = []; room.currentTurn = 0; room.pendingAction = null;
    for (const p of room.players) { p.hp = 100; p.hand = []; p.shield = false; p.skipTurn = false; p.alive = true; }
    wss.broadcastToRoom(room.code, { type: 'back_to_lobby', room: this.getPublicRoom(room, null) });
  }

  leaveRoom(client) { this.playerDisconnect(client); }

  playerDisconnect(client) {
    const code = client.roomCode;
    if (!code) return;
    const room = this.rooms.get(code);
    if (!room) return;

    const playerIdx = room.players.findIndex(p => p.id === client.id);
    if (playerIdx === -1) return;
    const playerName = room.players[playerIdx].name;
    room.players[playerIdx].alive = false;
    room.players.splice(playerIdx, 1);
    client.roomCode = null;

    if (room.players.length === 0) { this.rooms.delete(code); return; }
    if (room.host === client.id) room.host = room.players[0].id;

    if (room.state === 'playing') {
      if (room.currentTurn >= room.players.length) room.currentTurn = 0;
      if (!this.checkWin(room)) {
        wss.broadcastToRoom(code, { type: 'player_left', playerName, room: this.getPublicRoom(room, null) });
        this.broadcastGameState(room);
      }
    } else {
      wss.broadcastToRoom(code, { type: 'player_left', playerName, room: this.getPublicRoom(room, null) });
    }
  }

  broadcastGameState(room) {
    for (const p of room.players) {
      const client = wss.clients.get(p.id);
      if (client) {
        wss.send(client, { type: 'game_state', state: this.getPlayerState(room, p.id) });
      }
    }
  }

  getPlayerState(room, playerId) {
    const player = room.players.find(p => p.id === playerId);
    return {
      yourHand: player ? player.hand : [],
      yourHp: player ? player.hp : 0,
      yourShield: player ? player.shield : false,
      isYourTurn: room.players[room.currentTurn]?.id === playerId,
      currentPlayerName: room.players[room.currentTurn]?.name || '',
      cardsPlayed: room.cardsPlayedThisTurn,
      maxCards: 3,
      deckSize: room.deck.length,
      players: room.players.map(p => ({ name: p.name, hp: p.hp, alive: p.alive, shield: p.shield, cardCount: p.hand.length, isYou: p.id === playerId })),
    };
  }

  getPublicRoom(room, forPlayerId) {
    return {
      code: room.code, state: room.state,
      players: room.players.map(p => ({ name: p.name, hp: p.hp, alive: p.alive, isHost: p.id === room.host, isYou: p.id === forPlayerId })),
      isHost: forPlayerId === room.host,
    };
  }
}


// ============== HTTP SERVER ==============
const MIME = { '.html':'text/html','.css':'text/css','.js':'application/javascript','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon' };

const server = http.createServer((req, res) => {
  let filePath = req.url === '/' ? '/index.html' : req.url;
  filePath = path.join(__dirname, 'public', filePath);
  const ext = path.extname(filePath);
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not Found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

const gameManager = new GameManager();
const wss = new WebSocketServer(server);

// Cleanup stale rooms every 30 min
setInterval(() => {
  for (const [code, room] of gameManager.rooms) {
    const hasConnected = room.players.some(p => wss.clients.has(p.id));
    if (!hasConnected) gameManager.rooms.delete(code);
  }
}, 30 * 60 * 1000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Burnout game running on http://localhost:${PORT}`));
