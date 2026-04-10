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

// =========================================
//      SPIELLOGIK — chess.js
// =========================================
const chess = new Chess();

// =========================================
//      STOCKFISH ENGINE — Web Worker
// =========================================
const stockfish = new Worker('/chess2.0/stockfish.js');

let engineReady = false;
let skillLevel = 10;
let moveTime = 500;

stockfish.onmessage = (event) => {
  const msg = event.data;

  // UCI Handshake beim Start
  if (msg === 'uciok') {
    stockfish.postMessage('isready');
  }

  if (msg === 'readyok') {
    engineReady = true;
  }

  // Engine hat besten Zug berechnet
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

// UCI Initialisierung starten
stockfish.postMessage('uci');

// =========================================
//      CHESSGROUND — Brett Darstellung
// =========================================
const ground = Chessground(document.getElementById('board'), {
  fen: chess.fen(),
  movable: {
    color: 'white',
    free: false,
    dests: getLegalMoves(),
  },
  events: {
    move: onMove,
  },
});

// =========================================
// RESPONSIVE — Brett neu berechnen               //TODO
// =========================================

// =========================================
//      HILFSFUNKTIONEN
// =========================================

// Gibt alle legalen Züge als Map zurück (Chessground Format)
function getLegalMoves() {
  const dests = new Map();
  chess.moves({ verbose: true }).forEach((m) => {
    if (!dests.has(m.from)) dests.set(m.from, []);
    dests.get(m.from).push(m.to);
  });
  return dests;
}

// Aktualisiert das Brett nach jedem Zug
function updateBoard() {
  ground.set({
    fen: chess.fen(),
    movable: {
      color: 'white',
      free: false,
      dests: getLegalMoves(),
    },
    turnColor: 'white',
    check: chess.inCheck(),
  });
}

// =========================================
//      SPIELERZUG
// =========================================
function onMove(from, to) {
  chess.move({ from, to, promotion: 'q' });
  updateStatus();
  updateHistory();

  if (chess.isCheckmate()) {
    showOverlay('Schachmatt.', 'Du gewinnst diese Partie · Glückwunsch!');
    return;
  }

  if (chess.isDraw()) {
    showOverlay('Remis.', 'Die Partie endet unentschieden');
    return;
  }

  // Stockfish zur Antwort auffordern
  if (!chess.isGameOver()) {
    stockfish.postMessage(`setoption name Skill Level value ${skillLevel}`);
    stockfish.postMessage('position fen ' + chess.fen());
    stockfish.postMessage(`go movetime ${moveTime}`);
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

// Overlay anzeigen mit Verzögerung
function showOverlay(title, sub) {
  overlayTitle.textContent = title;
  overlaySub.textContent = sub;

  setTimeout(() => {
    overlay.classList.remove('hidden');
    setTimeout(() => overlay.classList.add('visible'), 10);
  }, 1000);
}

// Overlay schließen
function hideOverlay() {
  overlay.classList.remove('visible');
  setTimeout(() => overlay.classList.add('hidden'), 400);
}

// Overlay per X schließen
overlayClose.addEventListener('click', hideOverlay);

// Neues Spiel starten
overlayBtn.addEventListener('click', () => {
  hideOverlay();
  chess.reset();
  ground.set({
    fen: chess.fen(),
    movable: {
      color: 'white',
      free: false,
      dests: getLegalMoves(),
    },
    turnColor: 'white',
  });
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
  const move = chess.undo(); // Engine-Zug zurück
  if (move) redoStack.push(move);
  const move2 = chess.undo(); // Spieler-Zug zurück
  if (move2) redoStack.push(move2);
  updateBoard();
  updateStatus();
  updateHistory();
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
  showOverlay('Aufgegeben.', 'Du hast die Partie aufgegeben · Neues Spiel?');
});

document.getElementById('newGameBtn').addEventListener('click', () => {
  chess.reset();
  redoStack = [];
  ground.set({
    fen: chess.fen(),
    movable: {
      color: 'white',
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
updateStatus();
updateHistory();
