// ============== SOCKET.IO CLIENT ==============
const socket = io();
let myId = null;
let isHost = false;
let currentRoom = null;
let gameState = null;

socket.on('connect', () => { myId = socket.id; console.log('Connected:', myId); });

// ============== MESSAGE HANDLERS ==============
socket.on('room_created', (msg) => { currentRoom = msg.roomCode; isHost = true; showLobby(msg.room); });
socket.on('room_joined', (msg) => { currentRoom = msg.roomCode; isHost = msg.room.isHost; showLobby(msg.room); });
socket.on('player_joined', (msg) => { updateLobby(msg.room); });
socket.on('player_left', (msg) => { updateLobby(msg.room); addLog(`${msg.playerName} left`, 'system'); });
socket.on('game_state', (msg) => { gameState = msg.state; renderGame(); });
socket.on('card_played', (msg) => { addLog(`${msg.playerName} played ${msg.card.name}${msg.card.hp ? ' ('+formatHp(msg.card.hp)+')' : ''} ${msg.card.description||''}`, msg.card.category); });
socket.on('action_blocked', (msg) => { addLog(`${msg.targetName} blocked ${msg.playerName}'s ${msg.action} with Boundaries!`, 'system'); });
socket.on('player_eliminated', (msg) => { addLog(`${msg.playerName} has burned out! Eliminated.`, 'damage'); });
socket.on('turn_skipped', (msg) => { addLog(`${msg.playerName}'s turn skipped (Sick Leave)`, 'system'); });
socket.on('select_target', (msg) => { showTargetModal(msg); });
socket.on('select_damage_card', (msg) => { showDamageCardModal(msg); });
socket.on('peek_result', (msg) => { showPeekModal(msg); });
socket.on('game_over', (msg) => { showGameOver(msg); });
socket.on('back_to_lobby', (msg) => { showLobby(msg.room); });
socket.on('error_msg', (msg) => { showToast(msg.message); });


// ============== SCREENS ==============
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function showLobby(room) {
  showScreen('screen-lobby');
  document.getElementById('lobby-code').textContent = room.code;
  updateLobby(room);
}

function updateLobby(room) {
  const container = document.getElementById('lobby-players');
  container.innerHTML = room.players.map(p =>
    `<div class="player-item">
      <span>${p.name}${p.isYou ? ' (You)' : ''}${p.isBot ? '' : ''}</span>
      ${p.isHost ? '<span class="host-badge">HOST</span>' : ''}
      ${p.isBot ? '<span class="host-badge" style="background:var(--secondary)">BOT</span>' : ''}
    </div>`
  ).join('');

  const startBtn = document.getElementById('btn-start');
  const addBotBtn = document.getElementById('btn-add-bot');
  if (room.isHost || isHost) {
    startBtn.style.display = 'block';
    startBtn.disabled = room.players.length < 2;
    addBotBtn.style.display = room.players.length < 8 ? 'block' : 'none';
  } else {
    startBtn.style.display = 'none';
    addBotBtn.style.display = 'none';
  }
}

