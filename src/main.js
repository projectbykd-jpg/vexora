import { createGame, punch, place, plant, sell, buy, inReach, tickWorld } from './game.js';
import { stepPlayer } from './physics.js';
import { createRenderer } from './render.js';
import { createAudio } from './audio.js';
import { ITEM_ORDER, itemInfo, SPLICE, BLOCKS, seedOf } from './items.js';
import { normalizeWorldName, W, SURFACE } from './world.js';
import { localAdapter, serializeProfile, serializeWorld, deserialize } from './save.js';

const store = localAdapter;
const canvas = document.getElementById('game');
const renderer = createRenderer(canvas);
const audio = createAudio();
const art = renderer.art;
const $ = (id) => document.getElementById(id);

// `state` is always something renderable. In the menu it is a decorative START world nobody can edit.
let state = deserialize('START', null, store.loadProfile());
let inGame = false;

// ---------- input ----------
const keys = new Set();
const mouse = { x: 0, y: 0, down: false, onCanvas: false };
const GAME_KEYS = new Set(['a', 'd', 'w', ' ', 'arrowleft', 'arrowright', 'arrowup']);
const typing = (e) => e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;

addEventListener('keydown', (e) => {
  if (typing(e) || !inGame) return;
  const k = e.key.toLowerCase();
  audio.unlock();
  if (GAME_KEYS.has(k)) { keys.add(k); e.preventDefault(); }
  if (k === 'b') togglePanel('shop');
  if (k === 'r') togglePanel('book');
  if (k === 'm') toggleMute();
  if (k === 'e' || k === 'escape') exitWorld(k === 'e');
  if (/^[1-9]$/.test(k)) selectSlot(+k - 1);
});
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
addEventListener('blur', () => { keys.clear(); mouse.down = false; });
canvas.addEventListener('pointerdown', (e) => { audio.unlock(); mouse.lastKey = null; mouse.down = true; mouse.x = e.clientX; mouse.y = e.clientY; mouse.onCanvas = true; });
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
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), 2200);
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
    const mk = (label, fn) => { const b = document.createElement('button'); b.className = 'btn small'; b.textContent = label; b.addEventListener('click', () => { const r = fn(); if (!r.ok) toast(r.msg); else audio.play('coin'); refreshUi(); }); row.append(b); };
    mk(`Beli ${info.buy}`, () => buy(state, id, 1));
    mk(`Jual ${info.sell}`, () => sell(state, id, 1));
    mk('Semua', () => sell(state, id, have));
    return row;
  }));
}

function renderBook() {
  const list = $('bookList');
  const known = (id) => state.discovered[id];
  list.replaceChildren(...SPLICE.map(([a, b, r]) => {
    const row = document.createElement('div'); row.className = 'row recipe';
    const ic = (id) => `<img alt="" src="${art.icon(seedOf(id))}" title="${BLOCKS[id].name}">`;
    row.innerHTML = `${ic(a)}<b>+</b>${ic(b)}<b>→</b>` + (known(r) ? `${ic(r)}<span>${BLOCKS[r].name}</span>` : `<span class="unk">???</span>`);
    return row;
  }));
  $('bookCount').textContent = `${SPLICE.filter(([, , r]) => known(r)).length}/${SPLICE.length} ditemukan`;
}

function togglePanel(name) {
  for (const id of ['shop', 'book']) {
    const el = $(id);
    el.hidden = id === name ? !el.hidden : true;
    if (!el.hidden) (id === 'shop' ? renderShop : renderBook)();
  }
}
for (const [btn, name] of [['shopBtn', 'shop'], ['bookBtn', 'book']]) $(btn).addEventListener('click', () => togglePanel(name));
for (const el of document.querySelectorAll('[data-close]')) el.addEventListener('click', () => { $(el.dataset.close).hidden = true; });

function toggleMute() { const m = audio.toggle(); $('muteBtn').textContent = m ? '🔇' : '🔊'; if (!m) audio.play('coin'); }
$('muteBtn').addEventListener('click', () => { audio.unlock(); toggleMute(); });
$('muteBtn').textContent = audio.muted ? '🔇' : '🔊';

$('resetBtn').addEventListener('click', () => {
  if (!confirm('Hapus SEMUA progres dan semua dunia?')) return;
  store.clearAll(); state = deserialize('START', null, null); showMenu(); toast('Progres dihapus.');
});
$('exitBtn').addEventListener('click', () => exitWorld(false));

function refreshUi() {
  $('gemCount').textContent = state.gems;
  renderHotbar();
  if (!$('shop').hidden) renderShop();
  if (!$('book').hidden) renderBook();
}

// ---------- worlds ----------
function saveAll() {
  if (!inGame) return;
  store.saveWorld(state.name, serializeWorld(state));
  store.saveProfile(serializeProfile(state));
}

function enterWorld(rawName) {
  const name = normalizeWorldName(rawName);
  saveAll();
  const profile = serializeProfile(state);                  // carry inventory, gems and discoveries over
  state = deserialize(name, store.loadWorld(name), profile);
  inGame = true;
  document.body.classList.remove('in-menu');
  $('worldLabel').textContent = name;
  for (const id of ['shop', 'book']) $(id).hidden = true;
  keys.clear();
  refreshUi();
  saveAll();
  toast(`Masuk dunia ${name}`);
}

function exitWorld(onlyAtGate) {
  if (onlyAtGate) {                                         // E only works next to the gate, like a door
    const p = state.player;
    if (Math.abs(p.x + 0.35 - (W >> 1) - 0.5) > 2.2 || Math.abs(p.y - (SURFACE - 1.7)) > 2) { toast('Dekati gerbang lalu tekan E untuk keluar.'); return; }
  }
  showMenu();
}

