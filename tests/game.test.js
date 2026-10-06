import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, punch, place, plant, sell, buy, addItem, isMature, tickWorld, spawnDrop, MAX_DROPS } from '../src/game.js';
import { idx, SURFACE, W, H, key, generate, seedFromName, normalizeWorldName } from '../src/world.js';
import { stepPlayer } from '../src/physics.js';
import { serializeProfile, serializeWorld, deserialize } from '../src/save.js';
import { BLOCKS, ITEM_ORDER, itemInfo, TUNING, SPLICE, spliceResult } from '../src/items.js';

const sx = (s) => Math.floor(s.player.x + 0.35);       // tile column under the player
const always = (v) => () => v;
const T = (n) => n * 1000;                                 // seconds -> ms
function settle(s) { for (let i = 0; i < 120; i++) stepPlayer(s.player, s.tiles, {}, 1 / 60); }
// let physics run, then stand on every drop so it is picked up (as a player would walk over it)
function collectAll(s) {
  for (let i = 0; i < 90; i++) tickWorld(s, 1 / 60);
  for (const d of [...s.drops]) { s.player.x = d.x - 0.35; s.player.y = d.y - 1; tickWorld(s, 0.05); }
}
const breakBlock = (s, x, y, rng = always(0.99)) => { let now = 1000, r; for (let i = 0; i < 12; i++) { r = punch(s, x, y, now, rng); now += 200; if (r.broke) break; } return r; };

test('world names are normalised and give a stable, distinct seed per world', () => {
  assert.equal(normalizeWorldName(' my World!! '), 'MYWORLD');
  assert.equal(normalizeWorldName(''), 'START');
  assert.equal(normalizeWorldName('x'.repeat(40)).length, 16);
  assert.equal(seedFromName('start'), seedFromName('START'));
  assert.notEqual(seedFromName('FARM'), seedFromName('START'));
});

test('world generation is deterministic, has a bedrock floor, a gate, and a solid spawn floor', () => {
  const a = generate(7), b = generate(7), c = generate(8);
  assert.deepEqual(a.tiles, b.tiles);
  assert.notDeepEqual(a.tiles, c.tiles);
  for (let x = 0; x < W; x++) assert.equal(a.tiles[idx(x, H - 1)], 'bedrock');
  assert.equal(a.tiles[idx(W >> 1, SURFACE - 1)], 'gate');
  for (const name of ['START', 'FARM', 'A1', 'ZZZ', 'DAGANG', 'GALI']) {
    const t = generate(seedFromName(name)).tiles;
    for (let x = 0; x < W; x++) { assert.equal(t[idx(x, H - 1)], 'bedrock', name + ' floor'); assert.equal(t[idx(x, H - 2)], 'bedrock'); }
    for (let y = SURFACE; y < SURFACE + 6; y++) assert.equal(t[idx(W >> 1, y)], 'dirt', name + ' spawn column must be solid');
  }
});

test('player lands on the ground and cannot walk through walls', () => {
  const s = createGame(); settle(s);
  assert.ok(s.player.onGround);
  const y0 = s.player.y;
  for (let i = 0; i < 600; i++) stepPlayer(s.player, s.tiles, { left: true }, 1 / 60);
  assert.ok(s.player.x >= 0 && s.player.x <= W);
  assert.ok(Math.abs(s.player.y - y0) < 3);
});

test('breaking a block needs `hardness` hits, then it becomes air and records an edit', () => {
  const s = createGame(); settle(s);
  const x = sx(s), y = SURFACE;
  assert.equal(s.tiles[idx(x, y)], 'dirt');
  let now = 1000, res;
  for (let i = 0; i < BLOCKS.dirt.hardness - 1; i++) { res = punch(s, x, y, now, always(0.99)); now += 200; assert.equal(res.broke, false); }
  res = punch(s, x, y, now, always(0.99));
  assert.equal(res.broke, true);
  assert.equal(s.tiles[idx(x, y)], 'air');
  assert.equal(s.edits[key(x, y)], 'air');
});

test('DROPS: broken blocks lie in the world and only enter the inventory when picked up', () => {
  const s = createGame(); settle(s);
  const x = sx(s), y = SURFACE;
  const r = breakBlock(s, x, y, always(0));                 // rng 0 => every roll succeeds
  assert.equal(r.broke, true);
  assert.ok(s.drops.length >= 1, 'drops exist');
  assert.equal(s.inv.dirt, undefined, 'nothing in inventory yet');
  assert.equal(s.gems, 0);
  collectAll(s);
  assert.equal(s.drops.length, 0);
  assert.equal(s.inv.dirt, 1);
  assert.ok(s.inv.seed_dirt >= 1);
  assert.ok(s.gems >= 0);
});

test('DROPS: cannot be picked up from far away, nor instantly (no pickup delay exploit)', () => {
  const s = createGame(); settle(s);
  spawnDrop(s, 'item', 'dirt', 3, sx(s) + 20, SURFACE - 1, always(0.5));
  for (let i = 0; i < 120; i++) tickWorld(s, 1 / 60);
  assert.equal(s.inv.dirt, undefined, 'far drop stays put');
  const s2 = createGame(); settle(s2);
  spawnDrop(s2, 'item', 'dirt', 1, sx(s2), SURFACE - 2, always(0.5));
  tickWorld(s2, 0.05);
  assert.equal(s2.inv.dirt, undefined, 'too young to pick up');
});

