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
// REQUEST BANNER (Undo / Neues Spiel)
// =========================================
const requestBanner = document.getElementById('requestBanner');
const requestText = document.getElementById('requestText');
const requestAccept = document.getElementById('requestAccept');
const requestDecline = document.getElementById('requestDecline');

let requestCallback = null;

function showRequestBanner(text, callback) {
  requestText.textContent = text;
  requestCallback = callback;
  requestBanner.classList.remove('hidden');
  requestBanner.classList.remove('visible');
  void requestBanner.offsetWidth;
  requestBanner.classList.add('visible');
}

function hideRequestBanner() {
  requestBanner.classList.remove('visible');
  setTimeout(() => requestBanner.classList.add('hidden'), 300);
  requestCallback = null;
}

requestAccept.addEventListener('click', () => {
  if (requestCallback) requestCallback(true);
  hideRequestBanner();
});

requestDecline.addEventListener('click', () => {
  if (requestCallback) requestCallback(false);
  hideRequestBanner();
});

// =========================================
// HILFSFUNKTION: Wie viele Züge sollen zurückgenommen werden?
// Wenn der letzte Zug vom Anfrager stammt → nur 1 (Gegner hat noch nicht gezogen)
// Wenn der letzte Zug vom Gegner stammt → 2 (beide letzten Züge zurück)
// =========================================
function getUndoCount(requesterColor) {
  const history = chess.history({ verbose: true });
  if (!history.length) return 0;
  const lastMoveColor = history[history.length - 1].color === 'w' ? 'white' : 'black';
  return lastMoveColor === requesterColor ? 1 : 2;
}

// =========================================
// SOCKET VERBINDUNG (nur im Multiplayer)
// =========================================
let socket = null;
let disconnectOverlayActive = false;

