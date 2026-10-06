// Persistence. Profile (inventory, gems, discoveries) is shared by every world;
// each world stores only its own edits, trees and drops. Storage is an adapter so it can move to a server.
import { key, W, H, inBounds, normalizeWorldName } from './world.js';
import { BLOCKS, ITEM_ORDER } from './items.js';
import { createGame } from './game.js';

const PROFILE_KEY = 'vexora.profile.v2';
const WORLD_PREFIX = 'vexora.world.v2.';
const KNOWN_ITEMS = new Set(ITEM_ORDER);

export function serializeProfile(s) {
  return { v: 2, gems: s.gems, inv: s.inv, discovered: s.discovered };
}

export function serializeWorld(s) {
  return {
    v: 2, name: s.name, savedAt: Date.now(),
    edits: s.edits, plants: s.plants,
    drops: s.drops.map(({ kind, item, n, x, y }) => ({ kind, item, n, x, y })),
    player: { x: s.player.x, y: s.player.y },
  };
}

const num = (v) => typeof v === 'number' && Number.isFinite(v);

// Build a game from untrusted saved data. Anything invalid is dropped, never trusted.
export function deserialize(name, worldData, profileData) {
  const s = createGame({ name });
  const w = worldData && worldData.v === 2 && normalizeWorldName(worldData.name) === s.name ? worldData : null;
  if (w) {
    for (const [k, id] of Object.entries(w.edits || {})) {
      const [x, y] = k.split(',').map(Number);
      if (Number.isInteger(x) && Number.isInteger(y) && inBounds(x, y) && (id === 'air' || BLOCKS[id])) { s.tiles[y * W + x] = id; s.edits[key(x, y)] = id; }
    }
    for (const [k, p] of Object.entries(w.plants || {})) {
      const [x, y] = k.split(',').map(Number);
      if (Number.isInteger(x) && Number.isInteger(y) && inBounds(x, y) && p && BLOCKS[p.block]?.growSec && num(p.plantedAt)) s.plants[key(x, y)] = { block: p.block, plantedAt: p.plantedAt };
    }
    for (const d of Array.isArray(w.drops) ? w.drops.slice(0, 150) : []) {
      if (!d || !num(d.x) || !num(d.y) || !Number.isInteger(d.n) || d.n < 1 || d.n > 9999 || d.x < 0 || d.x > W || d.y < 0 || d.y > H) continue;
      if (d.kind === 'gem') s.drops.push({ kind: 'gem', item: null, n: d.n, x: d.x, y: d.y, vx: 0, vy: 0, age: 1 });
      else if (d.kind === 'item' && KNOWN_ITEMS.has(d.item)) s.drops.push({ kind: 'item', item: d.item, n: d.n, x: d.x, y: d.y, vx: 0, vy: 0, age: 1 });
    }
    if (w.player && num(w.player.x) && num(w.player.y) && inBounds(Math.floor(w.player.x), Math.floor(w.player.y))) { s.player.x = w.player.x; s.player.y = w.player.y; }
  }
  if (profileData && profileData.v === 2) {
    s.gems = Number.isInteger(profileData.gems) ? Math.max(0, profileData.gems) : 0;
    for (const [id, n] of Object.entries(profileData.inv || {})) if (KNOWN_ITEMS.has(id) && Number.isInteger(n) && n > 0 && n < 1e6) s.inv[id] = n;
    for (const id of Object.keys(profileData.discovered || {})) if (BLOCKS[id]?.growSec) s.discovered[id] = true;
  }
  return s;
}

const read = (k) => { try { const t = localStorage.getItem(k); return t ? JSON.parse(t) : null; } catch { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };

export const localAdapter = {
  loadProfile: () => read(PROFILE_KEY),
  saveProfile: (data) => write(PROFILE_KEY, data),
  loadWorld: (name) => read(WORLD_PREFIX + normalizeWorldName(name)),
  saveWorld: (name, data) => write(WORLD_PREFIX + normalizeWorldName(name), data),
  recentWorlds(limit = 6) {
    const out = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(WORLD_PREFIX)) { const d = read(k); if (d && d.v === 2) out.push({ name: normalizeWorldName(d.name), savedAt: d.savedAt || 0 }); }
      }
    } catch {}
    return out.sort((a, b) => b.savedAt - a.savedAt).slice(0, limit);
  },
  clearAll() {
    try { for (const k of Object.keys(localStorage)) if (k.startsWith('vexora.')) localStorage.removeItem(k); } catch {}
  },
};
