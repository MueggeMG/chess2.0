import { Chess } from 'chess.js';
import { Chessground } from 'chessground';
import 'chessground/assets/chessground.base.css';
import 'chessground/assets/chessground.brown.css';
import 'chessground/assets/chessground.cburnett.css';
import './style.css';

const chess = new Chess();
const stockfish = new Worker('/stockfish.js');

let engineReady = false;

stockfish.onmessage = (event) => {
  const msg = event.data;
  console.log('Stockfish:', msg);

  if (msg === 'uciok') {
    stockfish.postMessage('isready');
  }

  if (msg === 'readyok') {
    engineReady = true;
    console.log('Engine bereit!');
  }

  if (msg.startsWith('bestmove')) {
    const move = msg.split(' ')[1];
    const from = move.slice(0, 2);
    const to = move.slice(2, 4);

    chess.move({ from, to, promotion: 'q' });
    updateBoard();

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

function getLegalMoves() {
  const dests = new Map();
  chess.moves({ verbose: true }).forEach((m) => {
    if (!dests.has(m.from)) dests.set(m.from, []);
    dests.get(m.from).push(m.to);
  });
  return dests;
}

function onMove(from, to) {
  chess.move({ from, to, promotion: 'q' });

  console.log('Nach Spielerzug:');
  console.log('isCheckmate:', chess.isCheckmate());
  console.log('turn:', chess.turn()); // 'b' = Schwarz dran, 'w' = Weiß dran
  console.log('FEN:', chess.fen());

  if (chess.isCheckmate()) {
    showOverlay('Schachmatt.', 'Du gewinnst diese Partie · Glückwunsch!');
    return;
  }

  if (chess.isDraw()) {
    showOverlay('Remis.', 'Die Partie endet unentschieden');
    return;
  }

  if (!chess.isGameOver()) {
    stockfish.postMessage('position fen ' + chess.fen());
    stockfish.postMessage('go movetime 500');
  }
}

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

const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlayTitle');
const overlaySub = document.getElementById('overlaySub');
const overlayBtn = document.getElementById('overlayBtn');

function showOverlay(title, sub) {
  overlayTitle.textContent = title;
  overlaySub.textContent = sub;

  setTimeout(() => {
    overlay.classList.remove('hidden');
    setTimeout(() => overlay.classList.add('visible'), 10);
  }, 1000);
}

overlayBtn.addEventListener('click', () => {
  overlay.classList.remove('visible');
  setTimeout(() => overlay.classList.add('hidden'), 400);
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
