// =========================================
// IMPORTS
// =========================================
import { io } from 'socket.io-client';

// =========================================
// SERVER VERBINDUNG
// =========================================
const socket = io('https://chess2-0-server.onrender.com');

// =========================================
// HINTERGRUND ANIMATION
// =========================================
const C = 'rgb(201,168,76)';
const FD = 17;

const P = {
  pawn: `
    <circle cx="20" cy="8" r="7.5"/>
    <path d="M17 14.5 Q14 22 13 31 L27 31 Q26 22 23 14.5 Q21.5 16 20 16 Q18.5 16 17 14.5Z"/>
    <path d="M13 31 Q12 36 11 40 L29 40 Q28 36 27 31Z"/>
    <rect x="8"  y="40" width="24" height="3"  rx="1.5"/>
    <rect x="5"  y="43" width="30" height="3"  rx="1.5"/>
    <rect x="3"  y="46" width="34" height="6"  rx="3"/>`,
  rook: `
    <rect x="4"  y="3"  width="9"  height="14" rx="1.5"/>
    <rect x="15" y="3"  width="10" height="14" rx="1.5"/>
    <rect x="27" y="3"  width="9"  height="14" rx="1.5"/>
    <rect x="4"  y="14" width="32" height="4"/>
    <rect x="7"  y="18" width="26" height="18"/>
    <path d="M7 36 Q5 40 5 43 L35 43 Q35 40 33 36Z"/>
    <rect x="3"  y="43" width="34" height="3"  rx="1.5"/>
    <rect x="1"  y="46" width="38" height="6"  rx="3"/>`,
  queen: `
    <circle cx="20" cy="3"  r="3"/>
    <circle cx="11" cy="7"  r="2.5"/>
    <circle cx="29" cy="7"  r="2.5"/>
    <circle cx="4"  cy="12" r="2"/>
    <circle cx="36" cy="12" r="2"/>
    <polygon points="4,12 11,7 20,3 29,7 36,12 38,19 2,19"/>
    <path d="M4 19 Q5 28 7 38 L33 38 Q35 28 36 19Z"/>
    <rect x="5"  y="38" width="30" height="3"  rx="1.5"/>
    <rect x="3"  y="41" width="34" height="3"  rx="1.5"/>
    <rect x="1"  y="44" width="38" height="8"  rx="4"/>`,
  king: `
    <rect x="18.5" y="1"  width="3"  height="15" rx="1.5"/>
    <rect x="12"   y="6"  width="16" height="3"  rx="1.5"/>
    <path d="M15 16 Q13 26 12 38 L28 38 Q27 26 25 16Z"/>
    <rect x="9"  y="38" width="22" height="3"  rx="1.5"/>
    <rect x="6"  y="41" width="28" height="3"  rx="1.5"/>
    <rect x="3"  y="44" width="34" height="8"  rx="3"/>`,
};

const cfg = [
  { t: 'pawn', x: '5%', sz: 30, ra: 'rcw', rd: 11, fd: 0 },
  { t: 'rook', x: '15%', sz: 44, ra: 'rccw', rd: 9, fd: -3 },
  { t: 'queen', x: '25%', sz: 50, ra: 'rccw', rd: 10, fd: -12 },
  { t: 'king', x: '40%', sz: 48, ra: 'rccw', rd: 8, fd: -5 },
  { t: 'pawn', x: '55%', sz: 28, ra: 'rccw', rd: 10, fd: -10 },
  { t: 'rook', x: '65%', sz: 42, ra: 'rcw', rd: 15, fd: -15 },
  { t: 'queen', x: '75%', sz: 48, ra: 'rcw', rd: 9, fd: -2 },
  { t: 'king', x: '88%', sz: 46, ra: 'rcw', rd: 13, fd: -4 },
];

const sg = document.getElementById('sg');
cfg.forEach((c) => {
  const h = Math.round(c.sz * 1.3);
  const div = document.createElement('div');
  div.className = 'pw';
  div.style.cssText = `left:${c.x}; animation: fall ${FD}s linear ${c.fd}s infinite;`;
  div.innerHTML = `
    <svg viewBox="0 0 40 52" width="${c.sz}" height="${h}"
         style="animation: ${c.ra} ${c.rd}s linear ${c.fd}s infinite;"
         fill="${C}">
      ${P[c.t]}
    </svg>`;
  sg.appendChild(div);
});

// =========================================
// CURSOR
// =========================================
const cursor = document.getElementById('cursor');
let mx = 0,
  my = 0,
  cx = 0,
  cy = 0;

document.addEventListener('mousemove', (e) => {
  mx = e.clientX;
  my = e.clientY;
});
(function animCursor() {
  cx += (mx - cx) * 0.12;
  cy += (my - cy) * 0.12;
  cursor.style.transform = `translate(${cx - 4}px, ${cy - 4}px)`;
  requestAnimationFrame(animCursor);
})();

document.querySelectorAll('button, .lobby-card').forEach((el) => {
  el.addEventListener('mouseenter', () => cursor.classList.add('grow'));
  el.addEventListener('mouseleave', () => cursor.classList.remove('grow'));
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
  socket.emit('create-room');
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
socket.on('game-start', ({ white, black }) => {
  myColor = socket.id === white ? 'white' : 'black';
  // Zur Spielseite weiterleiten mit Raumcode und Farbe
  window.location.href = `/chess2.0/game.html?room=${currentRoom}&color=${myColor}`;
});
