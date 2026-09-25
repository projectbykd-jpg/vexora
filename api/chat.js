const { initDb } = require('./_lib/db');
const { getSessionUserId } = require('./_lib/auth');

function clean(row) {
  return {
    id: row.id,
    worldId: row.world_id || null,
    username: row.username,
    displayName: row.display_name,
    message: row.message,
    createdAt: row.created_at,
  };
}

async function canEnter(db, worldId, userId) {
  if (!worldId) return true;
  const result = await db.execute({
    sql: `SELECT id FROM worlds WHERE id = ? AND (owner_id = ? OR privacy = 'public') LIMIT 1`,
    args: [worldId, userId],
  });
  return !!result.rows[0];
}

module.exports = async function handler(req, res) {
  const userId = getSessionUserId(req);
  if (!userId) return res.status(401).json({ error: 'Authentication required.' });

  try {
    const db = await initDb();
    const worldId = typeof req.query?.worldId === 'string' && req.query.worldId ? req.query.worldId : null;
    if (!(await canEnter(db, worldId, userId))) return res.status(404).json({ error: 'World not found or it is private.' });

    if (req.method === 'GET') {
      const after = Number(req.query?.after || 0);
      const result = await db.execute({
        sql: `SELECT c.id, c.world_id, c.message, c.created_at,
                     u.username, u.display_name
              FROM chat_messages c
              JOIN users u ON u.id = c.user_id
              WHERE ${worldId ? 'c.world_id = ?' : 'c.world_id IS NULL'}
                AND c.id > ?
              ORDER BY c.id ASC
              LIMIT 80`,
        args: worldId ? [worldId, Number.isFinite(after) ? after : 0] : [Number.isFinite(after) ? after : 0],
      });
      return res.status(200).json({ messages: result.rows.map(clean) });
    }

    if (req.method === 'POST') {
      const message = String(req.body?.message || '').replace(/\s+/g, ' ').trim();
      if (!message) return res.status(400).json({ error: 'Message cannot be empty.' });
      if (message.length > 240) return res.status(400).json({ error: 'Message is too long (max 240 characters).' });
      const result = await db.execute({
        sql: `INSERT INTO chat_messages (world_id, user_id, message) VALUES (?, ?, ?) RETURNING id, world_id, message, created_at`,
        args: [worldId, userId, message],
      });
      const row = result.rows[0];
      const user = await db.execute({ sql: 'SELECT username, display_name FROM users WHERE id = ? LIMIT 1', args: [userId] });
      return res.status(201).json({ message: clean({ ...row, username: user.rows[0]?.username || 'Explorer', display_name: user.rows[0]?.display_name || 'Explorer' }) });
    }

    return res.status(405).json({ error: 'Method not allowed.' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Unable to access VEXORA chat.' });
  }
};
