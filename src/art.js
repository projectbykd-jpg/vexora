// All art is generated in code (original, no third-party assets).
import { mulberry32 } from './rng.js';
import { BLOCKS } from './items.js';

export const TILE = 48;
const VARIANTS = 4;

function canvas(w, h, dpr) {
  const c = document.createElement('canvas');
  c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
  const g = c.getContext('2d');
  g.scale(dpr, dpr);
  return [c, g];
}

function vgrad(g, y0, y1, c0, c1) {
  const gr = g.createLinearGradient(0, y0, 0, y1);
  gr.addColorStop(0, c0); gr.addColorStop(1, c1);
  return gr;
}

function speckle(g, rng, n, colors, rMin, rMax) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = colors[(rng() * colors.length) | 0];
    const r = rMin + rng() * (rMax - rMin);
    g.beginPath(); g.ellipse(rng() * TILE, rng() * TILE, r, r * (0.6 + rng() * 0.5), rng() * 3, 0, 7); g.fill();
  }
}

function bevel(g) {
  g.fillStyle = 'rgba(255,255,255,.20)'; g.fillRect(0, 0, TILE, 2); g.fillRect(0, 0, 2, TILE);
  g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(0, TILE - 2, TILE, 2); g.fillRect(TILE - 2, 0, 2, TILE);
}