test('DROPS: each drop is collected exactly once (no duplication)', () => {
  const s = createGame(); settle(s);
  spawnDrop(s, 'item', 'stone', 5, sx(s), SURFACE - 2, always(0.5));
  spawnDrop(s, 'gem', null, 7, sx(s), SURFACE - 2, always(0.5));
  for (let i = 0; i < 200; i++) tickWorld(s, 1 / 60);
  assert.equal(s.inv.stone, 5);
  assert.equal(s.gems, 7);
  assert.equal(s.drops.length, 0);
});

test('DROPS: a full world never destroys value (oldest drop is paid out)', () => {
  const s = createGame(); settle(s);
  for (let i = 0; i < MAX_DROPS + 10; i++) spawnDrop(s, 'gem', null, 1, 5, 5, always(0.5));
  assert.equal(s.drops.length, MAX_DROPS);
  assert.equal(s.gems, 10);
});

test('DROPS: a block placed on a drop does not trap it inside the wall', () => {
  const s = createGame(); settle(s);
  spawnDrop(s, 'item', 'dirt', 1, sx(s) + 2, SURFACE - 1, always(0.5));
  for (let i = 0; i < 60; i++) tickWorld(s, 1 / 60);
  addItem(s, 'stone', 1);
  const d = s.drops[0];
  place(s, Math.floor(d.x), Math.floor(d.y), 'stone');
  for (let i = 0; i < 60; i++) tickWorld(s, 1 / 60);
  assert.ok(!BLOCKS[s.tiles[idx(Math.floor(s.drops[0].x), Math.floor(s.drops[0].y))]], 'drop is not inside a solid block');
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
  s.player.x = 50; s.player.y = H - 4;
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

test('farming: plant -> unripe punch does nothing -> mature punch drops the harvest', () => {
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
  assert.equal(s.plants[key(x, y)], undefined);
  collectAll(s);
  assert.ok(s.inv.dirt >= TUNING.harvest.min);
  assert.ok(s.gems >= TUNING.harvest.gems[0]);
});

test('seed needs solid ground below; breaking the ground destroys the plant', () => {
  const s = createGame(); settle(s);
  const x = sx(s) + 1;
  addItem(s, 'seed_dirt', 2);
  assert.equal(plant(s, x, SURFACE - 3, 'seed_dirt', 0).ok, false, 'floating');
  assert.equal(plant(s, x, SURFACE - 1, 'seed_dirt', 0).ok, true);
  breakBlock(s, x, SURFACE);
  assert.equal(s.plants[key(x, SURFACE - 1)], undefined);
});

test('SPLICE: recipes are symmetric, unique, and only use growable blocks', () => {
  const seen = new Set();
  for (const [a, b, r] of SPLICE) {
    assert.equal(spliceResult(a, b), r); assert.equal(spliceResult(b, a), r);
    assert.ok(BLOCKS[a].growSec && BLOCKS[b].growSec && BLOCKS[r].growSec);
    const k = [a, b].sort().join('+'); assert.ok(!seen.has(k), 'duplicate recipe ' + k); seen.add(k);
    assert.notEqual(r, a); assert.notEqual(r, b);
  }
  assert.equal(spliceResult('dirt', 'dirt'), null);
});

test('SPLICE: a different seed on a growing tree changes it, costs the seed, restarts growth, records a discovery', () => {
  const s = createGame(); settle(s);
  const x = sx(s) + 1, y = SURFACE - 1;
  addItem(s, 'seed_dirt', 1); addItem(s, 'seed_stone', 1);
  plant(s, x, y, 'seed_dirt', 1000);
  const r = plant(s, x, y, 'seed_stone', 5000);
  assert.equal(r.ok, true); assert.equal(r.spliced, true); assert.equal(r.result, 'sand'); assert.equal(r.firstTime, true);
  assert.equal(s.plants[key(x, y)].block, 'sand');
  assert.equal(s.plants[key(x, y)].plantedAt, 5000);
  assert.equal(s.inv.seed_stone, undefined);
  assert.equal(s.discovered.sand, true);
  addItem(s, 'seed_dirt', 1); addItem(s, 'seed_stone', 1);
  plant(s, x + 1, y, 'seed_dirt', 6000);
  assert.equal(plant(s, x + 1, y, 'seed_stone', 6100).firstTime, false, 'second time is not a new discovery');
});

test('SPLICE: bad splices are refused and cost nothing', () => {
  const s = createGame(); settle(s);
  const x = sx(s) + 1, y = SURFACE - 1;
  addItem(s, 'seed_dirt', 3); addItem(s, 'seed_glass', 1);
  plant(s, x, y, 'seed_dirt', 0);
  assert.equal(plant(s, x, y, 'seed_dirt', 10).ok, false, 'same seed');
  assert.equal(plant(s, x, y, 'seed_glass', 10).ok, false, 'no recipe');
  assert.equal(s.inv.seed_dirt, 2); assert.equal(s.inv.seed_glass, 1);
  assert.equal(s.plants[key(x, y)].block, 'dirt');
  assert.equal(plant(s, x, y, 'seed_dirt', T(BLOCKS.dirt.growSec) + 5).ok, false, 'mature trees cannot be spliced');
  s.inv.seed_stone = 0; delete s.inv.seed_stone;
  assert.equal(plant(s, x, y, 'seed_stone', 10).ok, false, 'no seed in inventory');
});

test('ECONOMY: you can never profit by buying then selling any item', () => {
  for (const id of ITEM_ORDER) {
    const i = itemInfo(id);
    assert.ok(i, id + ' must be a valid item');
    assert.ok(i.buy > i.sell, `${id}: buy ${i.buy} must exceed sell ${i.sell}`);
  }
  const s = createGame(); s.gems = 5000;
  for (const id of ITEM_ORDER) { buy(s, id, 5); sell(s, id, 5); }
  assert.ok(s.gems < 5000);
});

test('ECONOMY: harder-to-make items are worth more, and every spliced result outsells its parents', () => {
  for (const [a, b, r] of SPLICE) assert.ok(BLOCKS[r].sell > Math.max(BLOCKS[a].sell, BLOCKS[b].sell), `${r} should be worth more than ${a}/${b}`);
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

test('save/load round-trips a world and the player profile', () => {
  const s = createGame({ name: 'farm' }); settle(s);
  addItem(s, 'dirt', 3); addItem(s, 'seed_wood', 2); s.gems = 42; s.discovered.sand = true;
  addItem(s, 'seed_dirt', 1); plant(s, sx(s) + 1, SURFACE - 1, 'seed_dirt', 123);
  breakBlock(s, sx(s), SURFACE);
  spawnDrop(s, 'item', 'stone', 4, sx(s) + 3, SURFACE - 1, always(0.5));
  const world = JSON.parse(JSON.stringify(serializeWorld(s))), profile = JSON.parse(JSON.stringify(serializeProfile(s)));
  const loaded = deserialize('FARM', world, profile);
  assert.deepEqual(loaded.tiles, s.tiles);
  assert.deepEqual(loaded.inv, s.inv);
  assert.deepEqual(loaded.plants, s.plants);
  assert.deepEqual(loaded.discovered, s.discovered);
  assert.equal(loaded.gems, s.gems);
  assert.equal(loaded.drops.length, s.drops.length);
});

test('profile is shared across worlds but world edits are not', () => {
  const a = createGame({ name: 'A1' }); addItem(a, 'dirt', 9); a.gems = 77;
  setTileFor(a);
  const b = deserialize('B2', null, serializeProfile(a));
  assert.equal(b.inv.dirt, 9); assert.equal(b.gems, 77);
  assert.deepEqual(b.edits, {});
  function setTileFor(g) { g.tiles[idx(1, 1)] = 'stone'; g.edits[key(1, 1)] = 'stone'; }
});

test('a world save is ignored if it belongs to a different world name', () => {
  const a = createGame({ name: 'AAA' }); a.edits[key(3, 3)] = 'stone';
  const loaded = deserialize('BBB', serializeWorld(a), null);
  assert.deepEqual(loaded.edits, {});
});

test('loading garbage or tampered saves never crashes or corrupts anything', () => {
  assert.doesNotThrow(() => deserialize('START', null, null));
  assert.doesNotThrow(() => deserialize('START', 'junk', 42));
  const s = deserialize('START', {
    v: 2, name: 'START',
    edits: { '9999,9999': 'dirt', '1,1': '<script>', 'x,y': 'dirt', '5,5': 'bedrock' },
    plants: { '3,3': { block: 'bedrock', plantedAt: 1 }, '4,4': { block: 'dirt', plantedAt: 'now' } },
    drops: [{ kind: 'item', item: 'toString', n: 5, x: 1, y: 1 }, { kind: 'gem', n: -5, x: 1, y: 1 }, { kind: 'gem', n: 9e9, x: 1, y: 1 }, { kind: 'item', item: 'dirt', n: 2, x: NaN, y: 1 }],
    player: { x: 'a', y: null },
  }, { v: 2, gems: -50, inv: { dirt: 5, bogus: 9, stone: -3, wood: 1.5, glass: 1e9 }, discovered: { sand: true, bedrock: true, __proto__: true } });
  assert.equal(s.gems, 0);
  assert.deepEqual(s.inv, { dirt: 5 });
  assert.equal(s.tiles.length, W * H);
  assert.ok(s.tiles.every((t) => t === 'air' || t === 'gate' || BLOCKS[t]));
  assert.equal(Object.keys(s.plants).length, 0);
  assert.equal(s.drops.length, 0);
  assert.deepEqual(s.discovered, { sand: true });
  assert.ok(Number.isFinite(s.player.x) && Number.isFinite(s.player.y));
});
