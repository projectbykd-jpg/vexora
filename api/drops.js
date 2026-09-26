const { randomUUID } = require('crypto');
const { initDb } = require('./_lib/db');
const { getSessionUserId } = require('./_lib/auth');
const { getItem } = require('../data/items');
const MAX_RANGE = 7;

async function worldAccess(db,worldId,userId) {
  const r = await db.execute({
    sql:'SELECT id,owner_id,privacy FROM worlds WHERE id=? AND (owner_id=? OR privacy="public" OR EXISTS (SELECT 1 FROM world_permissions p WHERE p.world_id=worlds.id AND p.user_id=?)) AND NOT EXISTS (SELECT 1 FROM world_bans b WHERE b.world_id=worlds.id AND b.user_id=?) LIMIT 1',
    args:[worldId,userId,userId,userId]
  });
  return r.rows[0] || null;
}

module.exports = async function(req,res){
  const uid = getSessionUserId(req);
  if (!uid) return res.status(401).json({error:'Authentication required.'});
  const worldId = String(req.query?.worldId || req.body?.worldId || '');
  if (!worldId) return res.status(400).json({error:'World id is required.'});
  try {
    const db = await initDb();
    if (!await worldAccess(db,worldId,uid)) return res.status(404).json({error:'World not found or inaccessible.'});

    if (req.method === 'GET') {
      const r = await db.execute({
        sql:'SELECT id,x,y,z,item_id,quantity,created_at FROM dropped_items WHERE world_id=? ORDER BY created_at ASC LIMIT 120',
        args:[worldId]
      });
      return res.status(200).json({drops:r.rows.map(x=>({...x,x:Number(x.x),y:Number(x.y),z:Number(x.z),quantity:Number(x.quantity)}))});
    }

    const action = String(req.body?.action || '');
    if (action === 'drop') {
      const itemId = String(req.body?.itemId || '');
      const qty = Math.trunc(Number(req.body?.quantity || 1));
      const x = Number(req.body?.x), y = Number(req.body?.y);
      const def = getItem(itemId);
      if (!def || def.type === 'currency' || !Number.isInteger(qty) || qty < 1 || qty > 200) return res.status(400).json({error:'Invalid drop.'});
      if (!Number.isFinite(x) || !Number.isFinite(y)) return res.status(400).json({error:'Invalid drop position.'});
      const have = await db.execute({sql:'SELECT quantity FROM player_inventory WHERE user_id=? AND item_id=? LIMIT 1',args:[uid,itemId]});
      if (!have.rows[0] || Number(have.rows[0].quantity) < qty) return res.status(400).json({error:'Not enough items.'});
      const tx = await db.transaction('write');
      try {
        const removed = await tx.execute({
          sql:'UPDATE player_inventory SET quantity=quantity-?,updated_at=datetime("now") WHERE user_id=? AND item_id=? AND quantity>=?',
          args:[qty,uid,itemId,qty]
        });
        if (Number(removed.rowsAffected || 0) !== 1) { await tx.rollback(); return res.status(409).json({error:'Item changed.'}); }
        const id = randomUUID();
        await tx.execute({sql:'INSERT INTO dropped_items(id,world_id,x,y,z,item_id,quantity) VALUES(?,?,?,?,?,?,?)',args:[id,worldId,x,y,0,itemId,qty]});
        await tx.commit();
        return res.status(201).json({id});
      } catch(e) { try{await tx.rollback();}catch{} throw e; }
    }

    if (action === 'pickup') {
      const id = String(req.body?.id || '');
      if (!id) return res.status(400).json({error:'Drop id required.'});
      const drop = await db.execute({sql:'SELECT * FROM dropped_items WHERE id=? AND world_id=? LIMIT 1',args:[id,worldId]});
      if (!drop.rows[0]) return res.status(404).json({error:'Drop is gone.'});
      const d = drop.rows[0];
      const px = Number(req.body?.playerX), py = Number(req.body?.playerY);
      if (Number.isFinite(px) && Number.isFinite(py) && Math.hypot(px-Number(d.x),py-Number(d.y)) > MAX_RANGE) return res.status(400).json({error:'Move closer to pick it up.'});
      const tx = await db.transaction('write');
      try {
        const removed = await tx.execute({sql:'DELETE FROM dropped_items WHERE id=? AND world_id=?',args:[id,worldId]});
        if (Number(removed.rowsAffected || 0) !== 1) { await tx.rollback(); return res.status(409).json({error:'Drop was picked up by another player.'}); }
        await tx.execute({
          sql:\`INSERT INTO player_inventory(user_id,item_id,quantity) VALUES(?,?,?)
               ON CONFLICT(user_id,item_id) DO UPDATE SET quantity=quantity+excluded.quantity,updated_at=datetime('now')\`,
          args:[uid,d.item_id,Number(d.quantity)]
        });
        await tx.commit();
        return res.status(200).json({picked:true,itemId:d.item_id,quantity:Number(d.quantity)});
      } catch(e) { try{await tx.rollback();}catch{} throw e; }
    }

    return res.status(400).json({error:'Unknown drop action.'});
  } catch(e) {
    console.error(e);
    return res.status(500).json({error:'Unable to process dropped item.'});
  }
};