const PAINT = {
  dirt(g, rng) {
    g.fillStyle = vgrad(g, 0, TILE, '#9c6636', '#7a4a25'); g.fillRect(0, 0, TILE, TILE);
    speckle(g, rng, 26, ['#5e3a1c', '#b27b46', '#6d4322'], 0.8, 2.4);
    for (let i = 0; i < 3; i++) {                                   // pebbles
      const x = 6 + rng() * 36, y = 6 + rng() * 36, r = 2 + rng() * 2.5;
      g.fillStyle = '#9a8f86'; g.beginPath(); g.ellipse(x, y, r, r * 0.75, 0, 0, 7); g.fill();
      g.fillStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.ellipse(x - r * 0.3, y - r * 0.3, r * 0.4, r * 0.3, 0, 0, 7); g.fill();
    }
  },
  stone(g, rng) {
    g.fillStyle = vgrad(g, 0, TILE, '#929aa8', '#69707e'); g.fillRect(0, 0, TILE, TILE);
    for (let i = 0; i < 5; i++) {                                   // facets
      g.fillStyle = rng() < 0.5 ? 'rgba(255,255,255,.10)' : 'rgba(0,0,0,.12)';
      g.beginPath(); g.moveTo(rng() * TILE, rng() * TILE);
      g.lineTo(rng() * TILE, rng() * TILE); g.lineTo(rng() * TILE, rng() * TILE); g.fill();
    }
    g.strokeStyle = 'rgba(30,35,50,.35)'; g.lineWidth = 1.2; g.beginPath();
    let x = rng() * TILE, y = 0; g.moveTo(x, y);
    for (let i = 0; i < 4; i++) { x += (rng() - 0.5) * 14; y += 8 + rng() * 6; g.lineTo(x, y); }
    g.stroke();
    speckle(g, rng, 14, ['rgba(255,255,255,.28)', 'rgba(0,0,0,.2)'], 0.6, 1.8);
  },
  wood(g, rng) {
    g.fillStyle = vgrad(g, 0, TILE, '#c8935a', '#a8753f'); g.fillRect(0, 0, TILE, TILE);
    for (let i = 0; i < 3; i++) {                                   // vertical planks
      const x = i * 16;
      g.fillStyle = i % 2 ? 'rgba(0,0,0,.06)' : 'rgba(255,255,255,.07)'; g.fillRect(x, 0, 16, TILE);
      g.fillStyle = 'rgba(60,30,10,.45)'; g.fillRect(x, 0, 1.5, TILE);
      g.strokeStyle = 'rgba(90,52,22,.35)'; g.lineWidth = 1;
      for (let k = 0; k < 3; k++) {
        g.beginPath(); const gx = x + 3 + k * 4.5 + rng() * 2; g.moveTo(gx, 0);
        g.bezierCurveTo(gx + 3, 14, gx - 3, 30, gx + 1, TILE); g.stroke();
      }
      g.fillStyle = '#5a3a1e'; g.beginPath(); g.arc(x + 8, 5, 1.2, 0, 7); g.arc(x + 8, TILE - 5, 1.2, 0, 7); g.fill();
    }
  },
  bedrock(g, rng) {
    g.fillStyle = vgrad(g, 0, TILE, '#3a3b46', '#1d1e25'); g.fillRect(0, 0, TILE, TILE);
    for (let i = 0; i < 7; i++) {
      g.fillStyle = `rgba(${110 + rng() * 40},${90 + rng() * 30},${170 + rng() * 40},${0.12 + rng() * 0.15})`;
      g.beginPath(); g.moveTo(rng() * TILE, rng() * TILE); g.lineTo(rng() * TILE, rng() * TILE); g.lineTo(rng() * TILE, rng() * TILE); g.fill();
    }
    speckle(g, rng, 10, ['rgba(180,160,255,.35)'], 0.5, 1.2);
  },
  sand(g, rng) {
    g.fillStyle = vgrad(g, 0, TILE, '#f0dc9c', '#d9bd72'); g.fillRect(0, 0, TILE, TILE);
    g.strokeStyle = 'rgba(160,120,50,.28)'; g.lineWidth = 1.4;
    for (let i = 0; i < 4; i++) { const y = 6 + i * 11 + rng() * 3; g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(14, y - 4, 30, y + 4, TILE, y - 1); g.stroke(); }
    speckle(g, rng, 30, ['rgba(255,255,255,.4)', 'rgba(150,110,40,.35)'], 0.5, 1.4);
  },
  grass(g, rng) {
    g.fillStyle = vgrad(g, 0, TILE, '#6fd16a', '#3f9a4a'); g.fillRect(0, 0, TILE, TILE);
    g.strokeStyle = 'rgba(30,100,40,.45)'; g.lineWidth = 1.6; g.lineCap = 'round';
    for (let i = 0; i < 16; i++) { const x = rng() * TILE, y = 6 + rng() * 38; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rng() - 0.5) * 6, y - 7); g.stroke(); }
    speckle(g, rng, 14, ['rgba(255,255,255,.22)', 'rgba(20,80,30,.25)'], 0.8, 2);
  },
  brick(g, rng) {
    g.fillStyle = '#6b2f26'; g.fillRect(0, 0, TILE, TILE);
    for (let r = 0; r < 4; r++) {
      const off = r % 2 ? 12 : 0;
      for (let c = -1; c < 3; c++) {
        const x = c * 24 + off, y = r * 12;
        g.fillStyle = vgrad(g, y, y + 11, '#c4604a', '#a04634'); g.fillRect(x + 1, y + 1, 22, 10);
        g.fillStyle = 'rgba(255,255,255,.16)'; g.fillRect(x + 1, y + 1, 22, 2);
        g.fillStyle = `rgba(0,0,0,${0.05 + rng() * 0.1})`; g.fillRect(x + 1 + rng() * 14, y + 4, 6, 5);
      }
    }
  },
  glass(g, rng) {
    g.fillStyle = 'rgba(190,240,250,.38)'; g.fillRect(0, 0, TILE, TILE);
    g.strokeStyle = 'rgba(255,255,255,.8)'; g.lineWidth = 3; g.strokeRect(2, 2, TILE - 4, TILE - 4);
    g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 3; g.lineCap = 'round';
    g.beginPath(); g.moveTo(10, 36); g.lineTo(26, 10); g.moveTo(24, 40); g.lineTo(38, 18); g.stroke();
    g.strokeStyle = 'rgba(80,170,200,.55)'; g.lineWidth = 1.5; g.strokeRect(5, 5, TILE - 10, TILE - 10);
  },
  back(g, rng) {                                                    // cave back wall
    g.fillStyle = vgrad(g, 0, TILE, '#4a3526', '#3a2a1f'); g.fillRect(0, 0, TILE, TILE);
    speckle(g, rng, 14, ['rgba(0,0,0,.25)', 'rgba(255,220,180,.07)'], 1, 3);
  },
};

