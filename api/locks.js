const { randomUUID } = require('crypto');
const { initDb } = require('./_lib/db');
const { getSessionUserId } = require('./_lib/auth');

function clean(row) {
  return {
    id: row.id,
    worldId: row.world_id,
    ownerId: row.owner_id,
    x1: Number(row.x1),
    y1: Number(row.y1),
    x2: Number(row.x2),
    y2: Number(row.y2),
    createdAt: row.created_at
  };
}

async function worldFor(db, worldId, userId) {
  const result = await db.execute({
    sql:`SELECT id, owner_id, privacy
         FROM worlds
         WHERE id = ? AND (owner_id = ? OR privacy = 'public')
         LIMIT 1`,
    args:[worldId, userId]
  });
  return result.rows[0] || null;
}

module.exports = async function handler(req, res) {
  const userId = getSessionUserId(req);
  if (!userId) return res.status(401).json({ error:'Authentication required.' });

  const worldId = typeof req.query?.worldId === 'string' ? req.query.worldId : null;
  if (!worldId) return res.status(400).json({ error:'World id is required.' });

  try {
    const db = await initDb();
    const world = await worldFor(db, worldId, userId);
    if (!world) return res.status(404).json({ error:'World not found or inaccessible.' });

    if (req.method === 'GET') {
      const result = await db.execute({
        sql:`SELECT id, world_id, owner_id, x1, y1, x2, y2, created_at
             FROM world_locks WHERE world_id = ?
             ORDER BY created_at ASC`,
        args:[worldId]
      });
      return res.status(200).json({
        locks: result.rows.map(clean),
        canManage: world.owner_id === userId
      });
    }

    if (req.method === 'POST') {
      if (world.owner_id !== userId) return res.status(403).json({ error:'Only the world owner can create locks.' });
      const body = req.body || {};
      let x1 = Math.trunc(Number(body.x1));
      let y1 = Math.trunc(Number(body.y1));
      let x2 = Math.trunc(Number(body.x2));
      let y2 = Math.trunc(Number(body.y2));
      if (![x1,y1,x2,y2].every(Number.isFinite)) return res.status(400).json({ error:'Invalid lock coordinates.' });

      x1 = Math.max(-64, Math.min(64, Math.min(x1,x2)));
      x2 = Math.max(-64, Math.min(64, Math.max(x1,x2)));
      y1 = Math.max(0, Math.min(64, Math.min(y1,y2)));
      y2 = Math.max(0, Math.min(64, Math.max(y1,y2)));

      const width = x2-x1+1;
      const height = y2-y1+1;
      if (width > 16 || height > 16 || width*height > 192) {
        return res.status(400).json({ error:'Lock area is too large. Maximum is 16×16 tiles and 192 tiles total.' });
      }

      const conflict = await db.execute({
        sql:`SELECT id FROM world_locks
             WHERE world_id = ?
               AND NOT (? < x1 OR ? > x2 OR ? < y1 OR ? > y2)
             LIMIT 1`,
        args:[worldId, x2, x1, y2, y1]
      });
      if (conflict.rows[0]) return res.status(409).json({ error:'This area overlaps an existing world lock.' });

      const lock = {
        id: randomUUID(), worldId, ownerId:userId,
        x1,y1,x2,y2
      };
      await db.execute({
        sql:`INSERT INTO world_locks (id, world_id, owner_id, x1, y1, x2, y2)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args:[lock.id,worldId,userId,x1,y1,x2,y2]
      });
      return res.status(201).json({ lock });
    }

    if (req.method === 'DELETE') {
      const id = typeof req.query?.id === 'string' ? req.query.id : null;
      if (!id) return res.status(400).json({ error:'Lock id is required.' });
      const existing = await db.execute({
        sql:'SELECT id, owner_id FROM world_locks WHERE id = ? AND world_id = ? LIMIT 1',
        args:[id,worldId]
      });
      if (!existing.rows[0]) return res.status(404).json({ error:'Lock not found.' });
      if (existing.rows[0].owner_id !== userId && world.owner_id !== userId) {
        return res.status(403).json({ error:'You do not own this lock.' });
      }
      await db.execute({ sql:'DELETE FROM world_locks WHERE id = ?', args:[id] });
      return res.status(200).json({ deleted:true });
    }

    return res.status(405).json({ error:'Method not allowed.' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error:'Unable to access world locks.' });
  }
};
