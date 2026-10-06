import { createGame, punch, place, plant, sell, buy, inReach } from './game.js';
import { stepPlayer } from './physics.js';
import { createRenderer, TILE } from './render.js';
import { createAudio } from './audio.js';
import { ITEM_ORDER, itemInfo } from './items.js';
import { localAdapter, serialize, deserialize } from './save.js';

const store = localAdapter;
let state = deserialize(store.load()) || createGame();
const canvas = document.getElementById('game');
const renderer = createRenderer(canvas);
const audio = createAudio();
const art = renderer.art;
const $ = (id) => document.getElementById(id);

// ---------- input ----------
const keys = new Set();
const mouse = { x: 0, y: 0, down: false, onCanvas: false };
const GAME_KEYS = new Set(['a', 'd', 'w', ' ', 'arrowleft', 'arrowright', 'arrowup']);
addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (GAME_KEYS.has(k)) { keys.add(k); e.preventDefault(); }
  audio.unlock();
  if (k === 'b') toggleShop();
  if (k === 'm') toggleMute();
  if (/^[1-9]$/.test(k)) selectSlot(+k - 1);
});
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
addEventListener('blur', () => { keys.clear(); mouse.down = false; });
canvas.addEventListener('pointerdown', (e) => { audio.unlock(); mouse.down = true; mouse.x = e.clientX; mouse.y = e.clientY; mouse.onCanvas = true; });
canvas.addEventListener('pointermove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; mouse.onCanvas = true; });
addEventListener('pointerup', () => { mouse.down = false; });
canvas.addEventListener('pointerleave', () => { mouse.onCanvas = false; });

const touchKeys = { left: 'arrowleft', right: 'arrowright', jump: 'arrowup' };
if (matchMedia('(pointer: coarse)').matches) $('touch').hidden = false;
for (const b of document.querySelectorAll('#touch button')) {
  const k = touchKeys[b.dataset.k];
  b.addEventListener('pointerdown', (e) => { e.preventDefault(); keys.add(k); });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(ev, () => keys.delete(k));
}

const getInput = () => ({
  left: keys.has('a') || keys.has('arrowleft'),
  right: keys.has('d') || keys.has('arrowright'),
  jump: keys.has('w') || keys.has(' ') || keys.has('arrowup'),
});

// ---------- UI ----------
let toastTimer = 0;
function toast(msg) {
  const t = $('toast'); t.innerHTML = ''; const sp = document.createElement('span'); sp.textContent = msg; t.append(sp); t.classList.add('on');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), 1800);
}

const hotbarItems = () => ['fist', ...ITEM_ORDER.filter((id) => state.inv[id] > 0)];
function selectSlot(i) { const it = hotbarItems()[i]; if (it) { state.selected = it; renderHotbar(); } }

function renderHotbar() {
  const items = hotbarItems();
  if (!items.includes(state.selected)) state.selected = 'fist';
  $('hotbar').replaceChildren(...items.map((id, i) => {
    const el = document.createElement('div');
    el.className = 'slot' + (id === state.selected ? ' sel' : '');
    const info = id === 'fist' ? { name: 'Tinju' } : itemInfo(id);
    el.title = info.name;
    el.innerHTML = `<em>${i + 1}</em><img alt="" src="${art.icon(id)}">` + (id === 'fist' ? '' : `<b>${state.inv[id]}</b>`);
    el.addEventListener('click', () => { state.selected = id; renderHotbar(); });
    return el;
  }));
}

function renderShop() {
  const list = $('shopList');
  list.replaceChildren(...ITEM_ORDER.map((id) => {
    const info = itemInfo(id), have = state.inv[id] || 0;
    const row = document.createElement('div'); row.className = 'row';
    row.innerHTML = `<img alt="" src="${art.icon(id)}"><span>${info.name}<br><small>punya ${have}</small></span>`;
    const mk = (label, fn) => { const b = document.createElement('button'); b.className = 'btn small'; b.textContent = label; b.addEventListener('click', () => { const r = fn(); if (!r.ok) toast(r.msg); refreshUi(); }); row.append(b); };
    mk(`Beli ${info.buy}`, () => buy(state, id, 1));
    mk(`Jual ${info.sell}`, () => sell(state, id, 1));
    mk('Semua', () => sell(state, id, have));
    return row;
  }));
}

