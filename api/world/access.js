const { initDb } = require('../_lib/db');
const { getSessionUserId } = require('../_lib/auth');

async function ownerWorld(db, worldId, userId) {
  const r = await db.execute({ sql:'SELECT id,owner_id,name FROM worlds WHERE id=? LIMIT 1', args:[worldId] });
  if (!r.rows[0]) return null;
  return r.rows[0].owner_id === userId ? r.rows[0] : null;
}

module.exports = async function(req,res){
  const userId = getSessionUserId(req);
  if (!userId) return res.status(401).json({error:'Authentication required.'});
  const worldId = String(req.query?.worldId || req.body?.worldId || '');
  if (!worldId) return res.status(400).json({error:'World id is required.'});
  try {
    const db = await initDb();
    if (req.method === 'GET') {
      const world = await db.execute({sql:'SELECT id,owner_id,name FROM worlds WHERE id=? LIMIT 1',args:[worldId]});
      if (!world.rows[0]) return res.status(404).json({error:'World not found.'});
      if (world.rows[0].owner_id !== userId) return res.status(403).json({error:'Only the world owner can manage access.'});
      const permissions = await db.execute({
        sql:\`SELECT p.world_id,p.user_id,p.role,p.can_build,p.can_break,u.username,u.display_name
              FROM world_permissions p JOIN users u ON u.id=p.user_id
              WHERE p.world_id=? ORDER BY u.username\`,
        args:[worldId]
      });
      const bans = await db.execute({
        sql:\`SELECT b.world_id,b.user_id,b.reason,b.created_at,u.username,u.display_name
              FROM world_bans b JOIN users u ON u.id=b.user_id
              WHERE b.world_id=? ORDER BY b.created_at DESC\`,
        args:[worldId]
      });
      return res.status(200).json({world:world.rows[0],permissions:permissions.rows,bans:bans.rows});
    }
    if (req.method !== 'POST' && req.method !== 'DELETE') return res.status(405).json({error:'Method not allowed.'});
    const world = await ownerWorld(db,worldId,userId);
    if (!world) return res.status(403).json({error:'Only the world owner can manage access.'});
    const action = String(req.body?.action || '');
    const username = String(req.body?.username || '').trim().toLowerCase();
    if (req.method === 'POST') {
      const target = await db.execute({sql:'SELECT id,username FROM users WHERE lower(username)=? LIMIT 1',args:[username]});
      if (!target.rows[0] || target.rows[0].id === userId) return res.status(400).json({error:'Choose another valid username.'});
      const tid = target.rows[0].id;
      if (action === 'grant') {
        const role = ['builder','trusted'].includes(String(req.body?.role)) ? String(req.body.role) : 'builder';
        const canBuild = Number(req.body?.canBuild) !== 0 ? 1 : 0;
        const canBreak = Number(req.body?.canBreak) !== 0 ? 1 : 0;
        await db.execute({
          sql:\`INSERT INTO world_permissions(world_id,user_id,role,can_build,can_break)
                VALUES(?,?,?,?,?) ON CONFLICT(world_id,user_id)
                DO UPDATE SET role=excluded.role,can_build=excluded.can_build,can_break=excluded.can_break\`,
          args:[worldId,tid,role,canBuild,canBreak]
        });
        await db.execute({sql:'DELETE FROM world_bans WHERE world_id=? AND user_id=?',args:[worldId,tid]});
        return res.status(200).json({saved:true});
      }
      if (action === 'ban') {
        await db.batch([
          {sql:'DELETE FROM world_permissions WHERE world_id=? AND user_id=?',args:[worldId,tid]},
          {sql:\`INSERT INTO world_bans(world_id,user_id,reason) VALUES(?,?,?)
                 ON CONFLICT(world_id,user_id) DO UPDATE SET reason=excluded.reason\`,
           args:[worldId,tid,String(req.body?.reason || 'Banned by world owner').slice(0,120)]}
        ],'write');
        return res.status(200).json({banned:true});
      }
      return res.status(400).json({error:'Unknown access action.'});
    }
    const tid = String(req.query?.userId || req.body?.userId || '');
    if (!tid) return res.status(400).json({error:'User id is required.'});
    await db.batch([
      {sql:'DELETE FROM world_permissions WHERE world_id=? AND user_id=?',args:[worldId,tid]},
      {sql:'DELETE FROM world_bans WHERE world_id=? AND user_id=?',args:[worldId,tid]}
    ],'write');
    return res.status(200).json({removed:true});
  } catch(e) {
    console.error(e);
    return res.status(500).json({error:'Unable to manage world access.'});
  }
};