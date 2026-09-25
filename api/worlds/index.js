const { randomUUID } = require('crypto');
const { initDb } = require('../_lib/db');
const { getSessionUserId } = require('../_lib/auth');

function cleanWorld(row) {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    privacy: row.privacy,
    seed: row.seed,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
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
        const result = await db.execute({
          sql: `SELECT id, name, type, privacy, seed, created_at, updated_at
                FROM worlds WHERE id = ? AND owner_id = ? LIMIT 1`,
          args: [id, userId],
        });
        if (!result.rows[0]) return res.status(404).json({ error: 'World not found.' });
        return res.status(200).json({ world: cleanWorld(result.rows[0]) });
      }

      const result = await db.execute({
        sql: `SELECT id, name, type, privacy, seed, created_at, updated_at
              FROM worlds WHERE owner_id = ? ORDER BY updated_at DESC, created_at DESC`,
        args: [userId],
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

      await db.execute({
        sql: `INSERT INTO worlds (id, owner_id, name, type, privacy, seed)
              VALUES (?, ?, ?, ?, ?, ?)`,
        args: [world.id, world.ownerId, world.name, world.type, world.privacy, world.seed],
      });

      return res.status(201).json({ world: cleanWorld({ ...world, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }) });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Unable to access VEXORA worlds.' });
  }
};
