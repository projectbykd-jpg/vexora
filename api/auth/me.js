const { initDb } = require('../_lib/db');
const { getSessionUserId } = require('../_lib/auth');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const userId = getSessionUserId(req);
    if (!userId) return res.status(401).json({ authenticated: false });
    const db = await initDb();
    const result = await db.execute({
      sql: 'SELECT id, username, email, display_name, created_at FROM users WHERE id = ? LIMIT 1',
      args: [userId]
    });
    const user = result.rows[0];
    if (!user) return res.status(401).json({ authenticated: false });
    return res.status(200).json({
      authenticated: true,
      user: { id: user.id, username: user.username, email: user.email, displayName: user.display_name, createdAt: user.created_at }
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Unable to load account.' });
  }
};