// ============== GAME RENDERING ==============
function renderGame() {
  if (!gameState) return;
  showScreen('screen-game');

  // Card emoji map
  const cardEmoji = {
    'Holiday': '🏖️', 'Good Sleep': '😴', 'Spa Day': '🧖', 'Massage': '💆', 'Yoga': '🧘',
    'Running': '🏃', 'Cycling': '🚴', 'Hiking': '🥾', 'Movie Night': '🎬', 'Board Game Night': '🎲',
    'Nice Dinner': '🍽️', 'Social': '☕', 'Afternoon Tea': '🫖', 'Sick Leave': '🤒',
    'Overtime': '⏰', 'Crunch Week': '💀', 'Toxic Manager': '🐍', 'Long Meeting': '😵',
    'Performance Review': '📋', 'Monday Blues': '😩',
    'Delegate': '📤', 'Steal Lunch': '🍱', 'Boundaries': '🛡️', 'Networking': '👀',
    'Coffee Run': '☕', 'Team Building': '🤝', 'Layoff': '✂️', 'Quiet Quitting': '🤫',
  };

  // Turn info
  const turnEl = document.getElementById('turn-indicator');
  if (gameState.isYourTurn) {
    turnEl.textContent = "YOUR TURN";
    turnEl.style.color = 'var(--yellow)';
  } else {
    turnEl.textContent = `${gameState.currentPlayerName}'s turn`;
    turnEl.style.color = 'var(--text-dim)';
  }
  document.getElementById('cards-played-info').textContent = `Cards played: ${gameState.cardsPlayed}/${gameState.maxCards}`;
  document.getElementById('deck-size').textContent = gameState.deckSize;

  // Players board
  const board = document.getElementById('players-board');
  board.innerHTML = gameState.players.map(p => {
    const hpPct = Math.max(0, p.hp);
    const hpColor = hpPct > 60 ? 'var(--green)' : hpPct > 30 ? 'var(--yellow)' : 'var(--red)';
    const classes = ['player-card'];
    if (p.name === gameState.currentPlayerName) classes.push('current-turn');
    if (!p.alive) classes.push('eliminated');
    if (p.isYou) classes.push('is-you');
    return `<div class="${classes.join(' ')}">
      <div class="player-name">${p.name}${p.isYou?' (You)':''}</div>
      <div class="player-hp" style="color:${hpColor}">${p.hp} HP</div>
      <div class="hp-bar"><div class="hp-fill" style="width:${hpPct}%;background:${hpColor}"></div></div>
      <div class="player-info">${p.cardCount} cards${!p.alive?' - ELIMINATED':''}</div>
      ${p.shield?'<span class="shield-badge">🛡️ SHIELD</span>':''}
    </div>`;
  }).join('');

  // Hand with emojis
  const hand = document.getElementById('player-hand');
  const canPlay = gameState.isYourTurn && gameState.cardsPlayed < 3;
  hand.innerHTML = gameState.yourHand.map(c => {
    const disabled = !canPlay ? 'disabled' : '';
    const emoji = cardEmoji[c.name] || '🃏';
    const hpDisplay = c.hp ? `<div class="card-hp ${c.hp>0?'positive':'negative'}">${formatHp(c.hp)}</div>` : '';
    return `<div class="game-card ${c.category} ${disabled}" data-uid="${c.uid}" onclick="playCard('${c.uid}')">
      <span class="card-category">${c.category}</span>
      <div class="card-emoji">${emoji}</div>
      <div class="card-name">${c.name}</div>
      ${hpDisplay}
      <div class="card-desc">${c.description}</div>
    </div>`;
  }).join('');

  // End turn button
  const endBtn = document.getElementById('btn-end-turn');
  endBtn.disabled = !gameState.isYourTurn;
}

function formatHp(hp) { return hp > 0 ? `+${hp}` : `${hp}`; }

function playCard(uid) {
  if (!gameState || !gameState.isYourTurn || gameState.cardsPlayed >= 3) return;
  socket.emit('play_cards', { cardUid: uid });
}

// ============== MODALS ==============
function showTargetModal(msg) {
  const modal = document.getElementById('modal-target');
  const title = document.getElementById('modal-title');
  const targets = document.getElementById('modal-targets');
  const cards = document.getElementById('modal-cards');

  title.textContent = `Select target for ${msg.action}`;
  targets.innerHTML = msg.targets.map(name =>
    `<button class="btn btn-secondary btn-small" onclick="selectTarget('${name}')">${name}</button>`
  ).join('');
  cards.innerHTML = '';
  modal.classList.add('active');
}

function showDamageCardModal(msg) {
  const modal = document.getElementById('modal-target');
  const title = document.getElementById('modal-title');
  const targets = document.getElementById('modal-targets');
  const cards = document.getElementById('modal-cards');

  title.textContent = `Delegate to ${msg.targetName} - pick a damage card:`;
  targets.innerHTML = '';
  cards.innerHTML = msg.damageCards.map(c =>
    `<div class="game-card damage" style="width:130px;cursor:pointer" onclick="selectDamageCard('${c.uid}')">
      <div class="card-name">${c.name}</div>
      <div class="card-hp negative">${c.hp}</div>
    </div>`
  ).join('');
  modal.classList.add('active');
}