function toggleShop() { const s = $('shop'); s.hidden = !s.hidden; if (!s.hidden) renderShop(); }
$('shopBtn').addEventListener('click', toggleShop);
$('shopClose').addEventListener('click', toggleShop);
function toggleMute() { const m = audio.toggle(); $('muteBtn').textContent = m ? '🔇' : '🔊'; if (!m) audio.play('coin'); }
$('muteBtn').addEventListener('click', () => { audio.unlock(); toggleMute(); });
$('muteBtn').textContent = audio.muted ? '🔇' : '🔊';
setTimeout(() => $('help').classList.add('fade'), 9000);
$('resetBtn').addEventListener('click', () => {
  if (!confirm('Hapus semua progres dan mulai dari awal?')) return;
  store.clear(); state = createGame(); refreshUi(); toast('Progres dihapus.');
});

function refreshUi() { $('gemCount').textContent = state.gems; renderHotbar(); if (!$('shop').hidden) renderShop(); }

// ---------- actions ----------
function act(tx, ty, now) {
  const sel = state.selected, fx = renderer.fx;
  const before = state.gems;
  let r;
  if (sel === 'fist') r = punch(state, tx, ty, now);
  else if (sel.startsWith('seed_')) r = plant(state, tx, ty, sel, now);
  else r = place(state, tx, ty, sel);

  if (r.ok || (r.msg && r.msg !== 'Terlalu cepat.' && r.msg !== 'Kosong.')) {
    // face the target, swing the fist
    state.player.facing = tx + 0.5 >= state.player.x + 0.35 ? 1 : -1;
    if (sel === 'fist' && (r.ok || r.msg === 'Belum matang.')) renderer.punchAnim();
  }
  if (!r.ok) {
    if (r.msg && r.msg !== 'Terlalu cepat.' && r.msg !== 'Kosong.') { toast(r.msg); audio.play('error'); }
    return r;
  }
    if (sel === 'fist') {
    if (r.harvested) {
      fx.burst(tx, ty, '#ffe27a', 22, { speed: 4, up: 3, size: 5, glow: true, life: 0.9 });
      fx.text(tx, ty - 0.2, '+' + r.gems, 'gem');
      toast(r.msg); audio.play('harvest');
    } else if (r.broke) {
      fx.burst(tx, ty, r.color || '#c9a27a', 14, { speed: 3.2, up: 2.2, size: 5 });
      if (r.drops.gems) fx.text(tx, ty - 0.2, '+' + r.drops.gems, 'gem');
      if (r.drops.seed) fx.text(tx, ty - 0.9, '+bibit', 'seed');
      audio.play('break'); if (r.drops.gems) audio.play('coin');
    } else {
      fx.burst(tx, ty, '#e8dcc8', 3, { speed: 1.5, up: 1, size: 3, life: 0.35 });
      audio.play('punch');
    }
  } else if (sel.startsWith('seed_')) { fx.burst(tx, ty, '#6fd67b', 8, { speed: 1.8, up: 1.5, size: 3.5, life: 0.5 }); audio.play('plant'); }
  else { fx.burst(tx, ty, '#ffffff', 5, { speed: 1.4, up: 0.8, size: 3, life: 0.3 }); audio.play('place'); }
  if (r.broke || r.harvested || sel !== 'fist') refreshUi();
  return r;
}

// ---------- loop ----------
const CYCLE_MS = 6 * 60 * 1000;                       // one full day = 6 minutes
const dbgTime = new URLSearchParams(location.search).get('time');
const tod = () => (dbgTime !== null ? +dbgTime : ((Date.now() % CYCLE_MS) / CYCLE_MS + 0.1) % 1);
let last = performance.now(), lastGems = -1, lastSave = performance.now();
function frame(t) {
  const dt = (t - last) / 1000; last = t;
  const now = Date.now();
  const wasGround = state.player.onGround, inp = getInput();
  stepPlayer(state.player, state.tiles, inp, Math.min(dt, 0.05));
  if (wasGround && inp.jump && !state.player.onGround) audio.play('jump');

  let hover = null;
  if (mouse.onCanvas) {
    const tile = renderer.screenToTile(mouse.x, mouse.y);
    hover = { ...tile, inReach: inReach(state, tile.x, tile.y) };
    if (mouse.down) act(tile.x, tile.y, now);
  }
  renderer.render(state, now, hover, Math.min(dt, 0.05), tod());
  if (state.gems !== lastGems) { lastGems = state.gems; $('gemCount').textContent = state.gems; }
  if (t - lastSave > 5000) { lastSave = t; store.save(serialize(state)); }
  requestAnimationFrame(frame);
}

const saveNow = () => store.save(serialize(state));
addEventListener('beforeunload', saveNow);
document.addEventListener('visibilitychange', () => { if (document.hidden) saveNow(); });

if (new URLSearchParams(location.search).has('debug')) window.vexora = { get state() { return state; }, act, selectSlot };

refreshUi();
requestAnimationFrame(frame);
