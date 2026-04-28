// =========================================
//      IMPORTS
// =========================================
import { Chess } from 'chess.js';
import { Chessground } from 'chessground';
import 'chessground/assets/chessground.base.css';
import 'chessground/assets/chessground.brown.css';
import 'chessground/assets/chessground.cburnett.css';
import './style.css';
import './background.js';
import { io } from 'socket.io-client';

// =========================================
// URL PARAMETER AUSLESEN
// =========================================
const urlParams = new URLSearchParams(window.location.search);
const roomId = urlParams.get('room');
const myColor = urlParams.get('color') || 'white';
const isMultiplayer = !!roomId;

// =========================================
//      SPIELLOGIK — chess.js
// =========================================
const chess = new Chess();

// =========================================
// SOCKET VERBINDUNG (nur im Multiplayer)
// =========================================
let socket = null;

if (isMultiplayer) {
  socket = io('https://chess2-0-server.onrender.com');

  socket.on('connect', () => {
    console.log('Mit Server verbunden:', socket.id);
    console.log('Sende join-game mit roomId:', roomId);
    socket.emit('join-game', { roomId, color: myColor });
  });

  socket.on('opponent-move', (move) => {
    console.log('Gegner Zug empfangen:', move);
    chess.move(move);
    updateBoard();
    updateStatus();
    updateHistory();
  });

  socket.on('opponent-disconnected-temp', () => {
    showOverlay(
      'Gegner hat die Verbindung verloren.',
      'Warte auf Rückkehr... oder schließe das Spiel.',
    );
    setTimeout(hideOverlay, 4000);
  });

  socket.on('opponent-action', ({ action }) => {
    if (action === 'surrender') {
      showOverlay('Gegner hat aufgegeben.', 'Du gewinnst diese Partie!');
    }
  });

  // Gegner möchte Zug zurücknehmen
  socket.on('undo-requested', () => {
    const accepted = confirm(
      'Dein Gegner möchte einen Zug zurücknehmen. Akzeptieren?',
    );
    socket.emit('undo-response', { roomId, accepted });
  });

  // Antwort auf Undo Anfrage
  socket.on('undo-answered', ({ accepted }) => {
    document.getElementById('undoBtn').style.opacity = '1';
    document.getElementById('undoBtn').style.pointerEvents = 'all';

    if (accepted) {
      chess.undo();
      chess.undo();
      updateBoard();
      updateStatus();
      updateHistory();
    } else {
      // Kleines Feedback dass Anfrage abgelehnt wurde
      showOverlay('Abgelehnt.', 'Dein Gegner hat die Undo-Anfrage abgelehnt.');
      setTimeout(hideOverlay, 2000);
    }
  });

  // Game bei neuem Laden auf den aktuellen Stand setzen
  socket.on('restore-game', ({ moves }) => {
    console.log('restore-game empfangen:', moves);
    chess.reset();
    moves.forEach((move) => chess.move(move));
    updateBoard();
    updateStatus();
    updateHistory();
  });
}

// =========================================
//      STOCKFISH ENGINE — Web Worker
// =========================================
const stockfish = new Worker('/chess2.0/stockfish.js');

let engineReady = false;
let skillLevel = 10;
let moveTime = 500;

stockfish.onmessage = (event) => {
  const msg = event.data;

  if (msg === 'uciok') {
    stockfish.postMessage('isready');
  }

  if (msg === 'readyok') {
    engineReady = true;
  }

  if (msg.startsWith('bestmove')) {
    const move = msg.split(' ')[1];
    const from = move.slice(0, 2);
    const to = move.slice(2, 4);

    chess.move({ from, to, promotion: 'q' });
    updateBoard();
    updateStatus();
    updateHistory();

    if (chess.isCheckmate()) {
      showOverlay('Schachmatt.', 'Die Engine gewinnt · Versuch es noch einmal');
      return;
    }

    if (chess.isDraw()) {
      showOverlay('Remis.', 'Die Partie endet unentschieden');
      return;
    }
  }
};

