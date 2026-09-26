const { randomUUID } = require('crypto');
const { initDb } = require('./_lib/db');
const { getSessionUserId } = require('./_lib/auth');
const { getItem } = require('../data/items');

const MAX_ITEMS = 20;

function cleanPayload(payload) {
  const body = payload && typeof payload === 'object' ? payload : {};
  const merged = new Map();
  for (const raw of Array.isArray(body.items) ? body.items : []) {
    const itemId = String(raw?.itemId || '');
    const quantity = Math.trunc(Number(raw?.quantity));
    const def = getItem(itemId);
    if (!def || !def.tradeable || quantity < 1) continue;
    merged.set(itemId, (merged.get(itemId) || 0) + quantity);
  }
  return {
    items: Array.from(merged, ([itemId, quantity]) => ({ itemId, quantity })).slice(0, MAX_ITEMS),
    gems: Math.max(0, Math.trunc(Number(body.gems) || 0)),
    worldCoins: Math.max(0, Math.trunc(Number(body.worldCoins) || 0))
  };
}

function parsePayload(value) {
  try { return cleanPayload(JSON.parse(value || '{}')); } catch { return cleanPayload({}); }
}

function cleanTrade(row) {
  return {
    id: row.id,
    status: row.status,
    initiator: {
      id: row.initiator_id,
      username: row.initiator_username,
      displayName: row.initiator_display_name
    },
    recipient: {
      id: row.recipient_id,
      username: row.recipient_username,
      displayName: row.recipient_display_name
    },
    initiatorOffer: parsePayload(row.initiator_payload),
    recipientOffer: parsePayload(row.recipient_payload),
    initiatorConfirmed: Number(row.initiator_confirmed) === 1,
    recipientConfirmed: Number(row.recipient_confirmed) === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function findTrade(db, id, userId) {
  const result = await db.execute({
    sql: `SELECT t.id,t.status,t.initiator_id,t.recipient_id,t.initiator_payload,t.recipient_payload,
                  t.initiator_confirmed,t.recipient_confirmed,t.created_at,t.updated_at,
                  iu.username AS initiator_username, iu.display_name AS initiator_display_name,
                  ru.username AS recipient_username, ru.display_name AS recipient_display_name
           FROM trades t
           JOIN users iu ON iu.id=t.initiator_id
           JOIN users ru ON ru.id=t.recipient_id
           WHERE t.id=? AND (t.initiator_id=? OR t.recipient_id=?)
           LIMIT 1`,
    args:[id,userId,userId]
  });
  return result.rows[0] || null;
}

async function findUser(db, value, userId) {
  const key=String(value||'');
  const result=await db.execute({
    sql:'SELECT id,username,display_name FROM users WHERE id=? OR lower(username)=lower(?) LIMIT 1',
    args:[key,key]
  });
  return result.rows[0] && result.rows[0].id !== userId ? result.rows[0] : null;
}

async function deductWallet(tx,userId,column,amount) {
  if (!amount) return true;
  const safe = column === 'gems' ? 'gems' : 'world_coins';
  const result=await tx.execute({
    sql:'UPDATE player_wallets SET '+safe+'='+safe+'-?, updated_at=datetime(\'now\') WHERE user_id=? AND '+safe+'>=?',
    args:[amount,userId,amount]
  });
  return Number(result.rowsAffected||0)===1;
}

async function addWallet(tx,userId,column,amount) {
  if (!amount) return;
  const safe = column === 'gems' ? 'gems' : 'world_coins';
  await tx.execute({sql:'INSERT OR IGNORE INTO player_wallets (user_id) VALUES (?)',args:[userId]});
  await tx.execute({
    sql:'UPDATE player_wallets SET '+safe+'='+safe+'+?, updated_at=datetime(\'now\') WHERE user_id=?',
    args:[amount,userId]
  });
}

async function transferItems(tx,fromUser,toUser,offer) {
  for (const item of offer.items) {
    const result=await tx.execute({
      sql:`UPDATE player_inventory
           SET quantity=quantity-?, updated_at=datetime('now')
           WHERE user_id=? AND item_id=? AND quantity>=?`,
      args:[item.quantity,fromUser,item.itemId,item.quantity]
    });
    if (Number(result.rowsAffected||0)!==1) return false;
    await tx.execute({
      sql:`INSERT INTO player_inventory (user_id,item_id,quantity)
           VALUES (?,?,?) ON CONFLICT(user_id,item_id)
           DO UPDATE SET quantity=quantity+excluded.quantity, updated_at=datetime('now')`,
      args:[toUser,item.itemId,item.quantity]
    });
  }
  return true;
}

async function finalizeTrade(db,trade) {
  const a=parsePayload(trade.initiator_payload);
  const b=parsePayload(trade.recipient_payload);
  const tx=await db.transaction('write');
  try {
    await tx.execute({sql:'INSERT OR IGNORE INTO player_wallets (user_id) VALUES (?)',args:[trade.initiator_id]});
    await tx.execute({sql:'INSERT OR IGNORE INTO player_wallets (user_id) VALUES (?)',args:[trade.recipient_id]});

    for (const entry of [
      ...a.items.map(x=>({userId:trade.initiator_id,...x})),
      ...b.items.map(x=>({userId:trade.recipient_id,...x}))
    ]) {
      const row=await tx.execute({
        sql:'SELECT quantity FROM player_inventory WHERE user_id=? AND item_id=? LIMIT 1',
        args:[entry.userId,entry.itemId]
      });
      if (!row.rows[0] || Number(row.rows[0].quantity)<entry.quantity) {
        await tx.rollback();
        return {ok:false,error:'Trade failed: an offered item is no longer available.'};
      }
    }

    if (!(await deductWallet(tx,trade.initiator_id,'gems',a.gems))) {
      await tx.rollback(); return {ok:false,error:'Initiator does not have enough gems.'};
    }
    if (!(await deductWallet(tx,trade.initiator_id,'worldCoins',a.worldCoins))) {
      await tx.rollback(); return {ok:false,error:'Initiator does not have enough VEXORA coins.'};
    }
    if (!(await deductWallet(tx,trade.recipient_id,'gems',b.gems))) {
      await tx.rollback(); return {ok:false,error:'Recipient does not have enough gems.'};
    }
    if (!(await deductWallet(tx,trade.recipient_id,'worldCoins',b.worldCoins))) {
      await tx.rollback(); return {ok:false,error:'Recipient does not have enough VEXORA coins.'};
    }

    if (!(await transferItems(tx,trade.initiator_id,trade.recipient_id,a))) {
      await tx.rollback(); return {ok:false,error:'Trade failed while moving initiator items.'};
    }
    if (!(await transferItems(tx,trade.recipient_id,trade.initiator_id,b))) {
      await tx.rollback(); return {ok:false,error:'Trade failed while moving recipient items.'};
    }

    await addWallet(tx,trade.recipient_id,'gems',a.gems);
    await addWallet(tx,trade.recipient_id,'worldCoins',a.worldCoins);
    await addWallet(tx,trade.initiator_id,'gems',b.gems);
    await addWallet(tx,trade.initiator_id,'worldCoins',b.worldCoins);

    await tx.execute({
      sql:"UPDATE trades SET status='completed',updated_at=datetime('now') WHERE id=?",
      args:[trade.id]
    });
    await tx.execute({
      sql:'INSERT INTO audit_logs (user_id,action,payload_json) VALUES (?,?,?)',
      args:[trade.initiator_id,'trade.completed',JSON.stringify({tradeId:trade.id,recipientId:trade.recipient_id})]
    });
    await tx.execute({
      sql:'INSERT INTO audit_logs (user_id,action,payload_json) VALUES (?,?,?)',
      args:[trade.recipient_id,'trade.completed',JSON.stringify({tradeId:trade.id,initiatorId:trade.initiator_id})]
    });

    await tx.commit();
    return {ok:true};
  } catch (error) {
    try { await tx.rollback(); } catch {}
    throw error;
  }
}

module.exports=async function handler(req,res) {
  const userId=getSessionUserId(req);
  if (!userId) return res.status(401).json({error:'Authentication required.'});

  try {
    const db=await initDb();

    if (req.method==='GET') {
      const result=await db.execute({
        sql:`SELECT t.id,t.status,t.initiator_id,t.recipient_id,t.initiator_payload,t.recipient_payload,
                    t.initiator_confirmed,t.recipient_confirmed,t.created_at,t.updated_at,
                    iu.username AS initiator_username,iu.display_name AS initiator_display_name,
                    ru.username AS recipient_username,ru.display_name AS recipient_display_name
             FROM trades t
             JOIN users iu ON iu.id=t.initiator_id
             JOIN users ru ON ru.id=t.recipient_id
             WHERE (t.initiator_id=? OR t.recipient_id=?) AND t.status='open'
             ORDER BY t.updated_at DESC`,
        args:[userId,userId]
      });
      return res.status(200).json({trades:result.rows.map(cleanTrade)});
    }

    if (req.method==='POST') {
      const target=await findUser(db,req.body?.recipient,userId);
      if (!target) return res.status(404).json({error:'Recipient not found.'});
      const open=await db.execute({
        sql:`SELECT id FROM trades WHERE status='open'
             AND ((initiator_id=? AND recipient_id=?) OR (initiator_id=? AND recipient_id=?))
             LIMIT 1`,
        args:[userId,target.id,target.id,userId]
      });
      if (open.rows[0]) return res.status(409).json({error:'An open trade already exists with this player.'});

      await db.batch([
        {sql:'INSERT OR IGNORE INTO player_wallets (user_id) VALUES (?)',args:[userId]},
        {sql:'INSERT OR IGNORE INTO player_wallets (user_id) VALUES (?)',args:[target.id]},
        {sql:`INSERT INTO trades (id,initiator_id,recipient_id,status,initiator_payload,recipient_payload)
              VALUES (?,?,?,?,?,?)`,args:[randomUUID(),userId,target.id,'open','{}','{}']}
      ],'write');

      const latest=await db.execute({
        sql:'SELECT id FROM trades WHERE initiator_id=? AND recipient_id=? AND status=\'open\' ORDER BY created_at DESC LIMIT 1',
        args:[userId,target.id]
      });
      const trade=await findTrade(db,latest.rows[0].id,userId);
      return res.status(201).json({trade:cleanTrade(trade)});
    }

    if (req.method!=='PATCH') return res.status(405).json({error:'Method not allowed.'});

    const id=typeof req.query?.id==='string'?req.query.id:String(req.body?.id||'');
    if (!id) return res.status(400).json({error:'Trade id is required.'});

    let trade=await findTrade(db,id,userId);
    if (!trade) return res.status(404).json({error:'Trade not found.'});
    if (trade.status!=='open') return res.status(409).json({error:'Trade is no longer open.'});

    const action=String(req.body?.action||'');

    if (action==='cancel') {
      await db.execute({sql:"UPDATE trades SET status='cancelled',updated_at=datetime('now') WHERE id=? AND status='open'",args:[id]});
      return res.status(200).json({cancelled:true});
    }

    if (action==='offer') {
      const payload=cleanPayload(req.body?.offer);
      const column=trade.initiator_id===userId?'initiator_payload':'recipient_payload';
      await db.execute({
        sql:'UPDATE trades SET '+column+'=?,initiator_confirmed=0,recipient_confirmed=0,updated_at=datetime(\'now\') WHERE id=? AND status=\'open\'',
        args:[JSON.stringify(payload),id]
      });
      return res.status(200).json({trade:cleanTrade(await findTrade(db,id,userId))});
    }

    if (action==='confirm') {
      const column=trade.initiator_id===userId?'initiator_confirmed':'recipient_confirmed';
      await db.execute({
        sql:'UPDATE trades SET '+column+'=1,updated_at=datetime(\'now\') WHERE id=? AND status=\'open\'',
        args:[id]
      });
      trade=await findTrade(db,id,userId);
      if (Number(trade.initiator_confirmed)===1 && Number(trade.recipient_confirmed)===1) {
        const result=await finalizeTrade(db,trade);
        if (!result.ok) return res.status(409).json({error:result.error});
        return res.status(200).json({completed:true});
      }
      return res.status(200).json({trade:cleanTrade(trade)});
    }

    return res.status(400).json({error:'Unknown trade action.'});
  } catch(error) {
    console.error(error);
    return res.status(500).json({error:'Unable to process trade.'});
  }
};
