// Persistence. Storage is an adapter so it can be swapped for a server later.
import { generate, key, W, inBounds } from './world.js';
import { BLOCKS } from './items.js';
import { createGame } from './game.js';

const SAVE_KEY = 'vexora.save.v1';

export function serialize(s) {
  return { v: 1, seed: s.seed, edits: s.edits, plants: s.plants, inv: s.inv, gems: s.gems, player: { x: s.player.x, y: s.player.y } };
}

export function deserialize(data) {
  if (!data || data.v !== 1 || !Number.isInteger(data.seed)) return null;
  const s = createGame({ seed: data.seed });
  s.edits = {};
  for (const [k, id] of Object.entries(data.edits || {})) {
    const [x, y] = k.split(',').map(Number);
    if (Number.isInteger(x) && Number.isInteger(y) && inBounds(x, y) && (id === 'air' || BLOCKS[id])) {
      s.tiles[y * W + x] = id;
      s.edits[key(x, y)] = id;
    }
  }
  s.plants = data.plants || {};
  s.inv = data.inv || {};
  s.gems = Math.max(0, data.gems | 0);
  if (data.player) { s.player.x = data.player.x; s.player.y = data.player.y; }
  return s;
}

export const localAdapter = {
  load() { try { const t = localStorage.getItem(SAVE_KEY); return t ? JSON.parse(t) : null; } catch { return null; } },
  save(data) { try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); return true; } catch { return false; } },
  clear() { try { localStorage.removeItem(SAVE_KEY); } catch {} },
};

export { generate };