stockfish.postMessage('uci');

// =========================================
//      CHESSGROUND — Brett Darstellung
// =========================================
const ground = Chessground(document.getElementById('board'), {
  fen: chess.fen(),
  orientation: myColor,
  movable: {
    color: isMultiplayer ? myColor : 'white',
    free: false,
    dests: getLegalMoves(),
  },
  events: {
    move: onMove,
  },
});

// =========================================
//      HILFSFUNKTIONEN
// =========================================
function getLegalMoves() {
  const dests = new Map();
  chess.moves({ verbose: true }).forEach((m) => {
    if (!dests.has(m.from)) dests.set(m.from, []);
    dests.get(m.from).push(m.to);
  });
  return dests;
}

function updateBoard() {
  const turn = chess.turn() === 'w' ? 'white' : 'black';
  const canMove = isMultiplayer
    ? turn === myColor
      ? myColor
      : undefined
    : 'white';

  ground.set({
    fen: chess.fen(),
    movable: {
      color: canMove,
      free: false,
      dests: canMove ? getLegalMoves() : new Map(),
    },
    turnColor: turn,
    check: chess.inCheck(),
  });
}

// =========================================
//      SPIELERZUG
// =========================================
function onMove(from, to) {
  const move = chess.move({ from, to, promotion: 'q' });

  if (!move) return;

  console.log('Zug gemacht:', move);
  console.log('isMultiplayer:', isMultiplayer);
  console.log('roomId:', roomId);
  console.log('socket:', socket);

  updateStatus();
  updateHistory();

  if (isMultiplayer) {
    socket.emit('move', { roomId, move });

    if (chess.isCheckmate()) {
      showOverlay('Schachmatt!', 'Du gewinnst diese Partie · Glückwunsch!');
    }
    if (chess.isDraw()) {
      showOverlay('Remis.', 'Die Partie endet unentschieden');
    }
  } else {
    if (chess.isCheckmate()) {
      showOverlay('Schachmatt.', 'Du gewinnst diese Partie · Glückwunsch!');
      return;
    }
    if (chess.isDraw()) {
      showOverlay('Remis.', 'Die Partie endet unentschieden');
      return;
    }
    if (!chess.isGameOver()) {
      stockfish.postMessage(`setoption name Skill Level value ${skillLevel}`);
      stockfish.postMessage('position fen ' + chess.fen());
      stockfish.postMessage(`go movetime ${moveTime}`);
    }
  }
}

// =========================================
//        OVERLAY (Schachmatt / Remis)
// =========================================
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlayTitle');
const overlaySub = document.getElementById('overlaySub');
const overlayBtn = document.getElementById('overlayBtn');
const overlayClose = document.getElementById('overlayClose');

function showOverlay(title, sub) {
  overlayTitle.textContent = title;
  overlaySub.textContent = sub;

  setTimeout(() => {
    overlay.classList.remove('hidden');
    setTimeout(() => overlay.classList.add('visible'), 10);
  }, 1000);
}

function hideOverlay() {
  overlay.classList.remove('visible');
  setTimeout(() => overlay.classList.add('hidden'), 400);
}

overlayClose.addEventListener('click', hideOverlay);

overlayBtn.addEventListener('click', () => {
  hideOverlay();
  chess.reset();
  ground.set({
    fen: chess.fen(),
    movable: {
      color: isMultiplayer ? myColor : 'white',
      free: false,
      dests: getLegalMoves(),
    },
    turnColor: 'white',
  });
  updateStatus();
  updateHistory();
});

// =========================================
//        SCHWIERIGKEIT
// =========================================
document.querySelectorAll('.diff-item').forEach((item) => {
  item.addEventListener('click', () => {
    document
      .querySelectorAll('.diff-item')
      .forEach((i) => i.classList.remove('active'));
    item.classList.add('active');
    skillLevel = parseInt(item.dataset.skill);
    moveTime = parseInt(item.dataset.time);
  });
});

