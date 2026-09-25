const { initDb } = require('./_lib/db');
const { getSessionUserId } = require('./_lib/auth');

module.exports = async function handler(req, res) {
  const userId = getSessionUserId(req);
  if (!userId) return res.status(401).json({ error: 'Authentication required.' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  try {
    const seconds = Math.max(0, Math.min(120, Math.floor(Number(req.body?.seconds || 0))));
    if (!seconds) return res.status(200).json({ ok: true });
    const db = await initDb();
    await db.execute({ sql: `UPDATE users SET total_play_seconds = COALESCE(total_play_seconds, 0) + ? WHERE id = ?`, args: [seconds, userId] });
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Unable to record playtime.' });
  }
};