export function createArt(dpr = 1) {
  dpr = Math.min(2, Math.max(1, Math.ceil(dpr)));
  const tiles = {};
  for (const id of [...Object.keys(PAINT)]) {
    tiles[id] = [];
    for (let v = 0; v < VARIANTS; v++) {
      const [c, g] = canvas(TILE, TILE, dpr);
      PAINT[id](g, mulberry32(id.length * 977 + v * 131 + id.charCodeAt(0)));
      if (id !== 'back' && id !== 'glass') bevel(g);
      tiles[id].push(c);
    }
  }

  // grass cap drawn over dirt that has open air above it
  const grass = [];
  for (let v = 0; v < VARIANTS; v++) {
    const [c, g] = canvas(TILE, 18, dpr);
    const rng = mulberry32(900 + v);
    g.fillStyle = vgrad(g, 0, 14, '#7fe07a', '#3fa84f'); g.beginPath(); g.moveTo(0, 0); g.lineTo(TILE, 0); g.lineTo(TILE, 9);
    for (let x = TILE; x >= 0; x -= 4) g.lineTo(x, 9 + rng() * 6);
    g.closePath(); g.fill();
    g.fillStyle = 'rgba(255,255,255,.28)'; g.fillRect(0, 0, TILE, 2);
    g.strokeStyle = '#55c25f'; g.lineWidth = 1.6; g.lineCap = 'round';
    for (let i = 0; i < 5; i++) { const x = 3 + rng() * 42; g.beginPath(); g.moveTo(x, 1); g.lineTo(x + (rng() - 0.5) * 4, -5 - rng() * 4); g.stroke(); }
    grass.push(c);
  }

  // crack overlays, 3 stages
  const cracks = [];
  for (let s = 1; s <= 3; s++) {
    const [c, g] = canvas(TILE, TILE, dpr);
    const rng = mulberry32(42);
    g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = 1.6; g.lineCap = 'round'; g.lineJoin = 'round';
    for (let i = 0; i < s * 2 + 1; i++) {
      g.beginPath(); let x = TILE / 2 + (rng() - 0.5) * 8, y = TILE / 2 + (rng() - 0.5) * 8; g.moveTo(x, y);
      const a = rng() * 6.28;
      for (let k = 0; k < 3; k++) { x += Math.cos(a + (rng() - 0.5)) * (6 + s * 3); y += Math.sin(a + (rng() - 0.5)) * (6 + s * 3); g.lineTo(x, y); }
      g.stroke();
    }
    cracks.push(c);
  }

  function seedIcon(color) {
    const [c, g] = canvas(44, 44, 2);
    g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.ellipse(22, 38, 13, 4, 0, 0, 7); g.fill();
    g.fillStyle = '#e7d3a7'; g.strokeStyle = '#8a6a3a'; g.lineWidth = 1.5;
    g.beginPath(); g.roundRect(9, 14, 26, 24, 5); g.fill(); g.stroke();
    g.fillStyle = color; g.fillRect(10, 22, 24, 9);
    g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(10, 22, 24, 2);
    g.strokeStyle = '#3f9d4b'; g.lineWidth = 2.5; g.lineCap = 'round';
    g.beginPath(); g.moveTo(22, 14); g.quadraticCurveTo(22, 7, 26, 4); g.stroke();
    g.fillStyle = '#6fd07a'; g.beginPath(); g.ellipse(27, 5, 6, 3, -0.6, 0, 7); g.fill();
    g.beginPath(); g.ellipse(18, 9, 5, 2.6, 0.6, 0, 7); g.fill();
    return c.toDataURL();
  }
  function blockIcon(id) {
    const [c, g] = canvas(44, 44, 2);
    g.save(); g.beginPath(); g.roundRect(4, 4, 36, 36, 7); g.clip();
    g.drawImage(tiles[id][0], 4, 4, 36, 36);
    g.restore();
    g.strokeStyle = 'rgba(0,0,0,.4)'; g.lineWidth = 1.5; g.beginPath(); g.roundRect(4, 4, 36, 36, 7); g.stroke();
    return c.toDataURL();
  }
  function fistIcon() {
    const [c, g] = canvas(44, 44, 2);
    g.fillStyle = vgrad(g, 8, 36, '#ffe0b8', '#f2b684'); g.strokeStyle = '#a56a3a'; g.lineWidth = 1.6;
    g.beginPath(); g.roundRect(10, 12, 24, 22, 8); g.fill(); g.stroke();
    for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(16 + i * 6, 14); g.lineTo(16 + i * 6, 22); g.stroke(); }
    g.beginPath(); g.roundRect(8, 24, 12, 12, 5); g.fill(); g.stroke();
    return c.toDataURL();
  }
  const iconCache = {};
  function icon(id) {
    if (iconCache[id]) return iconCache[id];
    if (id === 'fist') return (iconCache[id] = fistIcon());
    if (id.startsWith('seed_')) return (iconCache[id] = seedIcon(BLOCKS[id.slice(5)].color));
    return (iconCache[id] = blockIcon(id));
  }

  const imgCache = {};
  function iconImg(id) {
    if (!imgCache[id]) { const im = new Image(); im.src = icon(id); imgCache[id] = im; }
    return imgCache[id];
  }
  return { tiles, grass, cracks, icon, iconImg, VARIANTS };
}