// =========================================
//      NEW GAME / SURRENDER / UNDO / REDO
// =========================================
let redoStack = [];

document.getElementById('undoBtn').addEventListener('click', () => {
  if (isMultiplayer) {
    socket.emit('undo-request', { roomId });
  } else {
    const move = chess.undo();
    if (move) redoStack.push(move);
    const move2 = chess.undo();
    if (move2) redoStack.push(move2);
    updateBoard();
    updateStatus();
    updateHistory();
  }
});

document.getElementById('redoBtn').addEventListener('click', () => {
  const move1 = redoStack.pop();
  if (move1) chess.move(move1);
  const move2 = redoStack.pop();
  if (move2) chess.move(move2);
  updateBoard();
  updateStatus();
  updateHistory();
});

document.getElementById('surrenderBtn').addEventListener('click', () => {
  if (!confirm('Wirklich aufgeben?')) return;

  showOverlay('Aufgegeben.', 'Du hast die Partie aufgegeben · Neues Spiel?');
  if (isMultiplayer) {
    socket.emit('game-action', { roomId, action: 'surrender' });
  }
});

document.getElementById('newGameBtn').addEventListener('click', () => {
  chess.reset();
  redoStack = [];
  ground.set({
    fen: chess.fen(),
    movable: {
      color: isMultiplayer ? myColor : 'white',
      free: false,
      dests: getLegalMoves(),
    },
    turnColor: 'white',
  });
  updateStatus();
  updateHistory();
});

// =========================================
// PROTOKOLL — Status & Zughistorie
// =========================================
function updateStatus() {
  const dot = document.getElementById('statusDot');
  const text = document.getElementById('statusText');
  const sub = document.getElementById('statusSub');

  if (chess.isCheckmate()) {
    dot.className = 'status-dot black';
    text.textContent = 'Schachmatt';
    sub.textContent = '';
    return;
  }

  if (chess.isDraw()) {
    dot.className = 'status-dot black';
    text.textContent = 'Remis';
    sub.textContent = '';
    return;
  }

  if (isMultiplayer) {
    const myTurn = chess.turn() === myColor[0];
    dot.className = myTurn ? `status-dot ${myColor}` : 'status-dot thinking';
    text.textContent = myTurn ? 'Dein Zug' : 'Gegner denkt...';
    sub.textContent = 'Zug ' + chess.moveNumber();
  } else {
    if (chess.turn() === 'w') {
      dot.className = 'status-dot white';
      text.textContent = 'Weiß am Zug';
      sub.textContent = 'Dein Zug';
    } else {
      dot.className = 'status-dot thinking';
      text.textContent = 'Engine denkt...';
      sub.textContent = 'Zug ' + chess.moveNumber();
    }
  }
}

function updateHistory() {
  const histEl = document.getElementById('history');
  const moves = chess.history();

  if (!moves.length) {
    histEl.innerHTML = '';
    return;
  }

  let html = '';
  for (let i = 0; i < moves.length; i += 2) {
    const num = Math.floor(i / 2) + 1;
    const white = moves[i] || '';
    const black = moves[i + 1] || '';
    const latestW = i === moves.length - 1;
    const latestB = i + 1 === moves.length - 1;

    html += `<div class="h-row">
      <span class="h-num">${num}.</span>
      <span class="h-move${latestW ? ' latest' : ''}">${white}</span>
      <span class="h-move${latestB ? ' latest' : ''}">${black}</span>
    </div>`;
  }

  histEl.innerHTML = html;
  histEl.scrollTop = histEl.scrollHeight;
}

// =========================================
// INITIALISIERUNG
// =========================================
// Multiplayer UI anpassen

if (isMultiplayer) {
  document.getElementById('difficulty').style.display = 'none';
  document.getElementById('newGameBtn').style.display = 'none';
  document.getElementById('redoBtn').style.display = 'none';
}

updateStatus();
updateHistory();
[UPDATE]
Vorbereitungen für die Abschlussprüfung