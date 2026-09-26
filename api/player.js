const { initDb } = require('./_lib/db');
const { getSessionUserId } = require('./_lib/auth');
const { STARTER_INVENTORY } = require('../data/items');

function clean(row) {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    email: row.email,
    avatarUrl: row.avatar_url || null,
    level: Number(row.level || 1),
    xp: Number(row.xp || 0),
    totalXp: Number(row.total_xp || 0),
    gems: Number(row.gems || 0),
    worldCoins: Number(row.world_coins || 0),
    eventTokens: Number(row.event_tokens || 0),
    createdAt: row.created_at
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error:'Method not allowed.' });
  const userId = getSessionUserId(req);
  if (!userId) return res.status(401).json({ error:'Authentication required.' });

  try {
    const db = await initDb();

    await db.batch([
      {
        sql:`INSERT OR IGNORE INTO player_wallets (user_id) VALUES (?)`,
        args:[userId]
      },
      {
        sql:`INSERT OR IGNORE INTO player_progress (user_id) VALUES (?)`,
        args:[userId]
      },
      ...Object.entries(STARTER_INVENTORY).map(([itemId, quantity]) => ({
        sql:`INSERT OR IGNORE INTO player_inventory (user_id, item_id, quantity) VALUES (?, ?, ?)`,
        args:[userId, itemId, quantity]
      }))
    ], 'write');

    const result = await db.execute({
      sql:`SELECT u.id, u.username, u.email, u.display_name, u.avatar_url, u.created_at,
                   p.level, p.xp, p.total_xp,
                   w.gems, w.world_coins, w.event_tokens
            FROM users u
            JOIN player_progress p ON p.user_id = u.id
            JOIN player_wallets w ON w.user_id = u.id
            WHERE u.id = ? LIMIT 1`,
      args:[userId]
    });

    if (!result.rows[0]) return res.status(404).json({ error:'Player not found.' });
    return res.status(200).json({ player:clean(result.rows[0]) });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error:'Unable to load player state.' });
  }
};
