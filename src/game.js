// All gameplay rules live here and are exposed as ACTIONS: punch, place, plant, sell, buy.
// The UI never mutates state directly. When multiplayer arrives, these same functions
// run on the server and the browser only sends the action.
import { generate, idx, inBounds, key, SURFACE, isSolid, W, H, seedFromName, normalizeWorldName } from './world.js';
import { BLOCKS, TUNING, itemInfo, seedOf, isSeed, blockOfSeed, spliceResult } from './items.js';
import { PLAYER, playerOverlapsTile, playerCenter } from './physics.js';

export const MAX_DROPS = 150;
const PICKUP_DELAY = 0.35;      // seconds before a fresh drop can be picked up

export function createGame({ name = 'START' } = {}) {
  name = normalizeWorldName(name);
  const seed = seedFromName(name);
  const { tiles, spawn } = generate(seed);
  return {
    name,
    seed,
    tiles,
    edits: {},                 // key -> block id, diff against generate(seed)
    plants: {},                // key -> { block, plantedAt }
    damage: {},                // key -> { hits, last }
    drops: [],                 // items and gems lying in the world
    player: { x: spawn.x, y: SURFACE - PLAYER.h - 0.01, vx: 0, vy: 0, onGround: false, facing: 1 },
    inv: {},                   // player-wide, carried between worlds
    gems: 0,                   // player-wide
    discovered: {},            // player-wide: splice results found so far
    selected: 'fist',
    lastPunch: 0,
  };
}

const fail = (msg) => ({ ok: false, msg });
const ok = (extra = {}) => ({ ok: true, ...extra });

export function setTile(s, x, y, id) {
  s.tiles[idx(x, y)] = id;
  s.edits[key(x, y)] = id;
}

export function addItem(s, id, n = 1) { s.inv[id] = (s.inv[id] || 0) + n; }
function takeItem(s, id) {
  if (!(s.inv[id] > 0)) return false;
  if (--s.inv[id] === 0) delete s.inv[id];
  return true;
}

export function inReach(s, tx, ty) {
  const c = playerCenter(s.player);
  return Math.hypot(tx + 0.5 - c.x, ty + 0.5 - c.y) <= TUNING.reach;
}

export const isMature = (plant, now) => now - plant.plantedAt >= BLOCKS[plant.block].growSec * 1000;

const randInt = (rng, [lo, hi]) => lo + Math.floor(rng() * (hi - lo + 1));

// ---------- drops: things lying in the world until the player walks over them ----------
function give(s, d) {
  if (d.kind === 'gem') s.gems += d.n; else addItem(s, d.item, d.n);
}

export function spawnDrop(s, kind, item, n, tx, ty, rng = Math.random) {
  if (n <= 0) return;
  if (s.drops.length >= MAX_DROPS) give(s, s.drops.shift());   // never lose value when the world is full
  s.drops.push({ kind, item: kind === 'gem' ? null : item, n, x: tx + 0.5, y: ty + 0.5, vx: (rng() - 0.5) * 4, vy: -(2 + rng() * 2), age: 0 });
}

const solidAt = (tiles, x, y) => x < 0 || x >= W || y >= H || (y >= 0 && isSolid(tiles[idx(x, y)]));

// Advance drop physics and let the player pick things up. Returns pickup events for effects.
export function tickWorld(s, dt) {
  const events = [], p = s.player;
  for (let i = s.drops.length - 1; i >= 0; i--) {
    const d = s.drops[i];
    d.age += dt;
    while (d.y > 0 && solidAt(s.tiles, Math.floor(d.x), Math.floor(d.y))) d.y -= 1;     // a block was placed on it
    d.vy = Math.min(d.vy + 28 * dt, 20);
    let nx = d.x + d.vx * dt, ny = d.y + d.vy * dt;
    if (solidAt(s.tiles, Math.floor(nx), Math.floor(d.y))) { d.vx *= -0.3; nx = d.x; }
    if (solidAt(s.tiles, Math.floor(nx), Math.floor(ny + 0.15))) {
      ny = Math.floor(ny + 0.15) - 0.15 - 1e-3;
      d.vy = d.vy > 3 ? -d.vy * 0.3 : 0; d.vx *= 0.85;
    }
    d.x = nx; d.y = ny;
    if (d.y > H + 2) { s.drops.splice(i, 1); continue; }
    if (d.age >= PICKUP_DELAY && d.x > p.x - 0.4 && d.x < p.x + PLAYER.w + 0.4 && d.y > p.y - 0.2 && d.y < p.y + PLAYER.h + 0.2) {
      give(s, d);
      events.push({ type: 'pickup', kind: d.kind, item: d.item, n: d.n, x: d.x, y: d.y });
      s.drops.splice(i, 1);
    }
  }
  return events;
}

