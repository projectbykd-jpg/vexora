// Single source of truth for every item. Game rules read from here; nothing is hard-coded elsewhere.

export const BLOCKS = {
  dirt:    { name: 'Tanah',  color: '#8b5a2b', solid: true,  hardness: 3,        sell: 1, growSec: 20, gemDrop: [0, 1] },
  stone:   { name: 'Batu',   color: '#7b8088', solid: true,  hardness: 5,        sell: 2, growSec: 40, gemDrop: [0, 2] },
  wood:    { name: 'Kayu',   color: '#b9854a', solid: true,  hardness: 4,        sell: 2, growSec: 30, gemDrop: [0, 2] },
  bedrock: { name: 'Bedrock', color: '#2b2d33', solid: true, hardness: Infinity, sell: 0 },
  gate:    { name: 'Gerbang', color: '#e8e2c8', solid: false, hardness: Infinity, sell: 0 },
};

export const SEED_PREFIX = 'seed_';
export const seedOf = (blockId) => SEED_PREFIX + blockId;
export const isSeed = (id) => id.startsWith(SEED_PREFIX);
export const blockOfSeed = (id) => id.slice(SEED_PREFIX.length);

// Items a player can hold in inventory (order = hotbar order).
export const ITEM_ORDER = ['dirt', 'stone', 'wood', 'seed_dirt', 'seed_stone', 'seed_wood'];

export function itemInfo(id) {
  if (isSeed(id)) {
    const b = BLOCKS[blockOfSeed(id)];
    if (!b || !b.growSec) return null;
    return { id, name: 'Bibit ' + b.name, color: b.color, kind: 'seed', block: blockOfSeed(id), sell: b.sell + 1, buy: (b.sell + 1) * 4 };
  }
  const b = BLOCKS[id];
  if (!b || b.sell === 0) return null;
  return { id, name: b.name, color: b.color, kind: 'block', sell: b.sell, buy: b.sell * 3 };
}

export const TUNING = {
  seedDropChance: 0.12,      // chance a broken block also drops its seed
  blockDropChance: 0.6,      // chance a broken block drops itself
  harvest: { min: 2, max: 4, seedChance: 0.4, gems: [2, 6] },
  hitDecayMs: 5000,          // damage on a block is forgotten after this long
  punchCooldownMs: 180,
  reach: 4.5,                // tiles
};
