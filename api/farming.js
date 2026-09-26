const { initDb } = require('./_lib/db');
const { getSessionUserId } = require('./_lib/auth');
const { getItem } = require('../data/items');

const MAX_X = 64;
const MAX_Y = 64;
const SEEDS = {
  grass_seed: {
    growSeconds: 45,
    stageCount: 3,
    harvestItem: 'meadow_fiber',
    harvestAmount: 2,
    seedReturnMin: 0,
    seedReturnMax: 2
  },
  crystal_seed: {
    growSeconds: 120,
    stageCount: 4,
    harvestItem: 'crystal_shard',
    harvestAmount: 1,
    seedReturnMin: 0,
    seedReturnMax: 1
  }
};

async function worldFor(db, worldId, userId) {
  const result = await db.execute({
    sql:`SELECT id, owner_id, privacy FROM worlds
         WHERE id = ? AND (owner_id = ? OR privacy = 'public') LIMIT 1`,
    args:[worldId,userId]
  });
  return result.rows[0] || null;
}

async function canEdit(db, worldId, userId, x, y) {
  const world = await db.execute({
    sql:'SELECT owner_id FROM worlds WHERE id = ? LIMIT 1',
    args:[worldId]
  });
  if (!world.rows[0]) return false;
  if (world.rows[0].owner_id === userId) return true;
  const banned = await db.execute({
    sql:'SELECT 1 FROM world_bans WHERE world_id = ? AND user_id = ? LIMIT 1',
    args:[worldId,userId]
  });
  if (banned.rows[0]) return false;
  const permission = await db.execute({
    sql:'SELECT can_build, can_break FROM world_permissions WHERE world_id = ? AND user_id = ? LIMIT 1',
    args:[worldId,userId]
  });
  if (permission.rows[0] && Number(permission.rows[0].can_build) !== 1) return false;
  if (permission.rows[0] && Number(permission.rows[0].can_break) !== 1) return false;
  const lock = await db.execute({
    sql:`SELECT 1 FROM world_locks
         WHERE world_id = ? AND ? BETWEEN x1 AND x2 AND ? BETWEEN y1 AND y2 LIMIT 1`,
    args:[worldId,x,y]
  });
  return !lock.rows[0];
}

function coordsOk(x,y) {
  return Number.isInteger(x) && Number.isInteger(y) &&
    x >= -MAX_X && x <= MAX_X && y > 0 && y <= MAX_Y;
}

function stageOf(plant, nowMs) {
  const cfg = SEEDS[plant.seed_item_id];
  if (!cfg) return 0;
  const elapsed = Math.max(0, nowMs - Date.parse(plant.planted_at));
  return Math.min(cfg.stageCount, Math.floor((elapsed / 1000) / (cfg.growSeconds / cfg.stageCount)));
}

