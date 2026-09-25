const { initDb } = require('./_lib/db');
const { getSessionUserId } = require('./_lib/auth');

function clean(row) {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    displayName: row.display_name,
    createdAt: row.created_at,
    avatarUrl: row.avatar_url || null,
    totalPlaySeconds: Number(row.total_play_seconds || 0),
  };
}

module.exports = async function handler(req, res) {
  const userId = getSessionUserId(req);
  if (!userId) return res.status(401).json({ error: 'Authentication required.' });
  try {
    const db = await initDb();
    if (req.method === 'GET') {
      const result = await db.execute({
        sql: `SELECT id, username, email, display_name, created_at, avatar_url, total_play_seconds FROM users WHERE id = ? LIMIT 1`,
        args: [userId],
      });
      if (!result.rows[0]) return res.status(404).json({ error: 'Account not found.' });
      return res.status(200).json({ user: clean(result.rows[0]) });
    }

    if (req.method === 'PATCH') {
      const displayName = String(req.body?.displayName ?? '').trim().slice(0, 32);
      const avatarUrl = String(req.body?.avatarUrl ?? '').trim();
      if (displayName.length < 2) return res.status(400).json({ error: 'Display name must be at least 2 characters.' });
      if (avatarUrl && !/^https:\/\//i.test(avatarUrl) && !/^data:image\/(png|jpeg|jpg|webp);base64,/i.test(avatarUrl)) {
        return res.status(400).json({ error: 'Avatar must be an HTTPS image URL or a supported image upload.' });
      }
      if (avatarUrl.length > 350000) return res.status(413).json({ error: 'Avatar image is too large.' });
      await db.execute({ sql: `UPDATE users SET display_name = ?, avatar_url = ? WHERE id = ?`, args: [displayName, avatarUrl || null, userId] });
      const result = await db.execute({ sql: `SELECT id, username, email, display_name, created_at, avatar_url, total_play_seconds FROM users WHERE id = ? LIMIT 1`, args: [userId] });
      return res.status(200).json({ user: clean(result.rows[0]) });
    }

    return res.status(405).json({ error: 'Method not allowed.' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Unable to access profile.' });
  }
};
