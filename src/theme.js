// =========================================
// DESIGN-AUSWAHL + EINSTELLUNGEN (geteilt von Menü und Spielseite)
// =========================================
import './themes.css';

export const THEMES = [
  { id: 'a', name: 'Klassisch Gold',  tag: 'Dunkel · Klassisch', swatch: ['#0a0a0a', '#c9a84c', '#f5f3ee'] },
  { id: 'b', name: 'Turnierpapier',   tag: 'Hell · Grün',        swatch: ['#1f4d3f', '#f3efe6', '#d9c48a'] },
  { id: 'c', name: 'Bento Dunkel',    tag: 'Dunkel · Modern',    swatch: ['#0a0e13', '#121921', '#4fd1b5'] },
  { id: 'd', name: 'Clean Hell',      tag: 'Hell · Blau',        swatch: ['#eef1f5', '#ffffff', '#2f5bea'] },
  { id: 'e', name: 'Clean Dunkel',    tag: 'Dunkel · Orange',    swatch: ['#0f1115', '#171a21', '#ff7a3d'] },
  { id: 'f', name: 'Schwarz & Gold',  tag: 'Dunkel · Edel',      swatch: ['#0b0a09', '#12100d', '#c8a96a'] },
  { id: 'g', name: 'Bordeaux',        tag: 'Hell · Edel',        swatch: ['#55202c', '#f5efe4', '#d9bd7f'] },
  { id: 'h', name: 'Marine & Silber', tag: 'Hell · Edel',        swatch: ['#14213d', '#eef1f6', '#aab8d4'] },
];

const KEY = 'chess2.theme';
const LAYOUTS = { a: 'center', c: 'bento', d: 'split-cards', e: 'split-cards' };
const layoutFor = (id) => LAYOUTS[id] || 'split-ruled';

export function getTheme() {
  try {
    const t = localStorage.getItem(KEY);
    if (THEMES.some((x) => x.id === t)) return t;
  } catch (e) { /* Storage nicht verfügbar */ }
  return 'a';
}

export function setTheme(id, persist = true) {
  if (!THEMES.some((x) => x.id === id)) id = 'a';
  const root = document.documentElement;
  root.dataset.theme = id;
  root.dataset.layout = layoutFor(id);
  if (persist) {
    try { localStorage.setItem(KEY, id); } catch (e) { /* ignorieren */ }
  }
  document.querySelectorAll('.theme-card').forEach((btn) => {
    const on = btn.dataset.theme === id;
    btn.setAttribute('aria-pressed', String(on));
    const check = btn.querySelector('.theme-check');
    if (check) check.textContent = on ? '✓' : '';
  });
}

function buildUI() {
  const fab = document.createElement('button');
  fab.type = 'button';
  fab.className = 'settings-fab';
  fab.setAttribute('aria-label', 'Einstellungen öffnen');
  fab.title = 'Einstellungen';
  fab.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">' +
    '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/>' +
    '<line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/>' +
    '<line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/>' +
    '<line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>';

  const overlay = document.createElement('div');
  overlay.className = 'settings-overlay';
  overlay.hidden = true;
  overlay.innerHTML =
    '<div class="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settingsTitle">' +
    '<div class="settings-head"><h2 class="settings-title" id="settingsTitle">Einstellungen</h2>' +
    '<button type="button" class="settings-close" aria-label="Schließen">✕</button></div>' +
    '<div><p class="settings-sec-label">Design</p>' +
    '<p class="settings-hint">Wähle das Aussehen des Hauptmenüs und der Spielseite. Die Auswahl wird auf diesem Gerät gespeichert.</p>' +
    '<div class="theme-grid" role="group" aria-label="Design"></div></div></div>';

  const grid = overlay.querySelector('.theme-grid');
  THEMES.forEach((t) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'theme-card';
    b.dataset.theme = t.id;
    b.setAttribute('aria-pressed', 'false');
    const sw = t.swatch.map((c) => `<i style="background:${c}"></i>`).join('');
    b.innerHTML =
      `<span class="theme-swatch" aria-hidden="true">${sw}</span>` +
      `<span class="theme-name"><span>${t.name}</span><span class="theme-check" aria-hidden="true"></span></span>` +
      `<span class="theme-tag">${t.tag}</span>`;
    b.addEventListener('click', () => setTheme(t.id));
    grid.appendChild(b);
  });

  const close = overlay.querySelector('.settings-close');
  const open = () => {
    overlay.hidden = false;
    setTheme(getTheme(), false);
    close.focus();
  };
  const shut = () => {
    overlay.hidden = true;
    fab.focus();
  };

  fab.addEventListener('click', open);
  close.addEventListener('click', shut);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) shut(); });
  document.addEventListener('keydown', (e) => {
    if (overlay.hidden) return;
    if (e.key === 'Escape') { shut(); return; }
    if (e.key === 'Tab') {
      const items = [...overlay.querySelectorAll('button')];
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  document.body.append(fab, overlay);
}

setTheme(getTheme(), false);
if (document.body) buildUI();
else document.addEventListener('DOMContentLoaded', buildUI);
