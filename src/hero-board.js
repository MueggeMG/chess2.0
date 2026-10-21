// =========================================
// HERO-BRETT: langsame Partie Stockfish vs. Stockfish
// Ein Zug alle 1 bis 3 Sekunden, nur sichtbar in den Layouts mit Brett.
// =========================================
import { Chess } from 'chess.js';
import { Chessground } from 'chessground';
import 'chessground/assets/chessground.base.css';
import 'chessground/assets/chessground.cburnett.css';

const host = document.getElementById('heroBoard');

const MIN_DELAY = 1000;
const MAX_DELAY = 3000;
const RESTART_DELAY = 5000;
const MAX_PLIES = 160;
const SKILL = 12;
const THINK_MS = 120;
const OPENINGS = ['e2e4', 'd2d4', 'c2c4', 'g1f3'];

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

if (host) {
  const chess = new Chess();
  const ground = Chessground(host, {
    fen: chess.fen(),
    viewOnly: true,
    coordinates: false,
    animation: { enabled: !reducedMotion, duration: 450 },
    highlight: { lastMove: true, check: true },
  });

  // Chessground rechnet mit der Größe des Felds: bei jeder Änderung neu zeichnen
  // (z. B. wenn ein Designwechsel das Brett ein- oder ausblendet).
  if ('ResizeObserver' in window) {
    new ResizeObserver(() => ground.redrawAll()).observe(host);
  }

  let worker = null;
  let ready = false;
  let pending = null; // { resolve }
  let timer = null;

  const visible = () => host.offsetParent !== null && !document.hidden;

  function startWorker() {
    try {
      worker = new Worker(import.meta.env.BASE_URL + 'stockfish.js');
    } catch {
      worker = null;
      return;
    }
    worker.onmessage = (e) => {
      const msg = typeof e.data === 'string' ? e.data : '';
      if (msg === 'uciok') {
        worker.postMessage(`setoption name Skill Level value ${SKILL}`);
        worker.postMessage('isready');
      } else if (msg === 'readyok') {
        ready = true;
      } else if (msg.startsWith('bestmove') && pending) {
        const p = pending;
        pending = null;
        p.resolve(msg.split(' ')[1]);
      }
    };
    worker.onerror = () => {
      ready = false;
    };
    worker.postMessage('uci');
  }

  function ask(fen) {
    return new Promise((resolve) => {
      pending = { resolve };
      worker.postMessage('position fen ' + fen);
      worker.postMessage(`go movetime ${THINK_MS}`);
    });
  }

  const wait = (ms) => new Promise((r) => (timer = setTimeout(r, ms)));

  function show(lastMove) {
    ground.set({
      fen: chess.fen(),
      lastMove,
      check: chess.inCheck(),
      turnColor: chess.turn() === 'w' ? 'white' : 'black',
    });
  }

  function newGame() {
    chess.reset();
    show(undefined);
  }

  async function loop() {
    for (;;) {
      if (!visible()) {
        await wait(1000);
        continue;
      }
      if (!worker) startWorker();
      if (!ready) {
        await wait(400);
        continue;
      }

      if (chess.isGameOver() || chess.history().length >= MAX_PLIES) {
        await wait(RESTART_DELAY);
        newGame();
        await wait(MIN_DELAY);
        continue;
      }

      const delay = MIN_DELAY + Math.random() * (MAX_DELAY - MIN_DELAY);
      const first = chess.history().length === 0;
      const fen = chess.fen();

      // Engine rechnet, während die Wartezeit läuft
      const [uci] = await Promise.all([
        first ? Promise.resolve(OPENINGS[Math.floor(Math.random() * OPENINGS.length)]) : ask(fen),
        wait(delay),
      ]);

      // Während des Wartens ausgeblendet oder zurückgesetzt: Zug verwerfen
      if (!visible() || chess.fen() !== fen) continue;

      const from = uci.slice(0, 2);
      const to = uci.slice(2, 4);
      const promotion = uci.length > 4 ? uci[4] : 'q';
      try {
        chess.move({ from, to, promotion });
      } catch {
        newGame();
        continue;
      }
      show([from, to]);
    }
  }

  // Wer Bewegung reduziert haben möchte, sieht nur die Grundstellung.
  if (!reducedMotion) loop();
}
