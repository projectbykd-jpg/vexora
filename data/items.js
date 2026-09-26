const ITEM_TYPES = {
  BLOCK: 'block',
  SEED: 'seed',
  CURRENCY: 'currency',
  TOOL: 'tool',
  CLOTHING: 'clothing',
  PET: 'pet',
  CONSUMABLE: 'consumable',
  MATERIAL: 'material',
  EVENT: 'event'
};

const ITEMS = {
  grass: { id:'grass', name:'Grass Block', type:ITEM_TYPES.BLOCK, stack:200, placeable:true, breakable:true, tradeable:true },
  dirt: { id:'dirt', name:'Dirt Block', type:ITEM_TYPES.BLOCK, stack:200, placeable:true, breakable:true, tradeable:true },
  stone: { id:'stone', name:'Stone Block', type:ITEM_TYPES.BLOCK, stack:200, placeable:true, breakable:true, tradeable:true },
  wood: { id:'wood', name:'Wood Block', type:ITEM_TYPES.BLOCK, stack:200, placeable:true, breakable:true, tradeable:true },
  leaf: { id:'leaf', name:'Leaf Block', type:ITEM_TYPES.BLOCK, stack:200, placeable:true, breakable:true, tradeable:true },
  sand: { id:'sand', name:'Sand Block', type:ITEM_TYPES.BLOCK, stack:200, placeable:true, breakable:true, tradeable:true },
  crystal: { id:'crystal', name:'Vexa Crystal Ore', type:ITEM_TYPES.BLOCK, stack:200, placeable:true, breakable:true, tradeable:true },
  gold: { id:'gold', name:'Vexa Gold Ore', type:ITEM_TYPES.BLOCK, stack:200, placeable:true, breakable:true, tradeable:true },
  brick: { id:'brick', name:'Brick Block', type:ITEM_TYPES.BLOCK, stack:200, placeable:true, breakable:true, tradeable:true },
  glass: { id:'glass', name:'Glass Block', type:ITEM_TYPES.BLOCK, stack:200, placeable:true, breakable:true, tradeable:true },
  grass_seed: { id:'grass_seed', name:'Meadow Seed', type:ITEM_TYPES.SEED, stack:200, seedable:true, tradeable:true },
  crystal_seed: { id:'crystal_seed', name:'Vexa Crystal Seed', type:ITEM_TYPES.SEED, stack:200, seedable:true, tradeable:true },
  wood_seed: { id:'wood_seed', name:'Grove Seed', type:ITEM_TYPES.SEED, stack:200, seedable:true, tradeable:true },
  flower_seed: { id:'flower_seed', name:'Bloom Seed', type:ITEM_TYPES.SEED, stack:200, seedable:true, tradeable:true },
  vine_seed: { id:'vine_seed', name:'Vexa Vine Seed', type:ITEM_TYPES.SEED, stack:200, seedable:true, tradeable:true },
  crystal_bloom_seed: { id:'crystal_bloom_seed', name:'Crystal Bloom Seed', type:ITEM_TYPES.SEED, stack:200, seedable:true, tradeable:true },
  meadow_fiber: { id:'meadow_fiber', name:'Meadow Fiber', type:ITEM_TYPES.MATERIAL, stack:500, tradeable:true },
  crystal_shard: { id:'crystal_shard', name:'Crystal Shard', type:ITEM_TYPES.MATERIAL, stack:500, tradeable:true },
  plank: { id:'plank', name:'Grove Plank', type:ITEM_TYPES.MATERIAL, stack:500, tradeable:true },
  bloom_petal: { id:'bloom_petal', name:'Bloom Petal', type:ITEM_TYPES.MATERIAL, stack:500, tradeable:true },
  vine_fiber: { id:'vine_fiber', name:'Vine Fiber', type:ITEM_TYPES.MATERIAL, stack:500, tradeable:true },
  coin: { id:'coin', name:'Vexa Coin', type:ITEM_TYPES.CURRENCY, stack:999999, tradeable:true },
  gem: { id:'gem', name:'Vexa Gem', type:ITEM_TYPES.CURRENCY, stack:999999, tradeable:true },
  event_token: { id:'event_token', name:'Event Token', type:ITEM_TYPES.EVENT, stack:999999, tradeable:false },
  starter_pickaxe: { id:'starter_pickaxe', name:'Starter Pickaxe', type:ITEM_TYPES.TOOL, stack:1, tradeable:false },
  backpack: { id:'backpack', name:'Explorer Backpack', type:ITEM_TYPES.CLOTHING, stack:1, tradeable:true, equipmentSlot:'back' },
  explorer_cap: { id:'explorer_cap', name:'Explorer Cap', type:ITEM_TYPES.CLOTHING, stack:1, tradeable:true, equipmentSlot:'head' }
};

const STARTER_INVENTORY = {
  grass: 120,
  dirt: 40,
  stone: 20,
  wood: 10,
  leaf: 10,
  sand: 10,
  brick: 10,
  starter_pickaxe: 1,
  grass_seed: 5,
  crystal_seed: 2,
  wood_seed: 2,
  flower_seed: 2
};

function getItem(id) {
  return ITEMS[String(id)] || null;
}

function isItem(id) {
  return !!getItem(id);
}

module.exports = { ITEM_TYPES, ITEMS, STARTER_INVENTORY, getItem, isItem };
