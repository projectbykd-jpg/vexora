// Particles and floating pickup text. Pure visuals; never touches game state.
import { TILE } from './art.js';

export function createFx() {
  const parts = [], texts = [];

  function burst(tx, ty, color, n = 10, o = {}) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = (o.speed || 3) * (0.4 + Math.random());
      parts.push({
        x: (tx + 0.5 + (Math.random() - 0.5) * 0.6) * TILE, y: (ty + 0.5 + (Math.random() - 0.5) * 0.6) * TILE,
        vx: Math.cos(a) * sp * TILE * 0.5, vy: (Math.sin(a) * sp - (o.up || 2)) * TILE * 0.5,
        life: 0, max: (o.life || 0.7) * (0.6 + Math.random() * 0.6), size: (o.size || 5) * (0.5 + Math.random()),
        color, grav: o.grav ?? 1, glow: !!o.glow,
      });
    }
  }
  const dust = (px, py) => { for (let i = 0; i < 5; i++) parts.push({ x: px * TILE + (Math.random() - 0.5) * 18, y: py * TILE, vx: (Math.random() - 0.5) * 60, vy: -Math.random() * 25, life: 0, max: 0.4, size: 4 + Math.random() * 3, color: 'rgba(235,225,205,.7)', grav: 0, glow: false }); };
  const text = (tx, ty, str, kind = 'gem') => texts.push({ x: (tx + 0.5) * TILE, y: ty * TILE, str, kind, life: 0, max: 1.1 });

  function update(dt) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]; p.life += dt;
      if (p.life >= p.max) { parts.splice(i, 1); continue; }
      p.vy += 520 * p.grav * dt; p.x += p.vx * dt; p.y += p.vy * dt;
    }
    for (let i = texts.length - 1; i >= 0; i--) { const t = texts[i]; t.life += dt; t.y -= 34 * dt; if (t.life >= t.max) texts.splice(i, 1); }
  }

  function draw(g, camX, camY) {
    for (const p of parts) {
      const a = 1 - p.life / p.max;
      g.globalAlpha = Math.max(0, a);
      if (p.glow) { g.globalCompositeOperation = 'lighter'; }
      g.fillStyle = p.color;
      g.beginPath(); g.arc(p.x - camX, p.y - camY, p.size * (0.5 + a * 0.5), 0, 7); g.fill();
      g.globalCompositeOperation = 'source-over';
    }
    g.globalAlpha = 1;
    g.font = '700 16px system-ui, sans-serif'; g.textBaseline = 'middle'; g.textAlign = 'left';
    for (const t of texts) {
      const a = Math.min(1, (1 - t.life / t.max) * 2);
      const x = t.x - camX, y = t.y - camY;
      g.globalAlpha = a;
      const w = g.measureText(t.str).width;
      const ox = x - (w + 18) / 2;
      if (t.kind === 'gem') {
        g.fillStyle = '#5de0ff'; g.strokeStyle = '#ffffff'; g.lineWidth = 1.5;
        g.beginPath(); g.moveTo(ox + 7, y - 7); g.lineTo(ox + 14, y); g.lineTo(ox + 7, y + 7); g.lineTo(ox, y); g.closePath(); g.fill(); g.stroke();
      }
      g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,.55)'; g.strokeText(t.str, ox + 18, y);
      g.fillStyle = t.kind === 'gem' ? '#b9f3ff' : '#fff'; g.fillText(t.str, ox + 18, y);
    }
    g.globalAlpha = 1;
  }
  return { burst, dust, text, update, draw };
}