// ---------- actions ----------
export function punch(s, tx, ty, now, rng = Math.random) {
  if (!inBounds(tx, ty)) return fail('Di luar dunia.');
  if (now - s.lastPunch < TUNING.punchCooldownMs) return fail('Terlalu cepat.');
  if (!inReach(s, tx, ty)) return fail('Terlalu jauh.');
  s.lastPunch = now;
  const k = key(tx, ty);

  const plant = s.plants[k];
  if (plant) {
    if (!isMature(plant, now)) return fail('Belum matang.');
    delete s.plants[k];
    const b = BLOCKS[plant.block];
    const h = TUNING.harvest;
    const blocks = randInt(rng, [h.min, h.max]);
    const gems = randInt(rng, h.gems);
    const seed = rng() < h.seedChance ? 1 : 0;
    spawnDrop(s, 'item', plant.block, blocks, tx, ty - 0.5, rng);
    spawnDrop(s, 'gem', null, gems, tx, ty - 0.5, rng);
    if (seed) spawnDrop(s, 'item', seedOf(plant.block), 1, tx, ty - 0.5, rng);
    return ok({ harvested: true, blocks, gems, seed, msg: `Panen ${b.name}: +${blocks} blok, +${gems} gem${seed ? ', +1 bibit' : ''}` });
  }

  const id = s.tiles[idx(tx, ty)];
  if (id === 'air') return fail('Kosong.');
  const b = BLOCKS[id];
  if (b.hardness === Infinity) return fail(`${b.name} tidak bisa dihancurkan.`);

  let d = s.damage[k];
  if (!d || now - d.last > TUNING.hitDecayMs) d = s.damage[k] = { hits: 0, last: now };
  d.hits++; d.last = now;
  if (d.hits < b.hardness) return ok({ broke: false, hits: d.hits, of: b.hardness });

  delete s.damage[k];
  setTile(s, tx, ty, 'air');
  delete s.plants[key(tx, ty - 1)];                          // a tree dies when its ground is removed
  const drops = { block: 0, seed: 0, gems: 0 };
  if (rng() < TUNING.blockDropChance) { drops.block = 1; spawnDrop(s, 'item', id, 1, tx, ty, rng); }
  if (b.growSec && rng() < TUNING.seedDropChance) { drops.seed = 1; spawnDrop(s, 'item', seedOf(id), 1, tx, ty, rng); }
  if (b.gemDrop) { drops.gems = randInt(rng, b.gemDrop); spawnDrop(s, 'gem', null, drops.gems, tx, ty, rng); }
  return ok({ broke: true, drops, color: b.color });
}

export function place(s, tx, ty, itemId) {
  const info = itemInfo(itemId);
  if (!info || info.kind !== 'block') return fail('Bukan blok.');
  if (!inBounds(tx, ty)) return fail('Di luar dunia.');
  if (!inReach(s, tx, ty)) return fail('Terlalu jauh.');
  if (s.tiles[idx(tx, ty)] !== 'air') return fail('Sudah terisi.');
  if (s.plants[key(tx, ty)]) return fail('Ada tanaman.');
  if (playerOverlapsTile(s.player, tx, ty)) return fail('Terhalang pemain.');
  if (!takeItem(s, itemId)) return fail('Item habis.');
  setTile(s, tx, ty, itemId);
  return ok();
}

// Planting on empty ground starts a tree. Planting a different seed on a growing tree SPLICES it.
export function plant(s, tx, ty, seedId, now) {
  if (!isSeed(seedId)) return fail('Bukan bibit.');
  if (!inBounds(tx, ty)) return fail('Di luar dunia.');
  if (!inReach(s, tx, ty)) return fail('Terlalu jauh.');
  if (!(s.inv[seedId] > 0)) return fail('Bibit habis.');
  const k = key(tx, ty), existing = s.plants[k];

  if (existing) {
    if (isMature(existing, now)) return fail('Pohon sudah matang, panen dulu.');
    const base = blockOfSeed(seedId);
    if (base === existing.block) return fail('Sudah ditanam di sini.');
    const result = spliceResult(existing.block, base);
    if (!result) return fail('Dua bibit ini tidak cocok digabung.');
    takeItem(s, seedId);
    existing.block = result; existing.plantedAt = now;
    const firstTime = !s.discovered[result];
    s.discovered[result] = true;
    return ok({ spliced: true, result, firstTime, msg: `${firstTime ? 'PENEMUAN BARU! ' : 'Splice berhasil: '}${BLOCKS[result].name}` });
  }

  if (s.tiles[idx(tx, ty)] !== 'air') return fail('Tidak bisa menanam di sini.');
  if (!inBounds(tx, ty + 1) || !isSolid(s.tiles[idx(tx, ty + 1)])) return fail('Bibit butuh tanah di bawahnya.');
  if (playerOverlapsTile(s.player, tx, ty)) return fail('Terhalang pemain.');
  takeItem(s, seedId);
  s.plants[k] = { block: blockOfSeed(seedId), plantedAt: now };
  return ok();
}

export function sell(s, itemId, count = 1) {
  const info = itemInfo(itemId);
  if (!info) return fail('Item tidak bisa dijual.');
  const n = Math.min(count, s.inv[itemId] || 0);
  if (n <= 0) return fail('Item tidak ada.');
  s.inv[itemId] -= n;
  if (s.inv[itemId] === 0) delete s.inv[itemId];
  s.gems += info.sell * n;
  return ok({ gems: info.sell * n });
}

export function buy(s, itemId, count = 1) {
  const info = itemInfo(itemId);
  if (!info) return fail('Item tidak dijual.');
  if (count < 1 || !Number.isInteger(count)) return fail('Jumlah tidak valid.');
  const cost = info.buy * count;
  if (s.gems < cost) return fail('Gem tidak cukup.');
  s.gems -= cost;
  addItem(s, itemId, count);
  return ok({ cost });
}
