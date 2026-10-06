import { createGame, punch, place, plant, sell, buy } from './game.js';
import { stepPlayer } from './physics.js';
import { createRenderer } from './render.js';
import { inReach } from './game.js';
import { ITEM_ORDER, itemInfo } from './items.js';
import { localAdapter, serialize, deserialize } from './save.js';

const store = localAdapter;
let state = deserialize(store.load()) || createGame();
const canvas = document.getElementById('game');
const renderer = createRenderer(canvas);
const $ = (id) => document.getElementById(id);

// ---------- input ----------
const keys = new Set();
const mouse = { x: 0, y: 0, down: false, onCanvas: false };
const GAME_KEYS = new Set(['a', 'd', 'w', ' ', 'arrowleft', 'arrowright', 'arrowup']);
addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (GAME_KEYS.has(k)) { keys.add(k); e.preventDefault(); }
  if (k === 'b') toggleShop();
  if (/^[1-9]$/.test(k)) selectSlot(+k - 1);
});
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
addEventListener('blur', () => { keys.clear(); mouse.down = false; });
canvas.addEventListener('pointerdown', (e) => { mouse.down = true; mouse.x = e.clientX; mouse.y = e.clientY; mouse.onCanvas = true; });
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
  const t = $('toast'); t.textContent = msg; t.classList.add('on');
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
    const info = id === 'fist' ? { name: 'Tinju', color: '#ffd7a8', kind: 'fist' } : itemInfo(id);
    el.title = info.name;
    el.innerHTML = `<em>${i + 1}</em><i class="${info.kind === 'seed' ? 'seed' : ''}" style="background:${info.color}"></i>` + (id === 'fist' ? '' : `<b>${state.inv[id]}</b>`);
    el.addEventListener('click', () => { state.selected = id; renderHotbar(); });
    return el;
  }));
}

function renderShop() {
  const list = $('shopList');
  list.replaceChildren(...ITEM_ORDER.map((id) => {
    const info = itemInfo(id), have = state.inv[id] || 0;
    const row = document.createElement('div'); row.className = 'row';
    row.innerHTML = `<span>${info.name} <small class="muted">(punya ${have})</small></span>`;
    const mk = (label, fn) => { const b = document.createElement('button'); b.textContent = label; b.addEventListener('click', () => { const r = fn(); if (!r.ok) toast(r.msg); refreshUi(); }); row.append(b); };
    mk(`Beli ${info.buy}💎`, () => buy(state, id, 1));
    mk(`Jual ${info.sell}💎`, () => sell(state, id, 1));
    mk('Semua', () => sell(state, id, have));
    return row;
  }));
}

function toggleShop() { const s = $('shop'); s.hidden = !s.hidden; if (!s.hidden) renderShop(); }
$('shopBtn').addEventListener('click', toggleShop);
$('resetBtn').addEventListener('click', () => {
  if (!confirm('Hapus semua progres dan mulai dari awal?')) return;
  store.clear(); state = createGame(); refreshUi(); toast('Progres dihapus.');
});

function refreshUi() { $('gemCount').textContent = state.gems; renderHotbar(); if (!$('shop').hidden) renderShop(); }

// ---------- actions ----------
function act(tx, ty, now) {
  const sel = state.selected;
  let r;
  if (sel === 'fist') r = punch(state, tx, ty, now);
  else if (sel.startsWith('seed_')) r = plant(state, tx, ty, sel, now);
  else r = place(state, tx, ty, sel);
  if (r.msg && !r.ok && r.msg !== 'Terlalu cepat.' && r.msg !== 'Kosong.') toast(r.msg);
  if (r.ok && r.msg) toast(r.msg);
  if (r.ok && (r.broke || r.harvested || sel !== 'fist')) refreshUi();
  return r;
}

// ---------- loop ----------
let last = performance.now(), lastGems = -1, lastSave = performance.now();
function frame(t) {
  const dt = (t - last) / 1000; last = t;
  const now = Date.now();
  stepPlayer(state.player, state.tiles, getInput(), dt);

  let hover = null;
  if (mouse.onCanvas) {
    const tile = renderer.screenToTile(mouse.x, mouse.y);
    hover = { ...tile, inReach: inReach(state, tile.x, tile.y) };
    if (mouse.down) act(tile.x, tile.y, now);
  }
  renderer.render(state, now, hover);
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
