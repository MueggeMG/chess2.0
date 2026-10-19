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
// SOUNDS
// =========================================
const BASE = import.meta.env.BASE_URL; // z.B. '/chess2.0/'
const sounds = {
  move:    new Audio(BASE + 'sounds/Move.ogg'),
  capture: new Audio(BASE + 'sounds/Capture.ogg'),
  notify:  new Audio(BASE + 'sounds/GenericNotify.ogg'),
};

function playSound(name) {
  const s = sounds[name];
  if (!s) return;
  s.currentTime = 0;
  s.play().catch(() => {});
}

// =========================================
// URL PARAMETER AUSLESEN
// =========================================
const urlParams = new URLSearchParams(window.location.search);
const roomId = urlParams.get('room');
const myColor = urlParams.get('color') || 'white';
const isMultiplayer = !!roomId;
const isHotSeat   = urlParams.get('mode') === 'hotseat';
const isSolo      = !isMultiplayer && !isHotSeat; // vs Stockfish

// =========================================
// ZEITKONTROLLE — Spieluhr
// =========================================
const timeParam  = parseInt(urlParams.get('time')  || '0');
const incParam   = parseInt(urlParams.get('inc')   || '0');
const skillParam = parseInt(urlParams.get('skill') || '10');
const opponentColor = myColor === 'white' ? 'black' : 'white';

const clockTopEl      = document.getElementById('clockTop');
const clockBottomEl   = document.getElementById('clockBottom');
const clockTimeTopEl  = document.getElementById('clockTimeTop');
const clockTimeBotEl  = document.getElementById('clockTimeBottom');
const clockCatTopEl   = document.getElementById('clockCatTop');
const clockCatBotEl   = document.getElementById('clockCatBottom');

let clockMs     = { white: timeParam * 1000, black: timeParam * 1000 };
let giftSeconds = 15;
let clockInt    = null;
let clockActive = null; // 'white' | 'black' | null
const topColor    = opponentColor;
const bottomColor = myColor;

