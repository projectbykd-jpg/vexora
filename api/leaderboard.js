const {initDb}=require('./_lib/db');
const {getSessionUserId}=require('./_lib/auth');
module.exports=async function(req,res){
 const uid=getSessionUserId(req);if(!uid)return res.status(401).json({error:'Authentication required.'});
 try{
  const db=await initDb(),type=String(req.query?.type||'xp');
  const col=type==='level'?'p.level':type==='gems'?'w.gems':'p.total_xp';
  const order=type==='level'?'p.level DESC,p.total_xp DESC':type==='gems'?'w.gems DESC,p.total_xp DESC':'p.total_xp DESC';
  const r=await db.execute({sql:`SELECT u.id,u.username,u.display_name,p.level,p.total_xp,w.gems
    FROM users u JOIN player_progress p ON p.user_id=u.id JOIN player_wallets w ON w.user_id=u.id
    ORDER BY \${order} LIMIT 50`,args:[]});
  return res.status(200).json({type,players:r.rows.map((x,i)=>({rank:i+1,id:x.id,username:x.username,displayName:x.display_name,level:Number(x.level||1),totalXp:Number(x.total_xp||0),gems:Number(x.gems||0)}))});
 }catch(e){console.error(e);return res.status(500).json({error:'Unable to load leaderboard.'})}
};