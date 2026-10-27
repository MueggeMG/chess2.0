// =========================================
// IMPORTS
// =========================================
import { io } from 'socket.io-client';
import './theme.js';
import './hero-board.js';

// =========================================
// SERVER VERBINDUNG
// =========================================
const socket = io('https://chess2-0-server.onrender.com');

// =========================================
// ZEITKONTROLLE
// =========================================
const TIME_CONTROLS = [
  { mins: 1,  inc: 0,  cat: 'Bullet'         },
  { mins: 2,  inc: 1,  cat: 'Bullet'         },
  { mins: 3,  inc: 0,  cat: 'Blitz'          },
  { mins: 3,  inc: 2,  cat: 'Blitz'          },
  { mins: 5,  inc: 0,  cat: 'Blitz'          },
  { mins: 5,  inc: 3,  cat: 'Blitz'          },
  { mins: 10, inc: 0,  cat: 'Schnellschach'  },
  { mins: 10, inc: 5,  cat: 'Schnellschach'  },
  { mins: 15, inc: 10, cat: 'Schnellschach'  },
  { mins: 30, inc: 0,  cat: 'Klassisch'      },
  { mins: 30, inc: 20, cat: 'Klassisch'      },
  { custom: true,      cat: 'Andere Spielzeit' },
];

let selectedTC = TIME_CONTROLS[6]; // Default: 10+0 Schnellschach

const tcGrid    = document.getElementById('tcGrid');
const tcCustom  = document.getElementById('tcCustom');
const tcMinsEl  = document.getElementById('tcMins');
const tcIncEl   = document.getElementById('tcInc');
const tcCustomOk = document.getElementById('tcCustomOk');

function renderTCGrid() {
  tcGrid.innerHTML = '';
  TIME_CONTROLS.forEach((tc) => {
    const btn = document.createElement('button');
    btn.className = 'tc-btn' + (tc === selectedTC ? ' active' : '');
    if (tc.custom) {
      btn.innerHTML = `<span class="tc-cat">${tc.cat}</span>`;
    } else {
      btn.innerHTML = `<span class="tc-time">${tc.mins}+${tc.inc}</span><span class="tc-cat">${tc.cat}</span>`;
    }
    btn.addEventListener('click', () => {
      selectedTC = tc;
      if (tc.custom) {
        tcCustom.classList.remove('hidden');
      } else {
        tcCustom.classList.add('hidden');
      }
      renderTCGrid();
    });
    tcGrid.appendChild(btn);
  });
}
renderTCGrid();

tcCustomOk.addEventListener('click', () => {
  const m = Math.max(1, parseInt(tcMinsEl.value) || 10);
  const s = Math.max(0, parseInt(tcIncEl.value)  || 0);
  selectedTC = { mins: m, inc: s, cat: 'Benutzerdefiniert', custom: false };
  tcCustom.classList.add('hidden');
  renderTCGrid();
});

// =========================================
// LOBBY LOGIK
// =========================================
const createBtn = document.getElementById('createBtn');
const joinBtn = document.getElementById('joinBtn');
const roomInput = document.getElementById('roomInput');
const roomCodeDisplay = document.getElementById('roomCodeDisplay');
const roomCodeEl = document.getElementById('roomCode');
const waitingScreen = document.getElementById('waitingScreen');
const joinError = document.getElementById('joinError');

let currentRoom = null;
let myColor = null;

// Raum erstellen
createBtn.addEventListener('click', () => {
  socket.emit('create-room', { time: selectedTC.mins * 60, inc: selectedTC.inc });
  createBtn.disabled = true;
  createBtn.textContent = 'Erstelle Raum...';
});

// Raum beitreten
joinBtn.addEventListener('click', () => {
  const code = roomInput.value.trim().toUpperCase();
  if (!code) return;
  joinError.classList.add('hidden');
  socket.emit('join-room', code);
});

// Enter im Input
roomInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') joinBtn.click();
});

// =========================================
// SOCKET EVENTS
// =========================================

// Raum wurde erstellt
socket.on('room-created', (roomId) => {
  currentRoom = roomId;
  roomCodeEl.textContent = roomId;
  roomCodeDisplay.classList.remove('hidden');
  waitingScreen.classList.remove('hidden');
  createBtn.textContent = 'Warte auf Gegner...';
});

// Raum beigetreten
socket.on('room-joined', (roomId) => {
  currentRoom = roomId;
  waitingScreen.classList.remove('hidden');
  joinBtn.disabled = true;
  joinBtn.textContent = 'Verbunden!';
});

// Fehler
socket.on('error', (msg) => {
  joinError.textContent = msg;
  joinError.classList.remove('hidden');
});

// Spiel startet
socket.on('game-start', ({ white, black, time, inc }) => {
  myColor = socket.id === white ? 'white' : 'black';
  // Zur Spielseite weiterleiten mit Raumcode, Farbe und Zeitkontrolle
  window.location.href = `/chess2.0/game.html?room=${currentRoom}&color=${myColor}&time=${time}&inc=${inc}`;
});

// =========================================
// SCHWIERIGKEIT & GEGEN COMPUTER
// =========================================
const SKILL_LEVELS = [
  { skill: 2,  time: 25,   label: 'Anfänger' },
  { skill: 10, time: 125,  label: 'Mittel'   },
  { skill: 16, time: 250,  label: 'Stark'    },
  { skill: 20, time: 1000, label: 'Meister'  },
];
let selectedDiff = SKILL_LEVELS[1]; // Default: Mittel

const diffGrid = document.getElementById('diffGrid');
const soloBtn  = document.getElementById('soloBtn');

function renderDiffGrid() {
  diffGrid.innerHTML = '';
  SKILL_LEVELS.forEach((d) => {
    const btn = document.createElement('button');
    btn.className = 'tc-btn diff-btn' + (d === selectedDiff ? ' active' : '');
    btn.innerHTML = `<span class="tc-cat diff-label">${d.label}</span>`;
    btn.addEventListener('click', () => {
      selectedDiff = d;
      renderDiffGrid();
    });
    diffGrid.appendChild(btn);
  });
}
renderDiffGrid();

// Neues Spiel gestartet: gespeicherten Spielstand verwerfen (Fortsetzen nur per Neuladen)
function clearSavedGame(kind) {
  try { localStorage.removeItem('chess2.game.' + kind); } catch (e) { /* Storage nicht verfügbar */ }
}

soloBtn.addEventListener('click', () => {
  clearSavedGame('solo');
  const time  = selectedTC.mins * 60;
  const inc   = selectedTC.inc;
  const skill = selectedDiff.skill;
  window.location.href = `/chess2.0/game.html?skill=${skill}&time=${time}&inc=${inc}`;
});

const hotSeatBtn = document.getElementById('hotSeatBtn');
hotSeatBtn.addEventListener('click', () => {
  clearSavedGame('hotseat');
  const time = selectedTC.mins * 60;
  const inc  = selectedTC.inc;
  window.location.href = `/chess2.0/game.html?mode=hotseat&time=${time}&inc=${inc}`;
});