if (isMultiplayer) {
  socket = io('https://chess2-0-server.onrender.com');

  socket.on('connect', () => {
    socket.emit('join-game', { roomId, color: myColor });
  });

  socket.on('new-game-requested', () => {
    showRequestBanner('Gegner möchte ein neues Spiel starten', (accepted) => {
      socket.emit('new-game-response', { roomId, accepted });
      if (accepted) startNewGame();
    });
  });

  socket.on('new-game-answered', ({ accepted }) => {
    overlayBtn.textContent = 'Neues Spiel ↺';
    overlayBtn.disabled = false;

    if (accepted) {
      startNewGame();
    } else {
      showOverlay('Abgelehnt.', 'Dein Gegner möchte kein neues Spiel.');
      setTimeout(hideOverlay, 2000);
    }
  });

  socket.on('opponent-move', (move) => {
    if (disconnectOverlayActive) {
      disconnectOverlayActive = false;
      hideOverlay();
    }
    chess.move(move);
    updateBoard([move.from, move.to]);
    updateStatus();
    updateHistory();
    ground.playPremove();
  });

  socket.on('opponent-disconnected-temp', () => {
    disconnectOverlayActive = true;
    showOverlay(
      'Gegner offline.',
      'Dein Gegner hat die Verbindung verloren.',
      false,
    );
  });

  socket.on('opponent-action', ({ action }) => {
    if (action === 'surrender') {
      handleGameOver(
        'Gegner hat aufgegeben.',
        'Du gewinnst diese Partie!',
        false,
      );
    }
  });

  // Gegner möchte Zug zurücknehmen
  socket.on('undo-requested', () => {
    showRequestBanner('Gegner möchte einen Zug zurücknehmen', (accepted) => {
      socket.emit('undo-response', { roomId, accepted });
      if (accepted) {
        const opponentColor = myColor === 'white' ? 'black' : 'white';
        const count = getUndoCount(opponentColor);
        for (let i = 0; i < count; i++) chess.undo();
        updateBoard();
        updateStatus();
        updateHistory();
      }
    });
  });

  // Antwort auf Undo Anfrage
  socket.on('undo-answered', ({ accepted }) => {
    document.getElementById('undoBtn').style.opacity = '1';
    document.getElementById('undoBtn').style.pointerEvents = 'all';

    if (accepted) {
      const count = getUndoCount(myColor);
      for (let i = 0; i < count; i++) chess.undo();
      updateBoard();
      updateStatus();
      updateHistory();
    } else {
      showOverlay('Abgelehnt.', 'Dein Gegner hat die Undo-Anfrage abgelehnt.');
      setTimeout(hideOverlay, 2000);
    }
  });

  // Game bei neuem Laden auf den aktuellen Stand setzen
  socket.on('restore-game', ({ moves }) => {
    chess.reset();
    moves.forEach((move) => chess.move(move));
    updateBoard();
    updateStatus();
    updateHistory();
  });

  socket.on('opponent-reconnected', () => {
    disconnectOverlayActive = false;
    hideOverlay();
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
    updateBoard([from, to]);
    updateStatus();
    updateHistory();
    ground.playPremove();

    if (chess.isCheckmate()) {
      handleGameOver(
        'Schachmatt.',
        'Die Engine gewinnt · Versuch es noch einmal',
      );
      return;
    }

    if (chess.isDraw()) {
      handleGameOver('Remis.', 'Die Partie endet unentschieden');
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
  premovable: {
    enabled: true,
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

// Liefert eine Map mit allen von Weiß besetzten Feldern → leere Arrays.
// Wird während des Engine-Zugs verwendet, damit Chessground die weißen
// Figuren als interaktiv (premovable) markiert, ohne echte Züge zu erlauben.
function getWhiteDests() {
  const dests = new Map();
  chess.board().forEach((row) => {
    row.forEach((sq) => {
      if (sq && sq.color === 'w') {
        dests.set(sq.square, []);
      }
    });
  });
  return dests;
}

function updateBoard(lastMove = undefined) {
  const turn = chess.turn() === 'w' ? 'white' : 'black';

  const config = {
    fen: chess.fen(),
    turnColor: turn,
    check: chess.inCheck(),
  };

  if (isMultiplayer) {
    // Multiplayer: color immer myColor, sonst schlägt isPremovable fehl.
    // Wer ziehen darf, wird über turnColor+dests gesteuert, nicht über color.
    config.movable = {
      color: myColor,
      free: false,
      dests: turn === myColor ? getLegalMoves() : new Map(),
    };
  } else {
    // Einzelspieler: Spieler ist immer Weiß
    // Wenn Engine am Zug → getWhiteDests() übergeben, damit Chessground
    // weiße Figuren als premovable kennzeichnet (Figuren bleiben anklickbar).
    config.movable = {
      color: 'white',
      free: false,
      dests: turn === 'white' ? getLegalMoves() : getWhiteDests(),
    };
  }

  if (lastMove !== undefined) config.lastMove = lastMove;

  ground.set(config);
}

// =========================================
//      SPIELERZUG
// =========================================
function onMove(from, to) {
  const move = chess.move({ from, to, promotion: 'q' });

  if (!move) return;

  updateBoard();
  updateStatus();
  updateHistory();

  if (isMultiplayer) {
    socket.emit('move', { roomId, move });

    if (chess.isCheckmate()) {
      handleGameOver('Schachmatt!', 'Du gewinnst diese Partie · Glückwunsch!');
    }
    if (chess.isDraw()) {
      handleGameOver('Remis.', 'Die Partie endet unentschieden');
    }
  } else {
    if (chess.isCheckmate()) {
      handleGameOver('Schachmatt.', 'Du gewinnst diese Partie · Glückwunsch!');
      return;
    }
    if (chess.isDraw()) {
      handleGameOver('Remis.', 'Die Partie endet unentschieden');
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

function showOverlay(title, sub, showBtn = true) {
  overlayTitle.textContent = title;
  overlaySub.textContent = sub;
  overlayBtn.style.display = showBtn ? 'inline-block' : 'none';

  setTimeout(() => {
    overlay.classList.remove('hidden');
    setTimeout(() => overlay.classList.add('visible'), 10);
  }, 1000);
}

function hideOverlay() {
  overlay.classList.remove('visible');
  setTimeout(() => overlay.classList.add('hidden'), 400);
}

function handleGameOver(title, sub) {
  showOverlay(title, sub);

  if (isMultiplayer) {
    document.getElementById('surrenderBtn').style.display = 'none';
    const newGameBtn = document.getElementById('newGameBtn');
    newGameBtn.style.display = 'block';
    newGameBtn.textContent = 'Neues Spiel anfragen ↺';
    newGameBtn.disabled = false;
  }
}

overlayClose.addEventListener('click', hideOverlay);

overlayBtn.addEventListener('click', () => {
  if (isMultiplayer) {
    socket.emit('new-game-request', { roomId });
    overlayBtn.textContent = 'Warte auf Gegner...';
    overlayBtn.disabled = true;
  } else {
    startNewGame();
  }
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
    const count = getUndoCount('white');
    for (let i = 0; i < count; i++) {
      const move = chess.undo();
      if (move) redoStack.push(move);
    }
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
  handleGameOver('Aufgegeben.', 'Du hast die Partie aufgegeben.');
  if (isMultiplayer) {
    socket.emit('game-action', { roomId, action: 'surrender' });
  }
});

document.getElementById('newGameBtn').addEventListener('click', () => {
  if (isMultiplayer) {
    socket.emit('new-game-request', { roomId });
    document.getElementById('newGameBtn').textContent = 'Warte auf Gegner...';
    document.getElementById('newGameBtn').disabled = true;
  } else {
    startNewGame();
  }
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

// Neues Spiel starten
function startNewGame() {
  chess.reset();
  redoStack = [];
  hideOverlay();
  ground.set({
    fen: chess.fen(),
    movable: {
      color: isMultiplayer ? myColor : 'white',
      free: false,
      dests: getLegalMoves(),
    },
    turnColor: 'white',
    check: false,
    lastMove: undefined,
  });
  overlayBtn.textContent = 'Neues Spiel ↺';
  overlayBtn.disabled = false;

  if (isMultiplayer) {
    document.getElementById('surrenderBtn').style.display = 'block';
    document.getElementById('newGameBtn').style.display = 'none';
  }

  updateStatus();
  updateHistory();
}

// =========================================
// INITIALISIERUNG
// =========================================
if (isMultiplayer) {
  document.getElementById('difficulty').style.display = 'none';
  document.getElementById('newGameBtn').style.display = 'none';
  document.getElementById('redoBtn').style.display = 'none';
}

updateStatus();
updateHistory();
