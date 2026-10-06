// All gameplay rules live here and are exposed as ACTIONS: punch, place, plant, sell, buy.
// The UI never mutates state directly. When multiplayer arrives, these same functions
// run on the server and the browser only sends the action.
import { generate, idx, inBounds, key, SURFACE, isSolid } from './world.js';
import { BLOCKS, TUNING, itemInfo, seedOf, isSeed, blockOfSeed } from './items.js';
import { PLAYER, playerOverlapsTile, playerCenter } from './physics.js';

export function createGame({ seed = 1337 } = {}) {
  const { tiles, spawn } = generate(seed);
  return {
    seed,
    tiles,
    edits: {},                 // key -> block id, diff against generate(seed)
    plants: {},                // key -> { block, plantedAt }
    damage: {},                // key -> { hits, last }
    player: { x: spawn.x, y: SURFACE - PLAYER.h - 0.01, vx: 0, vy: 0, onGround: false, facing: 1 },
    inv: {},
    gems: 0,
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

function removePlantAbove(s, x, y) { delete s.plants[key(x, y - 1)]; }

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
    addItem(s, plant.block, blocks);
    s.gems += gems;
    if (seed) addItem(s, seedOf(plant.block), 1);
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
  removePlantAbove(s, tx, ty);
  const drops = { block: 0, seed: 0, gems: 0 };
  if (rng() < TUNING.blockDropChance) { drops.block = 1; addItem(s, id, 1); }
  if (b.growSec && rng() < TUNING.seedDropChance) { drops.seed = 1; addItem(s, seedOf(id), 1); }
  if (b.gemDrop) { drops.gems = randInt(rng, b.gemDrop); s.gems += drops.gems; }
  return ok({ broke: true, drops });
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

export function plant(s, tx, ty, seedId, now) {
  if (!isSeed(seedId)) return fail('Bukan bibit.');
  if (!inBounds(tx, ty)) return fail('Di luar dunia.');
  if (!inReach(s, tx, ty)) return fail('Terlalu jauh.');
  if (s.tiles[idx(tx, ty)] !== 'air' || s.plants[key(tx, ty)]) return fail('Tidak bisa menanam di sini.');
  if (!inBounds(tx, ty + 1) || !isSolid(s.tiles[idx(tx, ty + 1)])) return fail('Bibit butuh tanah di bawahnya.');
  if (playerOverlapsTile(s.player, tx, ty)) return fail('Terhalang pemain.');
  if (!takeItem(s, seedId)) return fail('Bibit habis.');
  s.plants[key(tx, ty)] = { block: blockOfSeed(seedId), plantedAt: now };
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
  const cost = info.buy * count;
  if (count < 1 || !Number.isInteger(count)) return fail('Jumlah tidak valid.');
  if (s.gems < cost) return fail('Gem tidak cukup.');
  s.gems -= cost;
  addItem(s, itemId, count);
  return ok({ cost });
}
