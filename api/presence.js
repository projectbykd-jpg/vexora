const { initDb } = require('./_lib/db');
const { getSessionUserId } = require('./_lib/auth');

module.exports = async function handler(req, res) {
  const userId = getSessionUserId(req);
  if (!userId) return res.status(401).json({ error: 'Authentication required.' });

  try {
    const db = await initDb();
    const worldId = typeof req.query?.worldId === 'string' ? req.query.worldId : null;
    if (!worldId) return res.status(400).json({ error: 'World id is required.' });

    const access = await db.execute({
      sql: `SELECT id FROM worlds WHERE id = ? AND (owner_id = ? OR privacy = 'public') LIMIT 1`,
      args: [worldId, userId],
    });
    if (!access.rows[0]) return res.status(404).json({ error: 'World not found or it is private.' });

    if (req.method === 'GET') {
      await db.execute({ sql: "DELETE FROM world_presence WHERE updated_at < datetime('now','-30 seconds')", args: [] });
      const result = await db.execute({
        sql: `SELECT p.user_id, p.x, p.y, p.z, p.yaw, p.updated_at,
                     u.username, u.display_name
              FROM world_presence p
              JOIN users u ON u.id = p.user_id
              WHERE p.world_id = ? AND p.updated_at >= datetime('now','-15 seconds')
              ORDER BY p.updated_at DESC`,
        args: [worldId],
      });
      return res.status(200).json({ players: result.rows.map(row => ({
        userId: row.user_id, username: row.username, displayName: row.display_name,
        x: Number(row.x), y: Number(row.y), z: Number(row.z), yaw: Number(row.yaw), updatedAt: row.updated_at,
      })) });
    }

    if (req.method === 'POST') {
      const x = Number(req.body?.x), y = Number(req.body?.y), z = Number(req.body?.z), yaw = Number(req.body?.yaw || 0);
      const safe = value => Number.isFinite(value) ? Math.max(-64, Math.min(64, value)) : 0;
      await db.execute({
        sql: `INSERT INTO world_presence (world_id, user_id, x, y, z, yaw, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
              ON CONFLICT(world_id, user_id) DO UPDATE SET
                x = excluded.x, y = excluded.y, z = excluded.z, yaw = excluded.yaw, updated_at = datetime('now')`,
        args: [worldId, userId, safe(x), safe(y), safe(z), safe(yaw)],
      });
      return res.status(200).json({ ok: true });
    }

    if (req.method === 'DELETE') {
      await db.execute({ sql: 'DELETE FROM world_presence WHERE world_id = ? AND user_id = ?', args: [worldId, userId] });
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed.' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Unable to sync VEXORA players.' });
  }
};