module.exports = async function handler(req, res) {
  const userId = getSessionUserId(req);
  if (!userId) return res.status(401).json({ error:'Authentication required.' });

  try {
    const db = await initDb();
    const worldId = typeof req.query?.worldId === 'string' ? req.query.worldId : String(req.body?.worldId || '');
    if (!worldId) return res.status(400).json({ error:'World id is required.' });
    const world = await worldFor(db, worldId, userId);
    if (!world) return res.status(404).json({ error:'World not found or inaccessible.' });

    if (req.method === 'GET') {
      const result = await db.execute({
        sql:`SELECT world_id, x, y, seed_item_id, planted_at, grows_at, stage
             FROM world_plants WHERE world_id = ? ORDER BY y, x`,
        args:[worldId]
      });
      const now = Date.now();
      return res.status(200).json({
        plants: result.rows.map(p => ({
          worldId:p.world_id, x:Number(p.x), y:Number(p.y),
          seedItemId:p.seed_item_id,
          plantedAt:p.planted_at, growsAt:p.grows_at,
          stage:stageOf(p,now),
          ready:Date.parse(p.grows_at) <= now
        }))
      });
    }

    if (req.method !== 'POST') return res.status(405).json({ error:'Method not allowed.' });

    const body = req.body || {};
    const action = body.action === 'plant' || body.action === 'harvest' ? body.action : '';
    const x = Math.trunc(Number(body.x));
    const y = Math.trunc(Number(body.y));
    if (!action || !coordsOk(x,y)) return res.status(400).json({ error:'Invalid farming action.' });

    if (action === 'plant') {
      const seedItemId = String(body.seedItemId || '');
      const cfg = SEEDS[seedItemId];
      if (!cfg || !getItem(seedItemId)?.seedable) return res.status(400).json({ error:'That item is not a valid seed.' });
      if (!(await canEdit(db,worldId,userId,x,y))) return res.status(403).json({ error:'This farming area is protected.' });

      const existing = await db.execute({
        sql:'SELECT 1 FROM world_plants WHERE world_id = ? AND x = ? AND y = ? LIMIT 1',
        args:[worldId,x,y]
      });
      if (existing.rows[0]) return res.status(409).json({ error:'A plant already occupies this tile.' });

      const soil = await db.execute({
        sql:'SELECT type FROM world_blocks WHERE world_id = ? AND x = ? AND y = ? AND z = 0 LIMIT 1',
        args:[worldId,x,y-1]
      });
      if (!soil.rows[0] || !['grass','dirt','sand'].includes(String(soil.rows[0].type))) {
        return res.status(400).json({ error:'Seeds need a valid soil block underneath.' });
      }

      const plantedAt = new Date();
      const growsAt = new Date(plantedAt.getTime() + cfg.growSeconds*1000);
      const tx = await db.transaction('write');
      try {
        const consumed = await tx.execute({
          sql:`UPDATE player_inventory SET quantity = quantity - 1, updated_at = datetime('now')
               WHERE user_id = ? AND item_id = ? AND quantity >= 1`,
          args:[userId,seedItemId]
        });
        if (Number(consumed.rowsAffected || 0) !== 1) {
          await tx.rollback();
          return res.status(400).json({ error:`You do not have a ${getItem(seedItemId).name}.` });
        }
        await tx.execute({
          sql:`INSERT INTO world_plants (world_id,x,y,seed_item_id,planted_at,grows_at,stage)
               VALUES (?,?,?,?,?,?,0)`,
          args:[worldId,x,y,seedItemId,plantedAt.toISOString(),growsAt.toISOString(),0]
        });
        await tx.execute({
          sql:`INSERT INTO audit_logs (user_id,world_id,action,payload_json) VALUES (?,?,?,?)`,
          args:[userId,worldId,'farm.plant',JSON.stringify({x,y,seedItemId})]
        });
        await tx.commit();
        return res.status(201).json({ planted:true, x,y,seedItemId,growsAt:growsAt.toISOString() });
      } catch (error) {
        try { await tx.rollback(); } catch {}
        throw error;
      }
    }

    if (!(await canEdit(db,worldId,userId,x,y))) return res.status(403).json({ error:'This farming area is protected.' });
    const plant = await db.execute({
      sql:`SELECT seed_item_id, planted_at, grows_at
           FROM world_plants WHERE world_id = ? AND x = ? AND y = ? LIMIT 1`,
      args:[worldId,x,y]
    });
    if (!plant.rows[0]) return res.status(404).json({ error:'No plant found here.' });
    const p = plant.rows[0];
    const cfg = SEEDS[String(p.seed_item_id)];
    if (!cfg) return res.status(500).json({ error:'Plant definition is missing.' });
    const now = Date.now();
    if (Date.parse(p.grows_at) > now) {
      const remaining = Math.max(1, Math.ceil((Date.parse(p.grows_at)-now)/1000));
      return res.status(409).json({ error:`Plant is still growing for ${remaining}s.`, remainingSeconds:remaining });
    }

    const returnedSeeds = cfg.seedReturnMax > cfg.seedReturnMin
      ? cfg.seedReturnMin + Math.floor(Math.random() * (cfg.seedReturnMax-cfg.seedReturnMin+1))
      : cfg.seedReturnMin;

    const tx = await db.transaction('write');
    try {
      const removed = await tx.execute({
        sql:'DELETE FROM world_plants WHERE world_id = ? AND x = ? AND y = ?',
        args:[worldId,x,y]
      });
      if (Number(removed.rowsAffected || 0) !== 1) {
        await tx.rollback();
        return res.status(409).json({ error:'Plant was harvested by another player.' });
      }
      await tx.execute({
        sql:`INSERT INTO player_inventory (user_id,item_id,quantity)
             VALUES (?,?,?) ON CONFLICT(user_id,item_id)
             DO UPDATE SET quantity=quantity+excluded.quantity, updated_at=datetime('now')`,
        args:[userId,cfg.harvestItem,cfg.harvestAmount]
      });
      if (returnedSeeds > 0) {
        await tx.execute({
          sql:`INSERT INTO player_inventory (user_id,item_id,quantity)
               VALUES (?,?,?) ON CONFLICT(user_id,item_id)
               DO UPDATE SET quantity=quantity+excluded.quantity, updated_at=datetime('now')`,
          args:[userId,p.seed_item_id,returnedSeeds]
        });
      }
      await tx.execute({
        sql:`INSERT INTO audit_logs (user_id,world_id,action,payload_json) VALUES (?,?,?,?)`,
        args:[userId,worldId,'farm.harvest',JSON.stringify({x,y,seedItemId:p.seed_item_id,harvestItem:cfg.harvestItem,harvestAmount:cfg.harvestAmount,returnedSeeds})]
      });
      await tx.commit();
      return res.status(200).json({
        harvested:true, x,y,
        itemId:cfg.harvestItem, quantity:cfg.harvestAmount,
        returnedSeeds
      });
    } catch (error) {
      try { await tx.rollback(); } catch {}
      throw error;
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error:'Unable to process farming action.' });
  }
};
