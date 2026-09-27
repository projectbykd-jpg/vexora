const {initDb}=require('./_lib/db');
const {getSessionUserId}=require('./_lib/auth');
module.exports=async function(req,res){
 const uid=getSessionUserId(req);if(!uid)return res.status(401).json({error:'Authentication required.'});
 try{
  const db=await initDb();
  const row=await db.execute({sql:'SELECT streak,last_claim_date FROM daily_rewards WHERE user_id=? LIMIT 1',args:[uid]});
  const today=new Date().toISOString().slice(0,10);
  const state=row.rows[0]||{streak:0,last_claim_date:null};
  if(req.method==='GET'){
    const claimed=state.last_claim_date===today;
    return res.status(200).json({streak:Number(state.streak||0),lastClaimDate:state.last_claim_date||null,claimed,rewardCoins:100+(Number(state.streak||0)+1)*25,rewardGems:(Number(state.streak||0)+1)%7===0?3:0});
  }
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed.'});
  if(state.last_claim_date===today)return res.status(409).json({error:'Daily reward already claimed. Come back tomorrow.'});
  const yesterday=new Date(Date.now()-86400000).toISOString().slice(0,10);
  const streak=state.last_claim_date===yesterday?Number(state.streak||0)+1:1;
  const coins=100+streak*25,gems=streak%7===0?3:0;
  const tx=await db.transaction('write');
  try{
    await tx.execute({sql:'INSERT OR IGNORE INTO player_wallets(user_id) VALUES(?)',args:[uid]});
    await tx.execute({sql:'UPDATE player_wallets SET world_coins=world_coins+?, gems=gems+?,updated_at=datetime("now") WHERE user_id=?',args:[coins,gems,uid]});
    await tx.execute({sql:`INSERT INTO daily_rewards(user_id,streak,last_claim_date,updated_at) VALUES(?,?,?,datetime('now'))
      ON CONFLICT(user_id) DO UPDATE SET streak=excluded.streak,last_claim_date=excluded.last_claim_date,updated_at=datetime('now')`,args:[uid,streak,today]});
    await tx.execute({sql:'INSERT INTO audit_logs(user_id,action,payload_json) VALUES(?,?,?)',args:[uid,'daily.claim',JSON.stringify({streak,coins,gems})]});
    await tx.commit();return res.status(200).json({claimed:true,streak,coins,gems});
  }catch(e){try{await tx.rollback()}catch{}throw e}
 }catch(e){console.error(e);return res.status(500).json({error:'Unable to process daily reward.'})}
};