function showMenu() {
  saveAll();
  const profile = serializeProfile(state);
  inGame = false;
  mouse.down = false;
  state = deserialize('START', null, profile);
  document.body.classList.add('in-menu');
  renderMenuLists();
  $('worldName').focus();
}

function renderMenuLists() {
  const chip = (name) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.textContent = name; b.addEventListener('click', () => { audio.unlock(); enterWorld(name); }); return b; };
  $('quickWorlds').replaceChildren(...['START', 'TANI', 'GALI', 'KEBUN', 'PASIR'].map(chip));
  const recent = store.recentWorlds();
  $('recentBox').hidden = recent.length === 0;
  $('recentWorlds').replaceChildren(...recent.map((w) => chip(w.name)));
}
$('worldForm').addEventListener('submit', (e) => { e.preventDefault(); audio.unlock(); enterWorld($('worldName').value); $('worldName').value = ''; });
$('worldName').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });

// ---------- actions ----------
function act(tx, ty, now) {
  const sel = state.selected, fx = renderer.fx;
  let r;
  if (sel === 'fist') r = punch(state, tx, ty, now);
  else if (sel.startsWith('seed_')) r = plant(state, tx, ty, sel, now);
  else r = place(state, tx, ty, sel);

  const quiet = r.msg === 'Terlalu cepat.' || r.msg === 'Kosong.';
  if (r.ok || (r.msg && !quiet)) {
    state.player.facing = tx + 0.5 >= state.player.x + 0.35 ? 1 : -1;
    if (sel === 'fist' && (r.ok || r.msg === 'Belum matang.')) renderer.punchAnim();
  }
  if (!r.ok) { if (r.msg && !quiet) { toast(r.msg); audio.play('error'); } return r; }

  if (sel === 'fist') {
    if (r.harvested) { fx.burst(tx, ty, '#ffe27a', 22, { speed: 4, up: 3, size: 5, glow: true, life: 0.9 }); toast(r.msg); audio.play('harvest'); }
    else if (r.broke) { fx.burst(tx, ty, r.color || '#c9a27a', 14, { speed: 3.2, up: 2.2, size: 5 }); audio.play('break'); }
    else { fx.burst(tx, ty, '#e8dcc8', 3, { speed: 1.5, up: 1, size: 3, life: 0.35 }); audio.play('punch'); }
  } else if (sel.startsWith('seed_')) {
    if (r.spliced) { fx.burst(tx, ty - 0.6, '#ffe27a', 28, { speed: 4.5, up: 3, size: 5, glow: true, life: 1.1 }); toast(r.msg); audio.play('splice'); if (r.firstTime) renderBook(); }
    else { fx.burst(tx, ty, '#6fd67b', 8, { speed: 1.8, up: 1.5, size: 3.5, life: 0.5 }); audio.play('plant'); }
  } else { fx.burst(tx, ty, '#ffffff', 5, { speed: 1.4, up: 0.8, size: 3, life: 0.3 }); audio.play('place'); }
  if (r.broke || r.harvested || r.spliced || sel !== 'fist') refreshUi();
  return r;
}

// ---------- loop ----------
const CYCLE_MS = 6 * 60 * 1000;                       // one full day = 6 minutes
const dbgTime = new URLSearchParams(location.search).get('time');
const tod = () => (dbgTime !== null ? +dbgTime : ((Date.now() % CYCLE_MS) / CYCLE_MS + 0.1) % 1);

let last = performance.now(), lastGems = -1, lastSave = performance.now();
function frame(t) {
  const dt = Math.min((t - last) / 1000, 0.05); last = t;
  const now = Date.now();
  let hover = null;

  if (inGame) {
    const wasGround = state.player.onGround, inp = getInput();
    stepPlayer(state.player, state.tiles, inp, dt);
    if (wasGround && inp.jump && !state.player.onGround) audio.play('jump');

    for (const ev of tickWorld(state, dt)) {
      const tx = Math.floor(ev.x), ty = Math.floor(ev.y);
      const label = ev.kind === 'gem' ? '+' + ev.n : '+' + ev.n + ' ' + itemInfo(ev.item).name;
      renderer.fx.text(tx, ty - 0.6, label, ev.kind === 'gem' ? 'gem' : 'item');
      audio.play('pickup');
      refreshUi();
    }
    if (mouse.onCanvas) {
      const tile = renderer.screenToTile(mouse.x, mouse.y);
      hover = { ...tile, inReach: inReach(state, tile.x, tile.y) };
      if (mouse.down) {
        // punching repeats while held; planting/placing/splicing fire once per tile per press (no accidental chain-splices)
        const k = tile.x + ',' + tile.y;
        if (state.selected === 'fist') act(tile.x, tile.y, now);
        else if (k !== mouse.lastKey) { mouse.lastKey = k; act(tile.x, tile.y, now); }
      }
    }
    if (t - lastSave > 5000) { lastSave = t; saveAll(); }
  }

  renderer.render(state, now, hover, dt, tod());
  if (state.gems !== lastGems) { lastGems = state.gems; $('gemCount').textContent = state.gems; }
  requestAnimationFrame(frame);
}

addEventListener('beforeunload', saveAll);
document.addEventListener('visibilitychange', () => { if (document.hidden) saveAll(); });
setTimeout(() => $('help').classList.add('fade'), 12000);

if (new URLSearchParams(location.search).has('debug')) window.vexora = { get state() { return state; }, act, selectSlot, enterWorld, get inGame() { return inGame; } };

showMenu();
requestAnimationFrame(frame);