function fmtClock(ms) {
  if (ms <= 0) return '0:00';
  if (ms < 10000) {
    const s  = Math.floor(ms / 1000);
    const ds = Math.floor((ms % 1000) / 100);
    return `${s}.${ds}`;
  }
  const totalSecs = Math.ceil(ms / 1000);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function renderClockSide(color) {
  const isTop  = color === topColor;
  const el     = isTop ? clockTopEl     : clockBottomEl;
  const timeEl = isTop ? clockTimeTopEl : clockTimeBotEl;
  const ms     = clockMs[color];
  timeEl.textContent = fmtClock(ms);
  timeEl.className   = 'clock-time' +
    (ms < 10000 ? ' critical' : ms < 30000 ? ' warning' : '');
  el.classList.toggle('active', color === clockActive);
}

function renderClocks() {
  renderClockSide('white');
  renderClockSide('black');
}

function stopClock() {
  if (clockInt) { clearInterval(clockInt); clockInt = null; }
  clockActive = null;
  if (timeParam > 0) renderClocks();
}

function startClockFor(color) {
  if (clockInt) clearInterval(clockInt);
  clockActive = color;
  let lastTick = Date.now();
  clockInt = setInterval(() => {
    const now   = Date.now();
    const delta = now - lastTick;
    lastTick    = now;
    clockMs[color] = Math.max(0, clockMs[color] - delta);
    renderClockSide(color);
    if (clockMs[color] <= 0) {
      stopClock();
      onTimeout(color);
    }
  }, 50);
  renderClocks();
}

function clockAfterMove(movedColor) {
  clockMs[movedColor] += incParam * 1000;
  startClockFor(movedColor === 'white' ? 'black' : 'white');
}

function onTimeout(color) {
  const sub = color === myColor
    ? 'Deine Zeit ist abgelaufen.'
    : 'Zeit des Gegners abgelaufen. Du gewinnst!';
  handleGameOver('Zeit abgelaufen.', sub);
  if (isMultiplayer && socket) {
    socket.emit('game-action', { roomId, action: 'timeout', color });
  }
}

if (timeParam > 0) {
  clockTopEl.classList.remove('hidden');
  clockBottomEl.classList.remove('hidden');
  if (isMultiplayer) {
    clockCatTopEl.textContent = opponentColor === 'white' ? 'Weiß' : 'Schwarz';
    clockCatBotEl.textContent = myColor === 'white' ? 'Weiß (Du)' : 'Schwarz (Du)';
  } else if (isHotSeat) {
    clockCatTopEl.textContent = 'Schwarz';
    clockCatBotEl.textContent = 'Weiß';
  } else {
    clockCatTopEl.textContent = 'Schwarz';
    clockCatBotEl.textContent = 'Weiß (Du)';
  }
  renderClocks();
}

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
    viewIndex = null; // bei Gegnerzug immer zur aktuellen Stellung springen
    const applied = chess.move(move);
    playSound(applied?.captured ? 'capture' : 'move');
    updateBoard([move.from, move.to]);
    updateStatus();
    updateHistory();
    ground.playPremove();

    if (timeParam > 0 && !chess.isGameOver()) {
      clockAfterMove(opponentColor);
    }

    if (chess.isCheckmate()) {
      playSound('notify');
      handleGameOver('Schachmatt.', 'Du verlierst diese Partie.');
    } else if (chess.isDraw() && !chess.isThreefoldRepetition()) {
      playSound('notify');
      handleGameOver('Remis.', 'Die Partie endet unentschieden');
    }
    // Dreifache Stellungswiederholung: Button highlighten, kein Auto-Remis
    const drawBtnOpp = document.getElementById('drawBtn');
    if (drawBtnOpp) {
      if (chess.isThreefoldRepetition()) {
        playSound('notify');
        drawBtnOpp.classList.add('draw-available');
      } else {
        drawBtnOpp.classList.remove('draw-available');
      }
    }
  });

  socket.on('opponent-disconnected-temp', () => {
    disconnectOverlayActive = true;
    showOverlay(
      'Gegner offline.',
      'Dein Gegner hat die Verbindung verloren.',
      false,
    );
  });

  socket.on('opponent-action', ({ action, data }) => {
    if (action === 'surrender') {
      handleGameOver(
        'Gegner hat aufgegeben.',
        'Du gewinnst diese Partie!',
        false,
      );
    } else if (action === 'draw-claim') {
      handleGameOver('Remis.', 'Dreifache Stellungswiederholung — Remis beansprucht.');
    } else if (action === 'give-time') {
      clockMs[myColor] += (data?.seconds ?? 15) * 1000;
      if (timeParam > 0) renderClocks();
      playSound('notify');
      showGiftToast('+' + (data?.seconds ?? 15) + ' s geschenkt');
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

  // Gegner bietet Remis an
  socket.on('draw-requested', () => {
    showRequestBanner('Gegner bietet Remis an', (accepted) => {
      socket.emit('draw-response', { roomId, accepted });
      if (accepted) {
        handleGameOver('Remis.', 'Einigung auf Remis.');
      }
    });
  });

  // Antwort auf eigenes Remis-Angebot
  socket.on('draw-answered', ({ accepted }) => {
    const drawBtn = document.getElementById('drawBtn');
    drawBtn.style.opacity = '1';
    drawBtn.style.pointerEvents = 'all';

    if (accepted) {
      handleGameOver('Remis.', 'Dein Gegner hat das Remis akzeptiert.');
    } else {
      showOverlay('Abgelehnt.', 'Dein Gegner hat das Remis-Angebot abgelehnt.');
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

    // Button-Zustände für laufendes Spiel zurücksetzen
    if (!chess.isGameOver()) {
      isGameOver = false;
      document.getElementById('surrenderBtn').style.display = 'block';
      document.getElementById('drawBtn').style.display = 'block';
      document.getElementById('undoBtn').style.borderRight = '';
      const newGameBtn = document.getElementById('newGameBtn');
      newGameBtn.style.display = 'none';
      newGameBtn.textContent = 'Neues Spiel ↺';
      newGameBtn.disabled = false;
    }
  });

  socket.on('opponent-reconnected', () => {
    disconnectOverlayActive = false;
    hideOverlay();
  });
}

// =========================================
//      STOCKFISH ENGINE — Web Worker
// =========================================
const stockfish = isSolo ? new Worker('/chess2.0/stockfish.js') : null;

let engineReady = false;
const SKILL_MOVE_TIMES = { 2: 50,  10: 250, 16: 500,  20: 1000 };
let skillLevel = skillParam;
let moveTime   = SKILL_MOVE_TIMES[skillParam] ?? 500;

if (stockfish) stockfish.onmessage = (event) => {
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

    const applied = chess.move({ from, to, promotion: 'q' });
    playSound(applied?.captured ? 'capture' : 'move');
    updateBoard([from, to]);
    updateStatus();
    updateHistory();
    ground.playPremove();

    if (timeParam > 0 && !chess.isGameOver()) {
      clockAfterMove(chess.turn() === 'w' ? 'black' : 'white');
    }

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

if (stockfish) stockfish.postMessage('uci');

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
  } else if (isHotSeat) {
    // Hot-Seat: der aktuelle Spieler darf ziehen, Brett dreht sich nach Zug
    config.movable = {
      color: turn,
      free: false,
      dests: getLegalMoves(),
    };
    config.orientation = turn;
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
//      PROMOTION
// =========================================
const promotionModal = document.getElementById('promotionModal');
const promotionPieces = document.getElementById('promotionPieces');

function isPawnPromotion(from, to) {
  const piece = chess.get(from);
  if (!piece || piece.type !== 'p') return false;
  return (piece.color === 'w' && to[1] === '8') || (piece.color === 'b' && to[1] === '1');
}

function showPromotionModal(from, to) {
  const color = chess.turn(); // 'w' oder 'b' — noch der ziehende Spieler
  promotionPieces.dataset.color = color;

  // Figuren-Farbe auf die echten Chessground-Piece-Elemente setzen
  const colorName = color === 'w' ? 'white' : 'black';
  promotionModal.querySelectorAll('.promo-piece-wrap piece').forEach((el) => {
    el.classList.remove('white', 'black');
    el.classList.add(colorName);
  });

  promotionModal.classList.remove('hidden');
  void promotionModal.offsetWidth; // Reflow für Transition
  promotionModal.classList.add('visible');

  // Brett sperren während der Auswahl
  ground.set({ movable: { color: undefined, dests: new Map() } });

  promotionModal.querySelectorAll('.promo-btn').forEach((btn) => {
    btn.onclick = () => {
      hidePromotionModal();
      applyMoveWithPromotion(from, to, btn.dataset.piece);
    };
  });
}

function hidePromotionModal() {
  promotionModal.classList.remove('visible');
  setTimeout(() => promotionModal.classList.add('hidden'), 200);
}

function applyMoveWithPromotion(from, to, promotion) {
  const move = chess.move({ from, to, promotion });
  if (!move) return;

  viewIndex = null;
  playSound(move.captured ? 'capture' : 'move');
  updateBoard();
  updateStatus();
  updateHistory();

  if (timeParam > 0 && !chess.isGameOver()) {
    clockAfterMove(chess.turn() === 'w' ? 'black' : 'white');
  }

  if (isMultiplayer) {
    socket.emit('move', { roomId, move });
    if (chess.isCheckmate()) handleGameOver('Schachmatt!', 'Du gewinnst diese Partie · Glückwunsch!');
    else if (chess.isDraw() && !chess.isThreefoldRepetition()) handleGameOver('Remis.', 'Die Partie endet unentschieden');
    // Dreifache Stellungswiederholung: Button highlighten, kein Auto-Remis
    const drawBtnOwn = document.getElementById('drawBtn');
    if (chess.isThreefoldRepetition()) {
      playSound('notify');
      drawBtnOwn.classList.add('draw-available');
    } else {
      drawBtnOwn.classList.remove('draw-available');
    }
  } else if (isHotSeat) {
    // Hot-Seat: Spieler wechseln, kein Stockfish
    const winner = chess.turn() === 'w' ? 'Schwarz' : 'Weiß';
    if (chess.isCheckmate()) { handleGameOver('Schachmatt!', winner + ' gewinnt diese Partie!'); return; }
    if (chess.isDraw())      { handleGameOver('Remis.',      'Die Partie endet unentschieden');  return; }
    // Nichts weiter – updateBoard() hat bereits das Brett gedreht
  } else {
    if (chess.isCheckmate()) { handleGameOver('Schachmatt.', 'Du gewinnst diese Partie · Glückwunsch!'); return; }
    if (chess.isDraw()) { handleGameOver('Remis.', 'Die Partie endet unentschieden'); return; }
    if (!chess.isGameOver()) {
      stockfish.postMessage(`setoption name Skill Level value ${skillLevel}`);
      stockfish.postMessage('position fen ' + chess.fen());
      stockfish.postMessage(`go movetime ${moveTime}`);
    }
  }
}

// =========================================
//      SPIELERZUG
// =========================================
function onMove(from, to) {
  if (isPawnPromotion(from, to)) {
    showPromotionModal(from, to);
    return;
  }
  applyMoveWithPromotion(from, to, 'q'); // promotion-Argument irrelevant für Nicht-Bauern
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
  stopClock();
  showOverlay(title, sub);
  ground.set({ movable: { color: undefined, dests: new Map() } });
  document.getElementById('drawBtn')?.classList.remove('draw-available');

  if (isMultiplayer) {
    document.getElementById('surrenderBtn').style.display = 'none';
    document.getElementById('drawBtn').style.display = 'none';
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
// Aktiven Schwierigkeitsgrad aus URL-Param setzen
document.querySelectorAll('.diff-item').forEach((item) => {
  const s = parseInt(item.dataset.skill);
  if (s === skillLevel) {
    document.querySelectorAll('.diff-item').forEach(i => i.classList.remove('active'));
    item.classList.add('active');
  }
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
let viewIndex = null; // null = aktuelle Stellung, Zahl = historische Zugansicht

// Zeigt eine vergangene Stellung auf dem Brett (nur lokal, ändert chess nicht)
function viewMove(index) {
  const history = chess.history({ verbose: true });
  if (!history.length) return;
  viewIndex = Math.max(0, Math.min(index, history.length - 1));
  const tempChess = new Chess();
  for (let i = 0; i <= viewIndex; i++) tempChess.move(history[i]);
  ground.set({
    fen: tempChess.fen(),
    lastMove: [history[viewIndex].from, history[viewIndex].to],
    turnColor: tempChess.turn() === 'w' ? 'white' : 'black',
    check: tempChess.inCheck(),
    movable: { color: undefined, dests: new Map() },
  });
  updateHistory();
}

// Zurück zur aktuellen Spielstellung
function exitViewMode() {
  viewIndex = null;
  updateBoard();
  updateStatus();
  updateHistory();
}

document.getElementById('undoBtn').addEventListener('click', () => {
  // Erst möglich, wenn der anfragende Spieler selbst mindestens einen Zug gemacht hat
  const requesterColor = isMultiplayer ? myColor : 'white';
  const hasMovedYet = chess.history({ verbose: true }).some(
    m => (m.color === 'w' ? 'white' : 'black') === requesterColor
  );
  if (!hasMovedYet) return;

  if (isMultiplayer) {
    socket.emit('undo-request', { roomId });
  } else if (isHotSeat) {
    // Hot-Seat: den letzten Zug des aktuellen Spielers rückgängig machen
    const lastMover = chess.turn() === 'w' ? 'black' : 'white';
    const count = getUndoCount(lastMover);
    for (let i = 0; i < count; i++) {
      const move = chess.undo();
      if (move) redoStack.push(move);
    }
    updateBoard();
    updateStatus();
    updateHistory();
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

// Zughistorie Navigation
document.getElementById('histPrevBtn').addEventListener('click', () => {
  const history = chess.history();
  if (!history.length) return;
  const current = viewIndex !== null ? viewIndex : history.length - 1;
  viewMove(current - 1);
});

document.getElementById('histNextBtn').addEventListener('click', () => {
  const history = chess.history();
  if (viewIndex === null || !history.length) return;
  if (viewIndex >= history.length - 1) exitViewMode();
  else viewMove(viewIndex + 1);
});

document.getElementById('surrenderBtn').addEventListener('click', () => {
  if (!confirm('Wirklich aufgeben?')) return;
  handleGameOver('Aufgegeben.', 'Du hast die Partie aufgegeben.');
  if (isMultiplayer) {
    socket.emit('game-action', { roomId, action: 'surrender' });
  }
});

document.getElementById('drawBtn').addEventListener('click', () => {
  if (!isMultiplayer || !socket) return;

  // Dreifache Stellungswiederholung: kein Gegner-OK nötig
  if (chess.isThreefoldRepetition()) {
    handleGameOver('Remis.', 'Dreifache Stellungswiederholung — Remis beansprucht.');
    socket.emit('game-action', { roomId, action: 'draw-claim' });
    return;
  }

  // Normales Remis-Angebot
  const drawBtn = document.getElementById('drawBtn');
  drawBtn.style.opacity = '0.4';
  drawBtn.style.pointerEvents = 'none';
  socket.emit('draw-request', { roomId });
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

  // Welcher Zug ist aktiv hervorgehoben?
  const activeIdx = viewIndex !== null ? viewIndex : moves.length - 1;

  let html = '';
  for (let i = 0; i < moves.length; i += 2) {
    const num = Math.floor(i / 2) + 1;
    const white = moves[i] || '';
    const black = moves[i + 1] || '';

    html += `<div class="h-row">
      <span class="h-num">${num}.</span>
      <span class="h-move${i === activeIdx ? ' latest' : ''}" data-idx="${i}">${white}</span>
      <span class="h-move${i + 1 === activeIdx ? ' latest' : ''}"${black ? ` data-idx="${i + 1}"` : ''}>${black}</span>
    </div>`;
  }

  histEl.innerHTML = html;

  // Klick auf Zug → direkt zu dieser Stellung springen
  histEl.querySelectorAll('.h-move[data-idx]').forEach(el => {
    el.addEventListener('click', () => viewMove(parseInt(el.dataset.idx)));
  });

  // Scroll: aktiven Zug sichtbar halten (nur innerhalb des Containers, nicht die Seite)
  const activeEl = histEl.querySelector('.latest');
  if (activeEl) {
    const top = activeEl.offsetTop;
    const bottom = top + activeEl.offsetHeight;
    if (top < histEl.scrollTop) histEl.scrollTop = top;
    else if (bottom > histEl.scrollTop + histEl.clientHeight) histEl.scrollTop = bottom - histEl.clientHeight;
  } else {
    histEl.scrollTop = histEl.scrollHeight;
  }
}

// Neues Spiel starten
function startNewGame() {
  chess.reset();
  redoStack = [];
  viewIndex = null;
  stopClock();
  clockMs = { white: timeParam * 1000, black: timeParam * 1000 };
  if (timeParam > 0) renderClocks();
  hideOverlay();
  ground.set({
    fen: chess.fen(),
    orientation: isHotSeat ? 'white' : (isMultiplayer ? myColor : 'white'),
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
    document.getElementById('drawBtn').style.display = 'block';
    document.getElementById('newGameBtn').style.display = 'none';
  }

  updateStatus();
  updateHistory();
}

// =========================================
// NAV SCROLLED STATE
// =========================================
const navEl = document.querySelector('nav');
function updateNavScroll() {
  navEl.classList.toggle('scrolled', window.scrollY > 10);
}
window.addEventListener('scroll', updateNavScroll, { passive: true });
updateNavScroll();

// =========================================
// INITIALISIERUNG
// =========================================
if (isMultiplayer) {
  document.getElementById('difficulty').style.display = 'none';
  document.getElementById('newGameBtn').style.display = 'none';
  document.getElementById('redoBtn').style.display = 'none';
} else if (isHotSeat) {
  document.getElementById('difficulty').style.display = 'none';
  document.getElementById('drawBtn').style.display = 'none';
  document.getElementById('surrenderBtn').style.display = 'none';
} else {
  document.getElementById('drawBtn').style.display = 'none';
}

// --- Zeit schenken ---
if (isMultiplayer && timeParam > 0) {
  const giftRow     = document.getElementById('giftTimeRow');
  const giftDisplay = document.getElementById('giftDisplay');
  const giftMinus   = document.getElementById('giftMinus');
  const giftPlus    = document.getElementById('giftPlus');
  const giftBtn     = document.getElementById('giftBtn');

  giftRow.classList.remove('hidden');

  const updateGiftDisplay = () => { giftDisplay.textContent = giftSeconds + ' s'; };

  giftMinus.addEventListener('click', () => {
    giftSeconds = Math.max(5, giftSeconds - 5);
    updateGiftDisplay();
  });
  giftPlus.addEventListener('click', () => {
    giftSeconds = Math.min(60, giftSeconds + 5);
    updateGiftDisplay();
  });
  giftBtn.addEventListener('click', () => {
    socket.emit('game-action', { roomId, action: 'give-time', data: { seconds: giftSeconds } });
    clockMs[opponentColor] += giftSeconds * 1000;
    renderClocks();
    showGiftToast('Gegner +' + giftSeconds + ' s');
  });
}

function showGiftToast(msg) {
  const el = document.getElementById('giftToast');
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.add('hidden'), 2500);
}

updateStatus();
updateHistory();
