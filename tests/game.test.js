import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, punch, place, plant, sell, buy, addItem, isMature } from '../src/game.js';
import { idx, SURFACE, W, H, key, generate } from '../src/world.js';
import { stepPlayer } from '../src/physics.js';
import { serialize, deserialize } from '../src/save.js';
import { BLOCKS, ITEM_ORDER, itemInfo, TUNING } from '../src/items.js';

const sx = (s) => Math.floor(s.player.x + 0.35);       // tile column under the player
const always = (v) => () => v;
// settle the player on the ground
function settle(s) { for (let i = 0; i < 120; i++) stepPlayer(s.player, s.tiles, {}, 1 / 60); }
const T = (n) => n * 1000;                                 // helper: seconds -> ms

test('world generation is deterministic and has bedrock floor + gate', () => {
  const a = generate(7), b = generate(7), c = generate(8);
  assert.deepEqual(a.tiles, b.tiles);
  assert.notDeepEqual(a.tiles, c.tiles);
  for (let x = 0; x < W; x++) assert.equal(a.tiles[idx(x, H - 1)], 'bedrock');
  assert.equal(a.tiles[idx(W >> 1, SURFACE - 1)], 'gate');
});

test('player lands on the ground and cannot walk through walls', () => {
  const s = createGame();
  settle(s);
  assert.ok(s.player.onGround);
  const y0 = s.player.y;
  for (let i = 0; i < 600; i++) stepPlayer(s.player, s.tiles, { left: true }, 1 / 60);
  assert.ok(s.player.x >= 0 && s.player.x <= W);
  assert.ok(Math.abs(s.player.y - y0) < 3);
});

test('breaking a block needs `hardness` hits, then it becomes air and records an edit', () => {
  const s = createGame(); settle(s);
  const x = sx(s), y = SURFACE;                             // ground block under spawn is dirt
  assert.equal(s.tiles[idx(x, y)], 'dirt');
  let now = 1000, res;
  for (let i = 0; i < BLOCKS.dirt.hardness - 1; i++) { res = punch(s, x, y, now, always(0.99)); now += 200; assert.equal(res.broke, false); }
  res = punch(s, x, y, now, always(0.99));
  assert.equal(res.broke, true);
  assert.equal(s.tiles[idx(x, y)], 'air');
  assert.equal(s.edits[key(x, y)], 'air');
});

test('punch cooldown blocks spam', () => {
  const s = createGame(); settle(s);
  assert.equal(punch(s, sx(s), SURFACE, 1000, always(0.99)).ok, true);
  assert.equal(punch(s, sx(s), SURFACE, 1050, always(0.99)).ok, false);
});

test('reach is enforced for punch, place and plant', () => {
  const s = createGame(); settle(s);
  addItem(s, 'dirt', 1); addItem(s, 'seed_dirt', 1);
  assert.equal(punch(s, sx(s) + 20, SURFACE, 1000).ok, false);
  assert.equal(place(s, sx(s) + 20, SURFACE - 1, 'dirt').ok, false);
  assert.equal(plant(s, sx(s) + 20, SURFACE - 1, 'seed_dirt', 0).ok, false);
});

test('bedrock and gate cannot be destroyed', () => {
  const s = createGame(); settle(s);
  s.player.x = 50; s.player.y = H - 4;                      // teleport near bedrock for the test
  s.tiles[idx(50, H - 4)] = 'air';
  assert.equal(punch(s, 50, H - 1, 1000).ok, false);
  assert.equal(s.tiles[idx(50, H - 1)], 'bedrock');
});

test('place consumes the item, refuses occupied tiles and the player\'s own tile', () => {
  const s = createGame(); settle(s);
  const x = sx(s) + 2, y = SURFACE - 1;
  assert.equal(place(s, x, y, 'dirt').ok, false, 'no item');
  addItem(s, 'dirt', 1);
  assert.equal(place(s, sx(s), SURFACE - 1, 'dirt').ok, false, 'inside player');
  assert.equal(place(s, x, y, 'dirt').ok, true);
  assert.equal(s.inv.dirt, undefined);
  addItem(s, 'dirt', 1);
  assert.equal(place(s, x, y, 'dirt').ok, false, 'occupied');
});

