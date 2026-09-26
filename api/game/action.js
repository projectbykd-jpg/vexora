const { initDb } = require('../_lib/db');
const { getSessionUserId } = require('../_lib/auth');
const { getItem } = require('../../data/items');

const MAX_X = 64;
const MAX_Y = 64;
const MAX_RANGE = 7;
const ALLOWED_BLOCKS = new Set(['grass','dirt','stone','wood','leaf','sand','crystal','gold','brick','glass']);

function withinRange(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by) <= MAX_RANGE;
}

async function getWorld(db, worldId, userId) {
  const result = await db.execute({
    sql:`SELECT id, owner_id, privacy
         FROM worlds
         WHERE id = ? AND (owner_id = ? OR privacy = 'public')
         LIMIT 1`,
    args:[worldId,userId]
  });
  return result.rows[0] || null;
}

async function canEdit(db, worldId, userId, x, y, action) {
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
  if (permission.rows[0]) {
    return action === 'place' ? Number(permission.rows[0].can_build) === 1 : Number(permission.rows[0].can_break) === 1;
  }

  const lock = await db.execute({
    sql:`SELECT id FROM world_locks
         WHERE world_id = ?
           AND ? BETWEEN x1 AND x2
           AND ? BETWEEN y1 AND y2
         LIMIT 1`,
    args:[worldId,x,y]
  });
  return !lock.rows[0];
}

function validateCoords(x,y,z=0) {
  return Number.isInteger(x) && Number.isInteger(y) && Number.isInteger(z)
    && x >= -MAX_X && x <= MAX_X && y >= 0 && y <= MAX_Y && z >= -MAX_X && z <= MAX_X;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error:'Method not allowed.' });
  const userId = getSessionUserId(req);
  if (!userId) return res.status(401).json({ error:'Authentication required.' });

  try {
    const db = await initDb();
    const body = req.body || {};
    const worldId = typeof body.worldId === 'string' ? body.worldId : null;
    const action = body.action === 'break' || body.action === 'place' ? body.action : null;
    const x = Number(body.x);
    const y = Number(body.y);
    const z = Number(body.z ?? 0);
    const playerX = Number(body.playerX);
    const playerY = Number(body.playerY);

    if (!worldId || !action || !validateCoords(x,y,z)) {
      return res.status(400).json({ error:'Invalid game action.' });
    }
    if (Number.isFinite(playerX) && Number.isFinite(playerY) && !withinRange(playerX, playerY, x + 0.5, y + 0.5)) {
      return res.status(400).json({ error:'Target is too far away.' });
    }

    const world = await getWorld(db,worldId,userId);
    if (!world) return res.status(404).json({ error:'World not found or inaccessible.' });

    if (action === 'break') {
      if (y === 0) return res.status(400).json({ error:'The world foundation cannot be broken.' });
      if (!(await canEdit(db,worldId,userId,x,y,'break'))) {
        return res.status(403).json({ error:'This area is protected.' });
      }

      const tx = await db.transaction('write');
      try {
        const block = await tx.execute({
          sql:'SELECT type FROM world_blocks WHERE world_id = ? AND x = ? AND y = ? AND z = ? LIMIT 1',
          args:[worldId,x,y,z]
        });
        if (!block.rows[0]) {
          await tx.commit();
          return res.status(404).json({ error:'Block no longer exists.' });
        }

        const deleted = await tx.execute({
          sql:'DELETE FROM world_blocks WHERE world_id = ? AND x = ? AND y = ? AND z = ?',
          args:[worldId,x,y,z]
        });
        if (Number(deleted.rowsAffected || 0) !== 1) {
          await tx.rollback();
          return res.status(409).json({ error:'Block changed. Try again.' });
        }

        const itemId = String(block.rows[0].type);
        await tx.execute({
          sql:`INSERT INTO player_inventory (user_id, item_id, quantity)
               VALUES (?, ?, 1)
               ON CONFLICT(user_id, item_id)
               DO UPDATE SET quantity = quantity + 1, updated_at = datetime('now')`,
          args:[userId,itemId]
        });
        await tx.execute({
          sql:`INSERT INTO audit_logs (user_id, world_id, action, payload_json)
               VALUES (?, ?, ?, ?)`,
          args:[userId,worldId,'block.break',JSON.stringify({x,y,z,itemId})]
        });
        await tx.execute({
          sql:"UPDATE worlds SET updated_at = datetime('now') WHERE id = ?",
          args:[worldId]
        });
        await tx.commit();
        return res.status(200).json({ action, x,y,z, itemId, quantity:1 });
      } catch(error) {
        try { await tx.rollback(); } catch {}
        throw error;
      }
    }

    const itemId = String(body.itemId || '');
    const definition = getItem(itemId);
    if (!definition || !definition.placeable || !ALLOWED_BLOCKS.has(itemId)) {
      return res.status(400).json({ error:'That item cannot be placed as a block.' });
    }
    if (y === 0) return res.status(400).json({ error:'Cannot place on the world foundation.' });
    if (!(await canEdit(db,worldId,userId,x,y,'place'))) {
      return res.status(403).json({ error:'This area is protected.' });
    }

    const target = await db.execute({
      sql:'SELECT 1 FROM world_blocks WHERE world_id = ? AND x = ? AND y = ? AND z = ? LIMIT 1',
      args:[worldId,x,y,z]
    });
    if (target.rows[0]) return res.status(409).json({ error:'That space is occupied.' });

    const neighbor = await db.execute({
      sql:`SELECT 1 FROM world_blocks
           WHERE world_id = ? AND z = ?
             AND ((x = ? AND y = ?) OR (x = ? AND y = ?) OR (x = ? AND y = ?) OR (x = ? AND y = ?))
           LIMIT 1`,
      args:[worldId,z,x+1,y,x-1,y,x,y+1,x,y-1]
    });
    if (!neighbor.rows[0]) return res.status(400).json({ error:'A new block must touch an existing block.' });

    const tx = await db.transaction('write');
    try {
      const consumed = await tx.execute({
        sql:`UPDATE player_inventory
             SET quantity = quantity - 1, updated_at = datetime('now')
             WHERE user_id = ? AND item_id = ? AND quantity >= 1`,
        args:[userId,itemId]
      });
      if (Number(consumed.rowsAffected || 0) !== 1) {
        await tx.rollback();
        return res.status(400).json({ error:`You do not have a ${definition.name}.` });
      }

      try {
        await tx.execute({
          sql:'INSERT INTO world_blocks (world_id,x,y,z,type) VALUES (?,?,?,?,?)',
          args:[worldId,x,y,z,itemId]
        });
      } catch(error) {
        await tx.rollback();
        if (String(error.message || '').includes('UNIQUE') || String(error.message || '').includes('constraint')) {
          return res.status(409).json({ error:'That space was just occupied. Try again.' });
        }
        throw error;
      }

      await tx.execute({
        sql:`INSERT INTO audit_logs (user_id, world_id, action, payload_json)
             VALUES (?, ?, ?, ?)`,
        args:[userId,worldId,'block.place',JSON.stringify({x,y,z,itemId})]
      });
      await tx.execute({
        sql:"UPDATE worlds SET updated_at = datetime('now') WHERE id = ?",
        args:[worldId]
      });
      await tx.commit();
      return res.status(200).json({ action, x,y,z,itemId, quantity:-1 });
    } catch(error) {
      try { await tx.rollback(); } catch {}
      throw error;
    }
  } catch(error) {
    console.error(error);
    return res.status(500).json({ error:'Unable to process game action.' });
  }
};
