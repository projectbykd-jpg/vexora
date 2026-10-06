import { W, H, idx, key, SURFACE } from './world.js';
import { BLOCKS, TUNING } from './items.js';
import { PLAYER } from './physics.js';
import { isMature } from './game.js';

export const TILE = 32;

const hash = (x, y) => { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let cw = 0, ch = 0, dpr = 1;
  const cam = { x: 0, y: 0 };

  function resize() {
    dpr = window.devicePixelRatio || 1;
    cw = window.innerWidth; ch = window.innerHeight;
    canvas.width = cw * dpr; canvas.height = ch * dpr;
  }
  resize();
  window.addEventListener('resize', resize);

  const screenToTile = (sx, sy) => ({ x: Math.floor((sx + cam.x) / TILE), y: Math.floor((sy + cam.y) / TILE) });

  function drawBlock(id, px, py, tx, ty, s) {
    const b = BLOCKS[id];
    if (id === 'gate') {
      ctx.fillStyle = '#c9b27a'; ctx.fillRect(px + 4, py, TILE - 8, TILE);
      ctx.fillStyle = b.color; ctx.fillRect(px + 8, py + 4, TILE - 16, TILE - 4);
      ctx.fillStyle = '#7a5c2e'; ctx.fillRect(px + TILE - 14, py + TILE / 2, 3, 3);
      return;
    }
    ctx.fillStyle = b.color; ctx.fillRect(px, py, TILE, TILE);
    ctx.fillStyle = '#00000022';
    for (let i = 0; i < 4; i++) { const r = hash(tx * 7 + i, ty * 13 + i); ctx.fillRect(px + ((r * 28) | 0), py + ((hash(tx + i, ty * 3) * 28) | 0), 3, 3); }
    ctx.strokeStyle = '#0003'; ctx.strokeRect(px + .5, py + .5, TILE - 1, TILE - 1);
    if (id === 'dirt' && s.tiles[idx(tx, ty - 1)] === 'air' && ty > 0) { ctx.fillStyle = '#4caf50'; ctx.fillRect(px, py, TILE, 6); }
    if (id === 'wood') { ctx.fillStyle = '#00000018'; ctx.fillRect(px + 8, py, 3, TILE); ctx.fillRect(px + 20, py, 3, TILE); }
  }

  function drawPlant(p, px, py, now) {
    const mature = isMature(p, now);
    const t = Math.min(1, (now - p.plantedAt) / (BLOCKS[p.block].growSec * 1000));
    const h = mature ? TILE * 0.95 : 6 + t * 14;
    ctx.fillStyle = '#3f9d4b'; ctx.fillRect(px + TILE / 2 - 2, py + TILE - h, 4, h);
    if (mature) {
      ctx.fillStyle = BLOCKS[p.block].color; ctx.fillRect(px + 6, py + 2, TILE - 12, 12);
      ctx.strokeStyle = '#ffcf5c'; ctx.lineWidth = 2; ctx.strokeRect(px + 6, py + 2, TILE - 12, 12); ctx.lineWidth = 1;
    } else {
      ctx.fillStyle = '#6fd07a'; ctx.fillRect(px + TILE / 2 - 7, py + TILE - h - 2, 14, 5);
    }
  }

  function render(s, now, hover) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const g = ctx.createLinearGradient(0, 0, 0, ch);
    g.addColorStop(0, '#6ec3ff'); g.addColorStop(1, '#cdeeff');
    ctx.fillStyle = g; ctx.fillRect(0, 0, cw, ch);

    const p = s.player;
    cam.x = Math.max(0, Math.min(W * TILE - cw, (p.x + PLAYER.w / 2) * TILE - cw / 2));
    cam.y = Math.max(0, Math.min(H * TILE - ch, (p.y + PLAYER.h / 2) * TILE - ch / 2));
    if (W * TILE < cw) cam.x = -(cw - W * TILE) / 2;
    if (H * TILE < ch) cam.y = -(ch - H * TILE) / 2;

    const x0 = Math.max(0, Math.floor(cam.x / TILE)), x1 = Math.min(W - 1, Math.ceil((cam.x + cw) / TILE));
    const y0 = Math.max(0, Math.floor(cam.y / TILE)), y1 = Math.min(H - 1, Math.ceil((cam.y + ch) / TILE));

    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const id = s.tiles[idx(x, y)];
        const px = x * TILE - cam.x, py = y * TILE - cam.y;
        if (id !== 'air') drawBlock(id, px, py, x, y, s);
        const k = key(x, y);
        if (s.plants[k]) drawPlant(s.plants[k], px, py, now);
        const d = s.damage[k];
        if (d && id !== 'air' && BLOCKS[id].hardness !== Infinity) {
          ctx.strokeStyle = '#000a'; ctx.lineWidth = 2; ctx.beginPath();
          const n = Math.ceil((d.hits / BLOCKS[id].hardness) * 5);
          for (let i = 0; i < n; i++) { const o = 4 + i * 5; ctx.moveTo(px + o, py + 3); ctx.lineTo(px + o + 6, py + TILE - 4); }
          ctx.stroke(); ctx.lineWidth = 1;
        }
      }
    }

    if (hover) {
      ctx.strokeStyle = hover.inReach ? '#ffffffcc' : '#ff6b6b99'; ctx.lineWidth = 2;
      ctx.strokeRect(hover.x * TILE - cam.x + 1, hover.y * TILE - cam.y + 1, TILE - 2, TILE - 2); ctx.lineWidth = 1;
    }

    const px = p.x * TILE - cam.x, py = p.y * TILE - cam.y;
    const w = PLAYER.w * TILE, h = PLAYER.h * TILE;
    ctx.fillStyle = '#5b6cff'; ctx.fillRect(px, py + h * 0.35, w, h * 0.65);
    ctx.fillStyle = '#ffd7a8'; ctx.fillRect(px - 1, py, w + 2, h * 0.38);
    ctx.fillStyle = '#222'; ctx.fillRect(px + (p.facing > 0 ? w * 0.55 : w * 0.15), py + h * 0.14, 4, 4);
  }

  return { render, screenToTile, resize };
}