test('farming: plant -> unripe punch does nothing -> mature punch harvests', () => {
  const s = createGame(); settle(s);
  const x = sx(s) + 1, y = SURFACE - 1;
  addItem(s, 'seed_dirt', 1);
  assert.equal(plant(s, x, y, 'seed_dirt', 0).ok, true);
  assert.equal(s.inv.seed_dirt, undefined);
  assert.equal(isMature(s.plants[key(x, y)], T(5)), false);
  assert.equal(punch(s, x, y, T(5)).ok, false);
  assert.ok(s.plants[key(x, y)], 'unripe plant must survive a punch');
  const res = punch(s, x, y, T(BLOCKS.dirt.growSec) + 1, always(0));
  assert.equal(res.harvested, true);
  assert.ok(s.inv.dirt >= TUNING.harvest.min);
  assert.ok(s.gems >= TUNING.harvest.gems[0]);
  assert.equal(s.plants[key(x, y)], undefined);
});

test('seed needs solid ground below; breaking the ground destroys the plant', () => {
  const s = createGame(); settle(s);
  const x = sx(s) + 1;
  addItem(s, 'seed_dirt', 2);
  assert.equal(plant(s, x, SURFACE - 3, 'seed_dirt', 0).ok, false, 'floating');
  assert.equal(plant(s, x, SURFACE - 1, 'seed_dirt', 0).ok, true);
  let now = 5000;
  for (let i = 0; i < BLOCKS.dirt.hardness; i++) { punch(s, x, SURFACE, now, always(0.99)); now += 200; }
  assert.equal(s.plants[key(x, SURFACE - 1)], undefined);
});

test('ECONOMY: you can never profit by buying then selling any item', () => {
  for (const id of ITEM_ORDER) {
    const i = itemInfo(id);
    assert.ok(i.buy > i.sell, `${id}: buy ${i.buy} must exceed sell ${i.sell}`);
  }
  const s = createGame(); s.gems = 1000;
  for (const id of ITEM_ORDER) { buy(s, id, 5); sell(s, id, 5); }
  assert.ok(s.gems < 1000);
});

test('buy/sell reject bad input and cannot create negative or fractional values', () => {
  const s = createGame(); s.gems = 5;
  assert.equal(buy(s, 'dirt', -3).ok, false);
  assert.equal(buy(s, 'dirt', 1.5).ok, false);
  assert.equal(buy(s, 'seed_stone', 1).ok, false, 'not enough gems');
  assert.equal(sell(s, 'dirt', 1).ok, false, 'none owned');
  assert.equal(sell(s, 'bedrock', 1).ok, false);
  assert.equal(s.gems, 5);
});

test('save/load round-trips the whole game state', () => {
  const s = createGame({ seed: 99 }); settle(s);
  addItem(s, 'dirt', 3); addItem(s, 'seed_wood', 2); s.gems = 42;
  addItem(s, 'seed_dirt', 1); plant(s, sx(s) + 1, SURFACE - 1, 'seed_dirt', 123);
  let now = 1000; for (let i = 0; i < 3; i++) { punch(s, sx(s), SURFACE, now, always(0.99)); now += 200; }
  const loaded = deserialize(JSON.parse(JSON.stringify(serialize(s))));
  assert.deepEqual(loaded.tiles, s.tiles);
  assert.deepEqual(loaded.inv, s.inv);
  assert.deepEqual(loaded.plants, s.plants);
  assert.equal(loaded.gems, s.gems);
  assert.ok(loaded.gems >= 42);
});

test('loading garbage or tampered saves never crashes or corrupts the world', () => {
  assert.equal(deserialize(null), null);
  assert.equal(deserialize({ v: 2 }), null);
  const s = deserialize({ v: 1, seed: 5, edits: { '9999,9999': 'dirt', '1,1': '<script>', 'x,y': 'dirt' }, gems: -50, inv: {} });
  assert.equal(s.gems, 0);
  assert.equal(s.tiles.length, W * H);
  assert.ok(s.tiles.every((t) => t === 'air' || BLOCKS[t]));
});
