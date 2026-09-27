const { initDb } = require('../_lib/db');
const { getSessionUserId } = require('../_lib/auth');
const MODES = new Set(['day','sunset','night','space']);

module.exports = async function(req,res){
  const userId = getSessionUserId(req);
  if (!userId) return res.status(401).json({error:'Authentication required.'});
  const worldId = String(req.query?.worldId || req.body?.worldId || '');
  if (!worldId) return res.status(400).json({error:'World id is required.'});
  try {
    const db = await initDb();
    const w = await db.execute({sql:'SELECT id,name,type,privacy,owner_id FROM worlds WHERE id=? LIMIT 1',args:[worldId]});
    if (!w.rows[0]) return res.status(404).json({error:'World not found.'});
    const current = await db.execute({sql:'SELECT * FROM world_settings WHERE world_id=? LIMIT 1',args:[worldId]});
    const base = current.rows[0] || {world_id:worldId,description:'',max_players:20,min_level:1,spawn_x:0,spawn_y:20,background:'day'};
    if (req.method === 'GET') {
      if (w.rows[0].owner_id !== userId && w.rows[0].privacy !== 'public') return res.status(404).json({error:'World is private.'});
      return res.status(200).json({world:w.rows[0],settings:base,canManage:w.rows[0].owner_id===userId});
    }
    if (req.method !== 'PUT') return res.status(405).json({error:'Method not allowed.'});
    if (w.rows[0].owner_id !== userId) return res.status(403).json({error:'Only the world owner can edit settings.'});
    const description = String(req.body?.description || '').trim().slice(0,180);
    const maxPlayers = Math.max(2,Math.min(50,Math.trunc(Number(req.body?.maxPlayers || 20))));
    const minLevel = Math.max(1,Math.min(100,Math.trunc(Number(req.body?.minLevel || 1))));
    const spawnX = Math.max(-60,Math.min(60,Number(req.body?.spawnX ?? 0)));
    const spawnY = Math.max(1,Math.min(62,Number(req.body?.spawnY ?? 20)));
    const background = MODES.has(req.body?.background) ? req.body.background : 'day';
    await db.execute({
      sql:`INSERT INTO world_settings(world_id,description,max_players,min_level,spawn_x,spawn_y,background)
            VALUES(?,?,?,?,?,?,?) ON CONFLICT(world_id) DO UPDATE SET
            description=excluded.description,max_players=excluded.max_players,min_level=excluded.min_level,
            spawn_x=excluded.spawn_x,spawn_y=excluded.spawn_y,background=excluded.background`,
      args:[worldId,description,maxPlayers,minLevel,spawnX,spawnY,background]
    });
    return res.status(200).json({saved:true,settings:{world_id:worldId,description,max_players:maxPlayers,min_level:minLevel,spawn_x:spawnX,spawn_y:spawnY,background}});
  } catch(e) {
    console.error(e);
    return res.status(500).json({error:'Unable to access world settings.'});
  }
};