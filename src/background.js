const FD = 17;

// Abwechselnd weiß/schwarz für Tiefe – auf dunklem Hintergrund v.a. weiße Figuren sichtbar
const COLORS = ['white','white','black','white','white','black','white',
                 'white','black','white','black','white','white','black','white'];

const cfg = [
  { t: 'pawn',   x: '2%',  sz: 75,  ra: 'rcw',  rd: 11, fd: 0   },
  { t: 'rook',   x: '9%',  sz: 110, ra: 'rccw', rd: 9,  fd: -3  },
  { t: 'bishop', x: '16%', sz: 95,  ra: 'rcw',  rd: 13, fd: -7  },
  { t: 'queen',  x: '22%', sz: 125, ra: 'rccw', rd: 10, fd: -12 },
  { t: 'knight', x: '30%', sz: 115, ra: 'rcw',  rd: 14, fd: -1  },
  { t: 'king',   x: '37%', sz: 120, ra: 'rccw', rd: 8,  fd: -5  },
  { t: 'pawn',   x: '44%', sz: 70,  ra: 'rccw', rd: 10, fd: -10 },
  { t: 'rook',   x: '51%', sz: 105, ra: 'rcw',  rd: 15, fd: -15 },
  { t: 'bishop', x: '58%', sz: 90,  ra: 'rccw', rd: 12, fd: -8  },
  { t: 'queen',  x: '64%', sz: 120, ra: 'rcw',  rd: 9,  fd: -2  },
  { t: 'knight', x: '71%', sz: 110, ra: 'rccw', rd: 11, fd: -13 },
  { t: 'king',   x: '78%', sz: 115, ra: 'rcw',  rd: 13, fd: -4  },
  { t: 'pawn',   x: '84%', sz: 80,  ra: 'rccw', rd: 12, fd: -9  },
  { t: 'bishop', x: '89%', sz: 90,  ra: 'rcw',  rd: 14, fd: -16 },
  { t: 'rook',   x: '93%', sz: 100, ra: 'rccw', rd: 8,  fd: -6  },
];

const sg = document.getElementById('sg');

cfg.forEach((c, i) => {
  const h = Math.round(c.sz * 1.3);
  const color = COLORS[i];
  const div = document.createElement('div');
  div.className = 'pw';
  div.style.cssText = `left:${c.x}; animation: fall ${FD}s linear ${c.fd}s infinite;`;
  div.innerHTML = `
    <div class="cg-wrap bg-piece-wrap"
         style="width:${c.sz}px; height:${h}px; animation: ${c.ra} ${c.rd}s linear ${c.fd}s infinite;">
      <piece class="${c.t} ${color}"></piece>
    </div>`;
  sg.appendChild(div);
});
