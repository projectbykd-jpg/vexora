const { initDb } = require('./_lib/db');
const { getSessionUserId } = require('./_lib/auth');
const { ITEMS, STARTER_INVENTORY, getItem } = require('../data/items');

module.exports = async function handler(req, res) {
  const userId = getSessionUserId(req);
  if (!userId) return res.status(401).json({ error:'Authentication required.' });

  try {
    const db = await initDb();

    if (req.method === 'GET') {
      await db.batch([
        ...Object.entries(STARTER_INVENTORY).map(([itemId, quantity]) => ({
          sql:`INSERT OR IGNORE INTO player_inventory (user_id, item_id, quantity) VALUES (?, ?, ?)`,
          args:[userId, itemId, quantity]
        })),
        { sql:`INSERT OR IGNORE INTO player_wallets (user_id) VALUES (?)`, args:[userId] }
      ], 'write');

      const [items, wallet] = await Promise.all([
        db.execute({
          sql:`SELECT item_id, quantity, updated_at
               FROM player_inventory
               WHERE user_id = ? AND quantity > 0
               ORDER BY item_id`,
          args:[userId]
        }),
        db.execute({
          sql:`SELECT gems, world_coins, event_tokens
               FROM player_wallets WHERE user_id = ? LIMIT 1`,
          args:[userId]
        })
      ]);

      return res.status(200).json({
        items: items.rows.map(row => ({
          id: row.item_id,
          quantity: Number(row.quantity),
          definition: ITEMS[row.item_id] || { id:row.item_id, name:row.item_id }
        })),
        wallet: wallet.rows[0] || { gems:0, world_coins:0, event_tokens:0 }
      });
    }

    return res.status(405).json({ error:'Method not allowed.' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error:'Unable to access inventory.' });
  }
};