function selectTarget(name) {
  document.getElementById('modal-target').classList.remove('active');
  socket.emit('select_target', { targetName: name });
}

function selectDamageCard(uid) {
  document.getElementById('modal-target').classList.remove('active');
  socket.emit('select_card_to_delegate', { damageCardUid: uid });
}

function showPeekModal(msg) {
  const modal = document.getElementById('modal-peek');
  document.getElementById('peek-title').textContent = `${msg.targetName}'s Hand`;
  document.getElementById('peek-cards').innerHTML = msg.hand.map(c =>
    `<div class="peek-card">
      <div class="peek-name">${c.name}</div>
      ${c.hp?`<div class="peek-hp" style="color:${c.hp>0?'var(--green)':'var(--red)'}">${formatHp(c.hp)}</div>`:''}
    </div>`
  ).join('');
  modal.classList.add('active');
}


// ============== GAME OVER ==============
function showGameOver(msg) {
  showScreen('screen-gameover');
  document.getElementById('winner-text').textContent = msg.winner === 'Nobody' ? 'Everyone burned out!' : `${msg.winner} survived!`;
  document.getElementById('final-standings').innerHTML = msg.players
    .sort((a, b) => b.hp - a.hp)
    .map(p => `<div class="standing-row ${p.alive?'winner':'dead'}">
      <span>${p.name}${p.alive?' - SURVIVOR':' - BURNED OUT'}</span>
      <span>${p.hp} HP</span>
    </div>`).join('');

  document.getElementById('btn-new-game').style.display = isHost ? 'inline-block' : 'none';
}

// ============== GAME LOG ==============
function addLog(text, category = '') {
  const log = document.getElementById('game-log');
  const entry = document.createElement('div');
  entry.className = `log-entry ${category}`;
  entry.textContent = text;
  log.prepend(entry);
  if (log.children.length > 50) log.removeChild(log.lastChild);
}

// ============== TOAST ==============
function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('active');
  setTimeout(() => toast.classList.remove('active'), 3000);
}

// ============== EVENT LISTENERS ==============
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btn-create').addEventListener('click', () => {
    const name = document.getElementById('player-name').value.trim();
    if (!name) { showToast('Enter your name!'); return; }
    socket.emit('create_room', { playerName: name });
  });

  document.getElementById('btn-join').addEventListener('click', () => {
    const name = document.getElementById('player-name').value.trim();
    const code = document.getElementById('room-code').value.trim();
    if (!name) { showToast('Enter your name!'); return; }
    if (!code) { showToast('Enter room code!'); return; }
    socket.emit('join_room', { playerName: name, roomCode: code });
  });

  document.getElementById('btn-start').addEventListener('click', () => {
    socket.emit('start_game');
  });

  document.getElementById('btn-add-bot').addEventListener('click', () => {
    socket.emit('add_bot');
  });

  document.getElementById('btn-leave').addEventListener('click', () => {
    socket.emit('leave_room');
    showScreen('screen-home');
    isHost = false; currentRoom = null; gameState = null;
  });

  document.getElementById('btn-end-turn').addEventListener('click', () => {
    socket.emit('end_turn');
  });

  document.getElementById('modal-cancel').addEventListener('click', () => {
    document.getElementById('modal-target').classList.remove('active');
  });

  document.getElementById('peek-close').addEventListener('click', () => {
    document.getElementById('modal-peek').classList.remove('active');
  });

  document.getElementById('btn-new-game').addEventListener('click', () => {
    socket.emit('new_game');
  });

  document.getElementById('btn-home').addEventListener('click', () => {
    socket.emit('leave_room');
    showScreen('screen-home');
    isHost = false; currentRoom = null; gameState = null;
  });

  document.getElementById('player-name').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') document.getElementById('btn-create').click();
  });
  document.getElementById('room-code').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') document.getElementById('btn-join').click();
  });
});
