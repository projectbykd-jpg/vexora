import { W, H, idx, key, generate } from './world.js';
import { BLOCKS } from './items.js';
import { PLAYER } from './physics.js';
import { isMature } from './game.js';
import { TILE, createArt } from './art.js';
import { createFx } from './fx.js';
import { mulberry32 } from './rng.js';

export { TILE };

const OUTLINE = '#1b1740';
const hash = (x, y) => { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mixCol = (a, b, t) => { const A = hex(a), B = hex(b); return `rgb(${A.map((v, i) => Math.round(lerp(v, B[i], t))).join(',')})`; };

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const art = createArt(dpr);
  const fx = createFx();
  let cw = 0, ch = 0, vignette = null;
  const cam = { x: 0, y: 0, init: false };
  const anim = { phase: 0, punch: 0, punchLeft: 0, blink: 0, nextBlink: 2, wasAir: false, bob: 0 };

  // sky decorations (seeded, so stable)
  const rs = mulberry32(2024);
  const stars = Array.from({ length: 70 }, () => ({ x: rs(), y: rs() * 0.6, s: 0.6 + rs() * 1.4, p: rs() * 6 }));
  const clouds = Array.from({ length: 7 }, () => ({ x: rs() * 2600, y: 40 + rs() * 220, s: 0.7 + rs() * 0.9, v: 4 + rs() * 7 }));

  let groundSeed = null, ground = null;
  function ensureGround(seed) {
    if (groundSeed === seed) return;
    const t = generate(seed).tiles; ground = new Int16Array(W);
    for (let x = 0; x < W; x++) { let y = 0; while (y < H && !BLOCKS[t[idx(x, y)]]?.solid && t[idx(x, y)] !== 'dirt') y++; ground[x] = y; }
    groundSeed = seed;
  }

  function resize() {
    cw = window.innerWidth; ch = window.innerHeight;
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
    const v = document.createElement('canvas'); v.width = cw; v.height = ch;
    const g = v.getContext('2d'), r = g.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.35, cw / 2, ch / 2, Math.hypot(cw, ch) * 0.62);
    r.addColorStop(0, 'rgba(0,0,0,0)'); r.addColorStop(1, 'rgba(8,10,25,.42)'); g.fillStyle = r; g.fillRect(0, 0, cw, ch);
    vignette = v;
  }
  resize();
  window.addEventListener('resize', resize);

  const screenToTile = (sx, sy) => ({ x: Math.floor((sx + cam.x) / TILE), y: Math.floor((sy + cam.y) / TILE) });

  // ---------------- sky ----------------
  function drawSky(tod, now) {
    const sun = Math.sin(tod * Math.PI * 2);
    const day = smooth(-0.12, 0.28, sun);
    const dusk = Math.max(0, 1 - Math.abs(sun) / 0.3);
    let top = mixCol('#0a0f2e', '#4aa8ff', day), bot = mixCol('#27346b', '#d9f1ff', day);
    top = mixCol(top.startsWith('#') ? top : rgbToHex(top), '#b45fa0', dusk * 0.35);
    bot = mixCol(rgbToHex(bot), '#ffb070', dusk * 0.7);
    const g = ctx.createLinearGradient(0, 0, 0, ch);
    g.addColorStop(0, top); g.addColorStop(1, bot);
    ctx.fillStyle = g; ctx.fillRect(0, 0, cw, ch);

    // stars
    const sa = clamp(1 - day * 1.4, 0, 1);
    if (sa > 0) for (const s of stars) {
      ctx.globalAlpha = sa * (0.5 + 0.5 * Math.sin(now / 500 + s.p));
      ctx.fillStyle = '#fff'; ctx.fillRect(s.x * cw, s.y * ch, s.s, s.s);
    }
    ctx.globalAlpha = 1;

    // sun / moon
    const isDay = tod < 0.5, u = isDay ? tod * 2 : (tod - 0.5) * 2;
    const bx = cw * (0.08 + 0.84 * u), by = ch * 0.62 - Math.sin(Math.PI * u) * ch * 0.5;
    const rg = ctx.createRadialGradient(bx, by, 4, bx, by, isDay ? 110 : 80);
    rg.addColorStop(0, isDay ? 'rgba(255,240,170,.75)' : 'rgba(200,215,255,.45)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = rg; ctx.fillRect(bx - 120, by - 120, 240, 240);
    ctx.fillStyle = isDay ? '#fff3b0' : '#e9eeff'; ctx.beginPath(); ctx.arc(bx, by, isDay ? 26 : 20, 0, 7); ctx.fill();
    if (!isDay) { ctx.fillStyle = 'rgba(120,130,170,.35)'; ctx.beginPath(); ctx.arc(bx - 6, by - 4, 4, 0, 7); ctx.arc(bx + 7, by + 6, 3, 0, 7); ctx.fill(); }

    // clouds
    const cloudCol = `rgba(255,255,255,${0.35 + 0.55 * day})`;
    for (const c of clouds) {
      const x = ((c.x + now * 0.001 * c.v - cam.x * 0.18) % 2600 + 2600) % 2600 - 300;
      const y = c.y - cam.y * 0.12;
      ctx.fillStyle = cloudCol;
      ctx.beginPath();
      ctx.arc(x, y, 26 * c.s, 0, 7); ctx.arc(x + 28 * c.s, y - 12 * c.s, 32 * c.s, 0, 7);
      ctx.arc(x + 62 * c.s, y - 2 * c.s, 26 * c.s, 0, 7); ctx.arc(x + 32 * c.s, y + 8 * c.s, 28 * c.s, 0, 7);
      ctx.fill();
    }
    return { day, dusk };
  }
  function rgbToHex(c) { if (c.startsWith('#')) return c; const m = c.match(/\d+/g).map(Number); return '#' + m.map((v) => v.toString(16).padStart(2, '0')).join(''); }

  function drawHills(day) {
    const base = 20 * TILE - cam.y;                      // world surface line
    const layers = [
      { f: 0.15, par: 0.12, amp: 70, off: 150, c0: '#6f8fc4', c1: '#3b4f86', h: 0.012 },
      { f: 0.30, par: 0.28, amp: 48, off: 70, c0: '#58b36b', c1: '#2f6d48', h: 0.02 },
    ];
    for (const L of layers) {
      const col = mixCol(rgbToHex(mixCol(L.c1, L.c0, 1)), '#0e1330', 0), night = mixCol(rgbToHex(mixCol('#0e1330', L.c1, 0.35)), '#0e1330', 0);
      ctx.fillStyle = mixCol(rgbToHex(night), rgbToHex(col), day);
      ctx.beginPath(); ctx.moveTo(0, ch);
      for (let x = 0; x <= cw + 8; x += 8) {
        const wx = x + cam.x * L.par;
        const y = base - L.off + Math.sin(wx * L.h) * L.amp * 0.5 + Math.sin(wx * L.h * 2.3 + 1.7) * L.amp * 0.3;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(cw, ch); ctx.closePath(); ctx.fill();
    }
  }

  // ---------------- tiles ----------------
  function drawTile(id, s, x, y, px, py) {
    const v = (hash(x, y) * 4) | 0;
    if (id === 'gate') return;                            // drawn separately
    ctx.drawImage(art.tiles[id][v], px, py, TILE + 0.6, TILE + 0.6);
    if (id === 'dirt' && y > 0 && s.tiles[idx(x, y - 1)] === 'air') ctx.drawImage(art.grass[v], px, py - 3, TILE + 0.6, 18);
  }

  function drawGate(px, py, now) {
    const cx = px + TILE / 2, pulse = 0.6 + 0.4 * Math.sin(now / 350);
    const gl = ctx.createRadialGradient(cx, py + TILE * 0.55, 3, cx, py + TILE * 0.55, TILE * 0.9);
    gl.addColorStop(0, `rgba(160,220,255,${0.75 * pulse})`); gl.addColorStop(1, 'rgba(160,220,255,0)');
    ctx.fillStyle = gl; ctx.fillRect(px - 20, py - 14, TILE + 40, TILE + 30);
    ctx.fillStyle = '#9aa0b4';                                                            // pillars + arch
    ctx.fillRect(px + 3, py + 8, 7, TILE - 8); ctx.fillRect(px + TILE - 10, py + 8, 7, TILE - 8);
    ctx.beginPath(); ctx.arc(cx, py + 14, 21, Math.PI, 0); ctx.arc(cx, py + 14, 13, 0, Math.PI, true); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.28)'; ctx.fillRect(px + 3, py + 8, 2, TILE - 8);
    ctx.fillStyle = `rgba(190,235,255,${0.35 + 0.3 * pulse})`; ctx.beginPath(); ctx.moveTo(px + 10, py + TILE); ctx.lineTo(px + 10, py + 14); ctx.arc(cx, py + 14, 13, Math.PI, 0); ctx.lineTo(px + TILE - 10, py + TILE); ctx.fill();
    ctx.fillStyle = '#ffd36b'; ctx.beginPath(); ctx.arc(cx, py + 2, 3.5, 0, 7); ctx.fill();
  }

  function drawPlant(p, px, py, now, x) {
    const B = BLOCKS[p.block];
    const t = clamp((now - p.plantedAt) / (B.growSec * 1000), 0, 1), mature = t >= 1;
    const sway = Math.sin(now / 700 + x * 1.3) * 0.035;
    ctx.save(); ctx.translate(px + TILE / 2, py + TILE);
    ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.beginPath(); ctx.ellipse(0, -1, 9 + t * 8, 3.2, 0, 0, 7); ctx.fill();
    ctx.rotate(sway);
    if (t < 0.2) {                                                    // sprout
      ctx.strokeStyle = '#3d9a4a'; ctx.lineWidth = 3; ctx.lineCap = 'round';
      const h = 8 + t * 40; ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(2, -h * 0.5, 0, -h); ctx.stroke();
      ctx.fillStyle = '#6fd67b'; ctx.strokeStyle = '#1e5a2c'; ctx.lineWidth = 1.2;
      for (const sx of [-1, 1]) { ctx.beginPath(); ctx.ellipse(sx * 6, -h, 7, 3.4, sx * -0.5, 0, 7); ctx.fill(); ctx.stroke(); }
    } else {
      const trunkH = 14 + t * 44, tw = 5 + t * 6;
      const tg = ctx.createLinearGradient(-tw, 0, tw, 0); tg.addColorStop(0, '#93602f'); tg.addColorStop(1, '#6a4220');
      ctx.fillStyle = tg; ctx.strokeStyle = '#2e1b0c'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-tw / 2 - 2, 0); ctx.quadraticCurveTo(-tw / 2, -trunkH * 0.4, -tw * 0.32, -trunkH); ctx.lineTo(tw * 0.32, -trunkH);
      ctx.quadraticCurveTo(tw / 2, -trunkH * 0.4, tw / 2 + 2, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-1, -4); ctx.lineTo(-1, -trunkH * 0.7); ctx.stroke();
      const cr = 9 + t * 15, leaf = mixCol('#46ad58', B.color, 0.3), light = mixCol('#86e591', B.color, 0.18);
      const blobs = [[0, -trunkH - cr * 0.3, cr], [-cr * 0.85, -trunkH + cr * 0.1, cr * 0.72], [cr * 0.85, -trunkH + cr * 0.1, cr * 0.72], [0, -trunkH - cr * 0.95, cr * 0.7]];
      ctx.fillStyle = leaf; ctx.strokeStyle = '#1b4d28'; ctx.lineWidth = 2;
      for (const [bx, by, r] of blobs) { ctx.beginPath(); ctx.arc(bx, by, r, 0, 7); ctx.fill(); ctx.stroke(); }
      for (const [bx, by, r] of blobs) { ctx.beginPath(); ctx.arc(bx, by, r - 1, 0, 7); ctx.fill(); }
      ctx.fillStyle = light; ctx.beginPath(); ctx.arc(-cr * 0.3, -trunkH - cr * 0.6, cr * 0.38, 0, 7); ctx.arc(cr * 0.5, -trunkH - cr * 0.15, cr * 0.22, 0, 7); ctx.fill();
      if (mature) {
        const pulse = 0.5 + 0.5 * Math.sin(now / 280);
        const fr = ctx.createRadialGradient(0, -trunkH - 6, 4, 0, -trunkH - 6, 44);
        fr.addColorStop(0, `rgba(255,236,150,${0.5 * pulse + 0.18})`); fr.addColorStop(1, 'rgba(255,236,150,0)');
        ctx.fillStyle = fr; ctx.fillRect(-48, -trunkH - 54, 96, 96);
        for (const [fx2, fy2] of [[-cr * 0.75, -trunkH + 2], [cr * 0.7, -trunkH + 4], [0, -trunkH - cr * 0.8], [-cr * 0.2, -trunkH - 2]]) {
          ctx.fillStyle = B.color; ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.lineWidth = 1.6;
          ctx.beginPath(); ctx.arc(fx2, fy2, 5.6, 0, 7); ctx.fill(); ctx.stroke();
          ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.beginPath(); ctx.arc(fx2 - 1.8, fy2 - 1.8, 1.8, 0, 7); ctx.fill();
        }
      }
    }
    ctx.restore();
  }

  function drawDrops(s, now) {
    for (const d of s.drops) {
      const px = d.x * TILE - cam.x, py = d.y * TILE - cam.y;
      if (px < -30 || px > cw + 30 || py < -30 || py > ch + 30) continue;
      const bob = Math.sin(now / 260 + d.x * 3) * 2.4;
      ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.beginPath(); ctx.ellipse(px, py + 9, 8, 2.8, 0, 0, 7); ctx.fill();
      if (d.kind === 'gem') {
        const y = py - 1 + bob, tw = 0.6 + 0.4 * Math.sin(now / 160 + d.x * 5);
        ctx.fillStyle = '#5de0ff'; ctx.strokeStyle = '#0d5c78'; ctx.lineWidth = 1.8;
        ctx.beginPath(); ctx.moveTo(px, y - 10); ctx.lineTo(px + 8, y - 2); ctx.lineTo(px, y + 9); ctx.lineTo(px - 8, y - 2); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.beginPath(); ctx.moveTo(px - 2, y - 8); ctx.lineTo(px + 4, y - 3); ctx.lineTo(px - 2, y - 1); ctx.closePath(); ctx.fill();
        ctx.fillStyle = `rgba(255,255,255,${tw})`; ctx.fillRect(px + 6, y - 12, 2, 2);
      } else {
        const im = art.iconImg(d.item);
        if (im.complete && im.naturalWidth) ctx.drawImage(im, px - 14, py - 21 + bob, 28, 28);
      }
      if (d.n > 1) {
        ctx.font = '800 12px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.7)';
        ctx.strokeText(d.n, px + 11, py + 8 + bob); ctx.fillStyle = '#fff'; ctx.fillText(d.n, px + 11, py + 8 + bob);
      }
    }
  }

  // ---------------- character ----------------
  function drawPlayer(px, feetY, a, p, now) {
    ctx.save(); ctx.translate(px, feetY); ctx.scale(p.facing || 1, 1);
    const run = a.run, ph = a.phase, air = !p.onGround;
    const bob = air ? 0 : -Math.abs(Math.sin(ph)) * 2.2 * run + Math.sin(now / 500) * 0.8 * (1 - run);
    const limb = (x0, y0, ang, len, w, col) => {
      const x1 = x0 + Math.sin(ang) * len, y1 = y0 + Math.cos(ang) * len;
      ctx.lineCap = 'round'; ctx.strokeStyle = OUTLINE; ctx.lineWidth = w + 3.4; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      return [x1, y1];
    };
    // ground shadow
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(0, 0, 15, 4.5, 0, 0, 7); ctx.fill();

    // legs
    const swing = air ? 0.5 : Math.sin(ph) * 0.75 * run;
    const [bx2, by2] = limb(-4, -27 + bob, -swing * 0.9 - (air ? 0.2 : 0), 25, 9, '#27305a');
    ctx.fillStyle = '#e9ecf7'; ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(bx2 + 2, by2 + 1, 7, 4.2, 0, 0, 7); ctx.fill(); ctx.stroke();
    // back arm
    limb(-8, -50 + bob, -Math.sin(ph) * 0.8 * run + (air ? -0.8 : 0.1), 19, 7, '#3f49b8');
    // scarf tail (flows behind)
    const wave = Math.sin(now / 120) * 2;
    ctx.strokeStyle = '#ff5f7a'; ctx.lineWidth = 6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-6, -52 + bob); ctx.bezierCurveTo(-16 - run * 6, -50 + wave + bob, -22 - run * 12, -46 - wave + bob + (air ? -6 : 0), -28 - run * 16, -48 + wave * 1.5 + bob); ctx.stroke();
    // torso
    const tg = ctx.createLinearGradient(0, -54, 0, -24); tg.addColorStop(0, '#7f8bff'); tg.addColorStop(1, '#4a55d8');
    ctx.fillStyle = tg; ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.roundRect(-12, -54 + bob, 24, 31, 9); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#272c63'; ctx.fillRect(-12, -33 + bob, 24, 4);
    ctx.fillStyle = '#ffd36b'; ctx.beginPath(); ctx.arc(0, -31 + bob, 2.2, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.beginPath(); ctx.roundRect(-9, -51 + bob, 6, 17, 3); ctx.fill();
    // front leg
    const [fx3, fy3] = limb(4, -27 + bob, swing * 0.9 + (air ? -0.3 : 0), 25, 9, '#323d72');
    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(fx3 + 2, fy3 + 1, 7.5, 4.4, 0, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ff5f7a'; ctx.fillRect(fx3 - 3, fy3 - 1.5, 10, 2);
    // scarf wrap
    ctx.strokeStyle = '#ff5f7a'; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(-9, -53 + bob); ctx.quadraticCurveTo(0, -48 + bob, 9, -53 + bob); ctx.stroke();
    // front arm (punches)
    const pt = Math.sin(a.punch * Math.PI), rest = Math.sin(ph + Math.PI) * 0.8 * run + (air ? -0.9 : 0.12);
    const ang = lerp(rest, 1.5, pt), len = 19 + pt * 7;
    const [hx, hy] = limb(9, -50 + bob, ang, len, 7.5, '#4a55d8');
    const hg = ctx.createRadialGradient(hx - 1, hy - 1, 1, hx, hy, 6); hg.addColorStop(0, '#ffe5c2'); hg.addColorStop(1, '#f0b183');
    ctx.fillStyle = hg; ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(hx, hy, 5.2 + pt * 1.2, 0, 7); ctx.fill(); ctx.stroke();
    if (pt > 0.5) { ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(hx + 4, hy, 9, -0.9, 0.9); ctx.stroke(); }
    // head
    const hy0 = -65 + bob + (air ? -1 : 0);
    const sk = ctx.createRadialGradient(-3, hy0 - 5, 2, 0, hy0, 18); sk.addColorStop(0, '#ffe9cf'); sk.addColorStop(1, '#f2b88a');
    ctx.fillStyle = sk; ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.arc(1, hy0, 16, 0, 7); ctx.fill(); ctx.stroke();
    // hair
    const hair = ctx.createLinearGradient(0, hy0 - 20, 0, hy0); hair.addColorStop(0, '#6a45c9'); hair.addColorStop(1, '#3f2a85');
    ctx.fillStyle = hair; ctx.beginPath();
    ctx.arc(1, hy0, 17, Math.PI * 1.02, Math.PI * 2.02);
    ctx.quadraticCurveTo(13, hy0 - 2, 6, hy0 - 8); ctx.quadraticCurveTo(0, hy0 - 3, -6, hy0 - 9); ctx.quadraticCurveTo(-13, hy0 - 4, -16, hy0 + 1); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-4, hy0 - 15); ctx.quadraticCurveTo(-8, hy0 - 26, 3, hy0 - 23 + Math.sin(now / 300) * 1.2); ctx.quadraticCurveTo(0, hy0 - 19, 6, hy0 - 15); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.22)'; ctx.beginPath(); ctx.ellipse(-3, hy0 - 12, 6, 2.2, -0.3, 0, 7); ctx.fill();
    // eyes
    const bl = a.blink > 0 ? 0.15 : 1, look = clamp(p.vx / 6, -1, 1) * 0.9;
    for (const ex of [-1, 8]) {
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(ex, hy0 + 1, 3.6, 4.6 * bl, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#2a2350'; ctx.beginPath(); ctx.ellipse(ex + 0.9 + look, hy0 + 1.5, 2.3, 3 * bl, 0, 0, 7); ctx.fill();
      if (bl > 0.5) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ex + 0.2 + look, hy0 - 0.2, 0.9, 0, 7); ctx.fill(); }
    }
    ctx.fillStyle = 'rgba(255,110,130,.38)'; ctx.beginPath(); ctx.ellipse(11, hy0 + 8, 3.6, 2.2, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = '#8a3b3b'; ctx.lineWidth = 1.5; ctx.lineCap = 'round'; ctx.beginPath();
    if (pt > 0.3) ctx.ellipse(6, hy0 + 9, 2.4, 2, 0, 0, 7); else ctx.arc(5.5, hy0 + 7, 3, 0.25, Math.PI - 0.5);
    ctx.stroke();
    ctx.restore();
  }

  // ---------------- main render ----------------
  function render(s, now, hover, dt = 1 / 60, tod = 0.25) {
    ensureGround(s.seed);
    const p = s.player;

    // animation state
    const speed = Math.abs(p.vx) / 6;
    anim.run = lerp(anim.run || 0, p.onGround ? speed : 0, clamp(dt * 12, 0, 1));
    anim.phase += dt * (6 + 8 * speed) * (speed > 0.05 ? 1 : 0);
    if (anim.punchLeft > 0) { anim.punchLeft -= dt; anim.punch = 1 - Math.max(0, anim.punchLeft) / 0.22; } else anim.punch = 0;
    anim.nextBlink -= dt; if (anim.nextBlink < 0) { anim.blink = 0.12; anim.nextBlink = 2 + Math.random() * 3; } anim.blink = Math.max(0, anim.blink - dt);
    if (anim.wasAir && p.onGround) fx.dust(p.x + PLAYER.w / 2, p.y + PLAYER.h);
    anim.wasAir = !p.onGround;
    fx.update(dt);

    // smooth camera
    const tx = Math.max(0, Math.min(W * TILE - cw, (p.x + PLAYER.w / 2) * TILE - cw / 2));
    const ty = Math.max(0, Math.min(H * TILE - ch, (p.y + PLAYER.h / 2) * TILE - ch * 0.55));
    if (!cam.init) { cam.x = tx; cam.y = ty; cam.init = true; }
    const k = clamp(dt * 9, 0, 1); cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * k;
    if (W * TILE < cw) cam.x = -(cw - W * TILE) / 2;
    if (H * TILE < ch) cam.y = -(ch - H * TILE) / 2;
    cam.x = Math.round(cam.x); cam.y = Math.round(cam.y);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const { day } = drawSky(tod, now);
    drawHills(day);

    const x0 = Math.max(0, Math.floor(cam.x / TILE)), x1 = Math.min(W - 1, Math.ceil((cam.x + cw) / TILE));
    const y0 = Math.max(0, Math.floor(cam.y / TILE)), y1 = Math.min(H - 1, Math.ceil((cam.y + ch) / TILE));
    let gate = null;

    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const id = s.tiles[idx(x, y)], px = x * TILE - cam.x, py = y * TILE - cam.y;
        if (id === 'air' || id === 'gate') {
          if (y >= ground[x]) {                                         // cave back wall
            ctx.drawImage(art.tiles.back[(hash(x, y) * 4) | 0], px, py, TILE + 0.6, TILE + 0.6);
            ctx.fillStyle = `rgba(0,0,0,${clamp((y - ground[x]) * 0.035, 0, 0.45)})`; ctx.fillRect(px, py, TILE + 0.6, TILE + 0.6);
          }
          if (id === 'gate') gate = { px, py };
        } else drawTile(id, s, x, y, px, py);
      }
    }
    // soft contact shadows on the back wall under solid tiles, and rim light on exposed edges
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const id = s.tiles[idx(x, y)];
      if (id === 'air' || id === 'gate') continue;
      const px = x * TILE - cam.x, py = y * TILE - cam.y;
      if (y + 1 < H && s.tiles[idx(x, y + 1)] === 'air') { const g = ctx.createLinearGradient(0, py + TILE, 0, py + TILE + 10); g.addColorStop(0, 'rgba(0,0,0,.28)'); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(px, py + TILE, TILE, 10); }
      const dmg = s.damage[key(x, y)];
      if (dmg && BLOCKS[id].hardness !== Infinity) { const st = clamp(Math.ceil((dmg.hits / BLOCKS[id].hardness) * 3), 1, 3) - 1; ctx.drawImage(art.cracks[st], px, py, TILE, TILE); }
    }
    if (gate) drawGate(gate.px, gate.py, now);
    for (const k2 in s.plants) {
      const [x, y] = k2.split(',').map(Number);
      if (x >= x0 - 1 && x <= x1 + 1 && y >= y0 - 1 && y <= y1 + 1) drawPlant(s.plants[k2], x * TILE - cam.x, y * TILE - cam.y, now, x);
    }

    drawDrops(s, now);
    drawPlayer((p.x + PLAYER.w / 2) * TILE - cam.x, (p.y + PLAYER.h) * TILE - cam.y, anim, p, now);
    fx.draw(ctx, cam.x, cam.y);

    if (hover) {
      const px = hover.x * TILE - cam.x, py = hover.y * TILE - cam.y, pulse = 0.6 + 0.4 * Math.sin(now / 220);
      ctx.fillStyle = hover.inReach ? 'rgba(255,255,255,.10)' : 'rgba(255,90,90,.10)';
      ctx.strokeStyle = hover.inReach ? `rgba(255,255,255,${0.55 + 0.35 * pulse})` : 'rgba(255,107,107,.65)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.roundRect(px + 1.5, py + 1.5, TILE - 3, TILE - 3, 8); ctx.fill(); ctx.stroke();
    }

    // lighting: night tint, warm glow around the player, vignette
    const night = (1 - day) * 0.5;
    if (night > 0.01) {
      ctx.fillStyle = `rgba(8,12,48,${night})`; ctx.fillRect(0, 0, cw, ch);
      const lx = (p.x + PLAYER.w / 2) * TILE - cam.x, ly = (p.y + PLAYER.h / 2) * TILE - cam.y;
      const lg = ctx.createRadialGradient(lx, ly, 8, lx, ly, 190); lg.addColorStop(0, `rgba(255,214,140,${0.38 * night * 2})`); lg.addColorStop(1, 'rgba(255,214,140,0)');
      ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = lg; ctx.fillRect(lx - 200, ly - 200, 400, 400); ctx.globalCompositeOperation = 'source-over';
    }
    ctx.drawImage(vignette, 0, 0, cw, ch);
  }

  function punchAnim() { anim.punchLeft = 0.22; }

  return { render, screenToTile, resize, fx, punchAnim, art };
}
