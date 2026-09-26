const MIN_X = -64;
const MAX_X = 64;
const MAX_Y = 40;

function seeded(x, seed) {
  const n = Math.sin((x + seed * 0.013) * 12.9898) * 43758.5453;
  return n - Math.floor(n);
}

function terrainHeight(x, seed) {
  return Math.floor(
    19 +
    Math.sin((x + seed % 97) * 0.12) * 2 +
    Math.sin((x + seed % 31) * 0.035) * 3 +
    seeded(x, seed) * 2
  );
}

function add(list, x, y, type) {
  if (x < MIN_X || x > MAX_X || y < 0 || y > MAX_Y) return;
  list.push({ x, y, z:0, type });
}

function generateBlocks(seedInput) {
  const seed = Number(seedInput) || 1337;
  const blocks = [];

  for (let x = MIN_X; x <= MAX_X; x++) {
    const top = terrainHeight(x, seed);
    for (let y = 0; y <= top; y++) {
      let type = y === top ? 'grass' : y >= top - 3 ? 'dirt' : 'stone';
      if (y < 6 && seeded(x + y * 7, seed + 4) > 0.93) type = 'gold';
      if (y > 4 && y < top - 2 && seeded(x * 3 + y, seed + 8) > 0.975) type = 'crystal';
      add(blocks,x,y,type);
    }
    if (seeded(x * 3, seed + 2) > 0.84) {
      const t = top + 1;
      add(blocks,x,t,'wood');
      add(blocks,x,t+1,'wood');
      for (let dx=-2; dx<=2; dx++) {
        for (let dy=2; dy<=4; dy++) {
          if (Math.abs(dx) + Math.abs(dy-3) <= 3) add(blocks,x+dx,t+dy-1,'leaf');
        }
      }
    }
  }
  return blocks;
}

module.exports = { generateBlocks };
