const {randomUUID}=require('crypto');
const {initDb}=require('./_lib/db');
const {getSessionUserId}=require('./_lib/auth');
const ALLOWED=new Set(['sign','door','portal']);

async function world(db,id,uid,ownerOnly=false){
  const r=await db.execute({sql:'SELECT id,name,owner_id,privacy FROM worlds WHERE id=? LIMIT 1',args:[id]});
  if(!r.rows[0])return null;
  const w=r.rows[0];
  if(ownerOnly)return w.owner_id===uid?w:null;
  if(w.owner_id===uid||w.privacy==='public')return w;
  const p=await db.execute({sql:'SELECT 1 FROM world_permissions WHERE world_id=? AND user_id=? LIMIT 1',args:[id,uid]});
  return p.rows[0]?w:null;
}
function clean(row){let metadata={};try{metadata=JSON.parse(row.metadata_json||'{}')}catch{}return{id:row.id,x:Number(row.x),y:Number(row.y),type:row.type,label:row.label||'',linkWorldId:row.link_world_id||null,metadata,createdAt:row.created_at,updatedAt:row.updated_at}}
module.exports=async function(req,res){
 const uid=getSessionUserId(req);if(!uid)return res.status(401).json({error:'Authentication required.'});
 const worldId=String(req.query?.worldId||req.body?.worldId||'');if(!worldId)return res.status(400).json({error:'World id is required.'});
 try{
  const db=await initDb();const w=await world(db,worldId,uid,false);if(!w)return res.status(404).json({error:'World not found or inaccessible.'});
  if(req.method==='GET'){const r=await db.execute({sql:'SELECT * FROM world_objects WHERE world_id=? ORDER BY y,x',args:[worldId]});return res.status(200).json({objects:r.rows.map(clean),canManage:w.owner_id===uid});}
  if(w.owner_id!==uid)return res.status(403).json({error:'Only the world owner can manage world objects.'});
  if(req.method==='POST'){
    const action=String(req.body?.action||'create'),type=String(req.body?.type||'');
    const x=Math.trunc(Number(req.body?.x)),y=Math.trunc(Number(req.body?.y));
    if(!ALLOWED.has(type)||!Number.isInteger(x)||!Number.isInteger(y)||x<-64||x>64||y<1||y>64)return res.status(400).json({error:'Invalid object.'});
    if((await db.execute({sql:'SELECT 1 FROM world_objects WHERE world_id=? AND x=? AND y=? LIMIT 1',args:[worldId,x,y]})).rows[0])return res.status(409).json({error:'That tile already has an object.'});
    let linkWorldId=String(req.body?.linkWorldId||'')||null;
    if((type==='door'||type==='portal')&&linkWorldId){
      const target=await db.execute({sql:'SELECT id,owner_id,privacy FROM worlds WHERE id=? LIMIT 1',args:[linkWorldId]});
      if(!target.rows[0])return res.status(404).json({error:'Linked world not found.'});
      if(target.rows[0].privacy!=='public'&&target.rows[0].owner_id!==uid)return res.status(403).json({error:'Linked world must be public or owned by you.'});
    }else linkWorldId=null;
    const label=String(req.body?.label||type.toUpperCase()).trim().slice(0,48);
    const id=randomUUID();
    await db.execute({sql:'INSERT INTO world_objects(id,world_id,x,y,type,label,link_world_id,metadata_json,created_by) VALUES(?,?,?,?,?,?,?,?,?)',args:[id,worldId,x,y,type,label,linkWorldId,JSON.stringify(req.body?.metadata||{}),uid]});
    return res.status(201).json({object:{id,x,y,type,label,linkWorldId}});
  }
  if(req.method==='PATCH'){
    const id=String(req.body?.id||'');if(!id)return res.status(400).json({error:'Object id required.'});
    const current=await db.execute({sql:'SELECT * FROM world_objects WHERE id=? AND world_id=? LIMIT 1',args:[id,worldId]});if(!current.rows[0])return res.status(404).json({error:'Object not found.'});
    const label=String(req.body?.label??current.rows[0].label).trim().slice(0,48);
    const linkWorldId=String(req.body?.linkWorldId??current.rows[0].link_world_id)||null;
    if(linkWorldId){const target=await db.execute({sql:'SELECT id,owner_id,privacy FROM worlds WHERE id=? LIMIT 1',args:[linkWorldId]});if(!target.rows[0])return res.status(404).json({error:'Linked world not found.'});if(target.rows[0].privacy!=='public'&&target.rows[0].owner_id!==uid)return res.status(403).json({error:'Linked world must be public or owned by you.'});}
    await db.execute({sql:"UPDATE world_objects SET label=?,link_world_id=?,updated_at=datetime('now') WHERE id=? AND world_id=?",args:[label,linkWorldId,id,worldId]});
    return res.status(200).json({saved:true});
  }
  if(req.method==='DELETE'){
    const id=String(req.query?.id||req.body?.id||'');if(!id)return res.status(400).json({error:'Object id required.'});
    await db.execute({sql:'DELETE FROM world_objects WHERE id=? AND world_id=?',args:[id,worldId]});return res.status(200).json({deleted:true});
  }
  return res.status(405).json({error:'Method not allowed.'});
 }catch(e){console.error(e);return res.status(500).json({error:'Unable to access world objects.'})}
};