const { initDb } = require('./_lib/db');
const { getSessionUserId } = require('./_lib/auth');

function userShape(row) {
  return { id: row.id, username: row.username, displayName: row.display_name, avatarUrl: row.avatar_url || null };
}

module.exports = async function handler(req, res) {
  const userId = getSessionUserId(req);
  if (!userId) return res.status(401).json({ error: 'Authentication required.' });
  try {
    const db = await initDb();

    if (req.method === 'GET') {
      const search = String(req.query?.search || '').trim().toLowerCase();
      if (search) {
        const result = await db.execute({
          sql: `SELECT id, username, display_name, avatar_url FROM users WHERE lower(username) LIKE ? AND id <> ? ORDER BY username ASC LIMIT 12`,
          args: [`%${search}%`, userId],
        });
        return res.status(200).json({ users: result.rows.map(userShape) });
      }

      const result = await db.execute({
        sql: `SELECT f.requester_id, f.addressee_id, f.status, f.created_at,
                     u.id, u.username, u.display_name, u.avatar_url
              FROM friendships f
              JOIN users u ON u.id = CASE WHEN f.requester_id = ? THEN f.addressee_id ELSE f.requester_id END
              WHERE (f.requester_id = ? OR f.addressee_id = ?)
              ORDER BY f.updated_at DESC`,
        args: [userId, userId, userId],
      });
      const friends = [], incoming = [], outgoing = [];
      for (const row of result.rows) {
        const item = { ...userShape(row), status: row.status };
        if (row.status === 'accepted') friends.push(item);
        else if (row.addressee_id === userId) incoming.push(item);
        else outgoing.push(item);
      }
      return res.status(200).json({ friends, incoming, outgoing });
    }

    if (req.method === 'POST') {
      const username = String(req.body?.username || '').trim().toLowerCase();
      if (!username) return res.status(400).json({ error: 'Enter a username.' });
      const target = await db.execute({ sql: `SELECT id, username FROM users WHERE lower(username) = ? LIMIT 1`, args: [username] });
      if (!target.rows[0]) return res.status(404).json({ error: 'Username not found.' });
      const targetId = target.rows[0].id;
      if (targetId === userId) return res.status(400).json({ error: 'You cannot add yourself.' });

      const existing = await db.execute({
        sql: `SELECT requester_id, addressee_id, status FROM friendships WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?) LIMIT 1`,
        args: [userId, targetId, targetId, userId],
      });
      if (existing.rows[0]) {
        const row = existing.rows[0];
        if (row.status === 'accepted') return res.status(409).json({ error: 'You are already friends.' });
        if (row.requester_id === targetId && row.addressee_id === userId) {
          await db.execute({ sql: `UPDATE friendships SET status = 'accepted', updated_at = datetime('now') WHERE requester_id = ? AND addressee_id = ?`, args: [targetId, userId] });
          return res.status(200).json({ status: 'accepted', message: 'Friend request accepted.' });
        }
        return res.status(409).json({ error: 'A friend request is already pending.' });
      }

      await db.execute({ sql: `INSERT INTO friendships (requester_id, addressee_id, status) VALUES (?, ?, 'pending')`, args: [userId, targetId] });
      return res.status(201).json({ status: 'pending', message: 'Friend request sent.' });
    }

    if (req.method === 'PUT') {
      const targetId = String(req.body?.userId || '');
      if (!targetId) return res.status(400).json({ error: 'Missing user.' });
      const action = String(req.body?.action || 'accept');
      if (action === 'accept') {
        const result = await db.execute({ sql: `UPDATE friendships SET status = 'accepted', updated_at = datetime('now') WHERE requester_id = ? AND addressee_id = ? AND status = 'pending'`, args: [targetId, userId] });
        if (!result.rowsAffected) return res.status(404).json({ error: 'Friend request not found.' });
        return res.status(200).json({ status: 'accepted' });
      }
      if (action === 'reject') {
        await db.execute({ sql: `DELETE FROM friendships WHERE requester_id = ? AND addressee_id = ? AND status = 'pending'`, args: [targetId, userId] });
        return res.status(200).json({ status: 'rejected' });
      }
      return res.status(400).json({ error: 'Unknown friend action.' });
    }

    if (req.method === 'DELETE') {
      const targetId = String(req.body?.userId || req.query?.userId || '');
      if (!targetId) return res.status(400).json({ error: 'Missing user.' });
      await db.execute({ sql: `DELETE FROM friendships WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)`, args: [userId, targetId, targetId, userId] });
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed.' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Unable to access friends.' });
  }
};
