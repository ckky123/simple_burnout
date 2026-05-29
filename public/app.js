// ============== WEBSOCKET CLIENT ==============
let ws = null;
let myId = null;
let isHost = false;
let currentRoom = null;
let gameState = null;

function connect() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${protocol}//${location.host}/ws`);

  ws.onopen = () => console.log('Connected');
  ws.onclose = () => { setTimeout(connect, 2000); };
  ws.onerror = () => {};
  ws.onmessage = (e) => {
    try { handleMessage(JSON.parse(e.data)); } catch(err) { console.error(err); }
  };
}

function send(data) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
}

// ============== MESSAGE HANDLER ==============
function handleMessage(msg) {
  switch (msg.type) {
    case 'connected': myId = msg.id; break;
    case 'room_created':
      currentRoom = msg.roomCode; isHost = true;
      showLobby(msg.room);
      break;
    case 'room_joined':
      currentRoom = msg.roomCode; isHost = msg.room.isHost;
      showLobby(msg.room);
      break;
    case 'player_joined':
    case 'player_left':
      updateLobby(msg.room);
      if (msg.type === 'player_left') addLog(`${msg.playerName} left the room`, 'system');
      break;
    case 'game_state':
      gameState = msg.state;
      renderGame();
      break;
    case 'card_played':
      addLog(`${msg.playerName} played ${msg.card.name}${msg.card.hp ? ' ('+formatHp(msg.card.hp)+')' : ''} ${msg.card.description||''}`, msg.card.category);
      break;
    case 'action_blocked':
      addLog(`${msg.targetName} blocked ${msg.playerName}'s ${msg.action} with Boundaries!`, 'system');
      break;
    case 'player_eliminated':
      addLog(`${msg.playerName} has burned out! Eliminated.`, 'damage');
      break;
    case 'turn_skipped':
      addLog(`${msg.playerName}'s turn skipped (Sick Leave)`, 'system');
      break;
    case 'game_cancelled':
      addLog(msg.reason, 'system');
      showLobby(msg.room);
      break;
    case 'select_target':
      showTargetModal(msg);
      break;
    case 'select_damage_card':
      showDamageCardModal(msg);
      break;
    case 'peek_result':
      showPeekModal(msg);
      break;
    case 'game_over':
      showGameOver(msg);
      break;
    case 'back_to_lobby':
      showLobby(msg.room);
      break;
    case 'error':
      showToast(msg.message);
      break;
  }
}


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
      <span>${p.name}${p.isYou ? ' (You)' : ''}</span>
      ${p.isHost ? '<span class="host-badge">HOST</span>' : ''}
    </div>`
  ).join('');

  const startBtn = document.getElementById('btn-start');
  // Show start button if you are host
  if (room.isHost || isHost) {
    startBtn.style.display = 'block';
    startBtn.disabled = room.players.length < 2;
  } else {
    startBtn.style.display = 'none';
  }
}

// ============== GAME RENDERING ==============
function renderGame() {
  if (!gameState) return;
  showScreen('screen-game');

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
      ${p.shield?'<span class="shield-badge">SHIELD</span>':''}
    </div>`;
  }).join('');

  // Hand
  const hand = document.getElementById('player-hand');
  const canPlay = gameState.isYourTurn && gameState.cardsPlayed < 3;
  hand.innerHTML = gameState.yourHand.map(c => {
    const disabled = !canPlay ? 'disabled' : '';
    const hpDisplay = c.hp ? `<div class="card-hp ${c.hp>0?'positive':'negative'}">${formatHp(c.hp)}</div>` : '';
    return `<div class="game-card ${c.category} ${disabled}" data-uid="${c.uid}" onclick="playCard('${c.uid}')">
      <span class="card-category">${c.category}</span>
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
  send({ type: 'play_cards', cardUid: uid });
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
  send({ type: 'select_target', targetName: name });
}

function selectDamageCard(uid) {
  document.getElementById('modal-target').classList.remove('active');
  send({ type: 'select_card_to_delegate', damageCardUid: uid });
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
  connect();

  document.getElementById('btn-create').addEventListener('click', () => {
    const name = document.getElementById('player-name').value.trim();
    if (!name) { showToast('Enter your name!'); return; }
    send({ type: 'create_room', playerName: name });
  });

  document.getElementById('btn-join').addEventListener('click', () => {
    const name = document.getElementById('player-name').value.trim();
    const code = document.getElementById('room-code').value.trim();
    if (!name) { showToast('Enter your name!'); return; }
    if (!code) { showToast('Enter room code!'); return; }
    send({ type: 'join_room', playerName: name, roomCode: code });
  });

  document.getElementById('btn-start').addEventListener('click', () => {
    send({ type: 'start_game' });
  });

  document.getElementById('btn-leave').addEventListener('click', () => {
    send({ type: 'leave_room' });
    showScreen('screen-home');
    isHost = false; currentRoom = null; gameState = null;
  });

  document.getElementById('btn-end-turn').addEventListener('click', () => {
    send({ type: 'end_turn' });
  });

  document.getElementById('modal-cancel').addEventListener('click', () => {
    document.getElementById('modal-target').classList.remove('active');
  });

  document.getElementById('peek-close').addEventListener('click', () => {
    document.getElementById('modal-peek').classList.remove('active');
  });

  document.getElementById('btn-new-game').addEventListener('click', () => {
    send({ type: 'new_game' });
  });

  document.getElementById('btn-home').addEventListener('click', () => {
    send({ type: 'leave_room' });
    showScreen('screen-home');
    isHost = false; currentRoom = null; gameState = null;
  });

  // Enter key support
  document.getElementById('player-name').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') document.getElementById('btn-create').click();
  });
  document.getElementById('room-code').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') document.getElementById('btn-join').click();
  });
});
