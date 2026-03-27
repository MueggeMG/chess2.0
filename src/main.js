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
