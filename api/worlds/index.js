const { randomUUID } = require('crypto');
const { initDb } = require('../_lib/db');
const { getSessionUserId } = require('../_lib/auth');
const { generateBlocks } = require('../_lib/worldgen');

function cleanWorld(row) {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    privacy: row.privacy,
    seed: row.seed,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ownerId: row.owner_id,
    ownerUsername: row.owner_username || null,
    ownerDisplayName: row.owner_display_name || null,
  };
}

module.exports = async function handler(req, res) {
  const userId = getSessionUserId(req);
  if (!userId) return res.status(401).json({ error: 'Authentication required.' });

  try {
    const db = await initDb();

    if (req.method === 'GET') {
      const id = typeof req.query?.id === 'string' ? req.query.id : null;

      if (id) {
        // A world is enterable by its owner or by any authenticated player when it is public.
        const result = await db.execute({
          sql: `SELECT w.id, w.name, w.type, w.privacy, w.seed, w.owner_id,
                       w.created_at, w.updated_at,
                       u.username AS owner_username,
                       u.display_name AS owner_display_name
                FROM worlds w
                JOIN users u ON u.id = w.owner_id
                WHERE w.id = ? AND (w.owner_id = ? OR w.privacy = 'public' OR EXISTS (SELECT 1 FROM world_permissions p WHERE p.world_id=w.id AND p.user_id=?))
                LIMIT 1`,
          args: [id, userId, userId],
        });
        if (!result.rows[0]) return res.status(404).json({ error: 'World not found or it is private.' });
        return res.status(200).json({ world: cleanWorld(result.rows[0]) });
      }

      // Dashboard shows the player's own worlds plus every public world.
      const result = await db.execute({
        sql: `SELECT w.id, w.name, w.type, w.privacy, w.seed, w.owner_id,
                     w.created_at, w.updated_at,
                     u.username AS owner_username,
                     u.display_name AS owner_display_name
              FROM worlds w
              JOIN users u ON u.id = w.owner_id
              WHERE w.owner_id = ? OR w.privacy = 'public' OR EXISTS (SELECT 1 FROM world_permissions p WHERE p.world_id=w.id AND p.user_id=?)
              ORDER BY CASE WHEN w.owner_id = ? THEN 0 ELSE 1 END,
                       w.updated_at DESC, w.created_at DESC`,
        args: [userId, userId, userId],
      });
      return res.status(200).json({ worlds: result.rows.map(cleanWorld) });
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const name = String(body.name || '').trim().replace(/\s+/g, ' ');
      const type = ['normal', 'creative', 'adventure'].includes(body.type) ? body.type : 'normal';
      const privacy = ['private', 'public'].includes(body.privacy) ? body.privacy : 'private';

      if (name.length < 3 || name.length > 24) {
        return res.status(400).json({ error: 'World name must be 3–24 characters.' });
      }

      const duplicate = await db.execute({
        sql: 'SELECT id FROM worlds WHERE owner_id = ? AND lower(name) = lower(?) LIMIT 1',
        args: [userId, name],
      });
      if (duplicate.rows[0]) return res.status(409).json({ error: 'You already have a world with that name.' });

      const world = {
        id: randomUUID(),
        ownerId: userId,
        name,
        type,
        privacy,
        seed: Math.floor(Math.random() * 2147483647),
      };

      const initialBlocks = generateBlocks(world.seed);
      await db.batch([
        {
          sql: `INSERT INTO worlds (id, owner_id, name, type, privacy, seed)
                VALUES (?, ?, ?, ?, ?, ?)`,
          args: [world.id, world.ownerId, world.name, world.type, world.privacy, world.seed],
        },
        ...initialBlocks.map((block) => ({
          sql: `INSERT INTO world_blocks (world_id, x, y, z, type) VALUES (?, ?, ?, ?, ?)`,
          args: [world.id, block.x, block.y, block.z, block.type],
        })),
        {
          sql: `INSERT OR IGNORE INTO world_settings (world_id, spawn_y)
                VALUES (?, ?)`,
          args: [world.id, 20]
        }
      ], 'write');

      return res.status(201).json({ world: cleanWorld({ ...world, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }) });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Unable to access VEXORA worlds.' });
  }
};
