import { W, H, idx, inBounds, isSolid } from './world.js';

export const PLAYER = { w: 0.7, h: 1.7 };
const GRAVITY = 45, MOVE = 6, JUMP = 15, MAX_FALL = 25, MAX_DT = 1 / 30;

function solidAt(tiles, x, y) {
  if (x < 0 || x >= W || y >= H) return true; // world edges are walls
  if (y < 0) return false;
  return isSolid(tiles[idx(x, y)]);
}

function overlapsSolid(tiles, px, py) {
  const x0 = Math.floor(px), x1 = Math.floor(px + PLAYER.w - 1e-6);
  const y0 = Math.floor(py), y1 = Math.floor(py + PLAYER.h - 1e-6);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (solidAt(tiles, x, y)) return true;
  return false;
}

// Advance the player by dt seconds. input = { left, right, jump }.
export function stepPlayer(p, tiles, input, dt) {
  dt = Math.min(dt, MAX_DT);
  p.vx = ((input.right ? 1 : 0) - (input.left ? 1 : 0)) * MOVE;
  if (p.vx) p.facing = Math.sign(p.vx);
  if (input.jump && p.onGround) { p.vy = -JUMP; p.onGround = false; }
  p.vy = Math.min(p.vy + GRAVITY * dt, MAX_FALL);

  // X axis
  let nx = p.x + p.vx * dt;
  if (overlapsSolid(tiles, nx, p.y)) nx = p.vx > 0 ? Math.floor(nx + PLAYER.w) - PLAYER.w - 1e-4 : Math.floor(nx) + 1 + 1e-4;
  p.x = nx;

  // Y axis
  let ny = p.y + p.vy * dt;
  p.onGround = false;
  if (overlapsSolid(tiles, p.x, ny)) {
    if (p.vy > 0) { ny = Math.floor(ny + PLAYER.h) - PLAYER.h - 1e-4; p.onGround = true; }
    else ny = Math.floor(ny) + 1 + 1e-4;
    p.vy = 0;
  }
  p.y = ny;
}

export function playerOverlapsTile(p, tx, ty) {
  return p.x < tx + 1 && p.x + PLAYER.w > tx && p.y < ty + 1 && p.y + PLAYER.h > ty;
}

export const playerCenter = (p) => ({ x: p.x + PLAYER.w / 2, y: p.y + PLAYER.h / 2 });
export { inBounds };
