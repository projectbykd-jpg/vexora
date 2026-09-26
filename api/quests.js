const { initDb } = require('./_lib/db');
const { getSessionUserId } = require('./_lib/auth');

const QUESTS = {
  first_build:{name:'First Builder',description:'Place 10 blocks.',goal:10,xp:50,rewardCoins:25,type:'placed'},
  miner:{name:'Stone Miner',description:'Break 20 blocks.',goal:20,xp:75,rewardCoins:40,type:'broken'},
  farmer:{name:'Green Thumb',description:'Harvest 3 crops.',goal:3,xp:80,rewardCoins:50,type:'harvest'},
  social:{name:'Explorer Social',description:'Send 5 chat messages.',goal:5,xp:60,rewardCoins:30,type:'chat'}
};
function progressFor(rows,type){return rows.filter(r=>String(r.action||'').includes(type)).reduce((n,r)=>n+1,0);}
module.exports=async function(req,res){
 const userId=getSessionUserId(req); if(!userId)return res.status(401).json({error:'Authentication required.'});
 try{
  const db=await initDb();
  if(req.method==='GET'){
   const logs=await db.execute({sql:'SELECT action FROM audit_logs WHERE user_id=? ORDER BY id DESC LIMIT 5000',args:[userId]});
   const result=[];
   for(const [id,q] of Object.entries(QUESTS)){
    const row=await db.execute({sql:'SELECT progress,status,completed_at FROM quests WHERE user_id=? AND quest_id=? LIMIT 1',args:[userId,id]});
    const saved=row.rows[0];
    const current=Math.min(q.goal,progressFor(logs.rows,q.type));
    const progress=Math.max(Number(saved?.progress||0),current);
    const status=saved?.status==='claimed'?'claimed':progress>=q.goal?'complete':'active';
    if(!saved) await db.execute({sql:'INSERT OR IGNORE INTO quests(user_id,quest_id,progress,status) VALUES(?,?,?,?)',args:[userId,id,progress,status]});
    else if(status!==saved.status||progress!==Number(saved.progress)) await db.execute({sql:'UPDATE quests SET progress=?,status=?,updated_at=datetime(\'now\') WHERE user_id=? AND quest_id=?',args:[progress,status,userId,id]});
    result.push({id,...q,progress,status});
   }
   return res.status(200).json({quests:result});
  }
  if(req.method==='POST'){
   const id=String(req.body?.questId||''),q=QUESTS[id]; if(!q)return res.status(404).json({error:'Quest not found.'});
   const row=await db.execute({sql:'SELECT progress,status FROM quests WHERE user_id=? AND quest_id=? LIMIT 1',args:[userId,id]});
   if(!row.rows[0]||row.rows[0].status!=='complete')return res.status(409).json({error:'Quest is not ready to claim.'});
   const tx=await db.transaction('write');
   try{
    const claimed = await tx.execute({sql:'UPDATE quests SET status=\'claimed\',completed_at=datetime(\'now\'),updated_at=datetime(\'now\') WHERE user_id=? AND quest_id=? AND status=\'complete\'',args:[userId,id]});
    if (Number(claimed.rowsAffected || 0) !== 1) { await tx.rollback(); return res.status(409).json({ error:'Quest reward was already claimed.' }); }
    await tx.execute({sql:'INSERT OR IGNORE INTO player_wallets(user_id) VALUES(?)',args:[userId]});
    await tx.execute({sql:'UPDATE player_wallets SET world_coins=world_coins+?,updated_at=datetime(\'now\') WHERE user_id=?',args:[q.rewardCoins,userId]});
    await tx.execute({sql:'INSERT OR IGNORE INTO player_progress(user_id) VALUES(?)',args:[userId]});
    await tx.execute({sql:'UPDATE player_progress SET xp=xp+?,total_xp=total_xp+?,updated_at=datetime(\'now\') WHERE user_id=?',args:[q.xp,q.xp,userId]});
    await tx.execute({sql:'INSERT INTO audit_logs(user_id,action,payload_json) VALUES(?,?,?)',args:[userId,'quest.claim',JSON.stringify({questId:id})]});
    await tx.commit(); return res.status(200).json({claimed:true,rewardCoins:q.rewardCoins,xp:q.xp});
   }catch(e){try{await tx.rollback();}catch{}throw e;}
  }
  return res.status(405).json({error:'Method not allowed.'});
 }catch(e){console.error(e);return res.status(500).json({error:'Unable to access quests.'});}
};