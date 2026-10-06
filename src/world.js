import { mulberry32 } from './rng.js';
import { BLOCKS } from './items.js';

export const W = 100;
export const H = 60;
export const SURFACE = 20;

export const idx = (x, y) => y * W + x;
export const inBounds = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
export const key = (x, y) => x + ',' + y;

// Deterministic terrain from a seed. Returns { tiles, spawn }.
export function generate(seed) {
  const rng = mulberry32(seed);
  const tiles = new Array(W * H).fill('air');
  const spawnX = W >> 1;

  // smooth height line: a few random anchors, linear interpolation
  const anchors = [];
  for (let x = 0; x <= W; x += 10) anchors.push(SURFACE + Math.round((rng() - 0.5) * 4));
  const heightAt = (x) => {
    if (Math.abs(x - spawnX) <= 4) return SURFACE;
    const i = Math.floor(x / 10), f = (x % 10) / 10;
    return Math.round(anchors[i] * (1 - f) + anchors[Math.min(i + 1, anchors.length - 1)] * f);
  };

  for (let x = 0; x < W; x++) {
    const top = heightAt(x);
    for (let y = top; y < H; y++) {
      let id = 'dirt';
      if (y >= top + 7) id = rng() < 0.15 ? 'wood' : 'stone';
      if (y >= H - 2) id = 'bedrock';
      tiles[idx(x, y)] = id;
    }
  }
  tiles[idx(spawnX, SURFACE - 1)] = 'gate';
  return { tiles, spawn: { x: spawnX + 0.15, y: SURFACE - 2 } };
}

export const isSolid = (id) => id !== 'air' && !!BLOCKS[id]?.solid;
