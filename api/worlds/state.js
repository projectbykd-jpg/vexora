const { initDb } = require('../_lib/db');
const { getSessionUserId } = require('../_lib/auth');

module.exports = async function handler(req, res) {
  const userId = getSessionUserId(req);
  if (!userId) return res.status(401).json({ error: 'Authentication required.' });

  try {
    const db = await initDb();
    const worldId = typeof req.query?.id === 'string' ? req.query.id : null;
    if (!worldId) return res.status(400).json({ error: 'World id is required.' });

    const owned = await db.execute({ sql: 'SELECT id FROM worlds WHERE id = ? AND owner_id = ? LIMIT 1', args: [worldId, userId] });
    if (!owned.rows[0]) return res.status(404).json({ error: 'World not found.' });

    if (req.method === 'GET') {
      const result = await db.execute({ sql: 'SELECT x, y, z, type FROM world_blocks WHERE world_id = ? ORDER BY y, x, z', args: [worldId] });
      return res.status(200).json({ blocks: result.rows });
    }

    if (req.method === 'PUT') {
      const incoming = Array.isArray(req.body?.blocks) ? req.body.blocks : [];
      if (incoming.length > 12000) return res.status(413).json({ error: 'World is too large to save. Keep the prototype world within 12,000 blocks.' });
      const clean=[],seen=new Set();
      for (const block of incoming) {
        const x=Number(block.x),y=Number(block.y),z=Number(block.z),type=String(block.type||'grass');
        if(!Number.isInteger(x)||!Number.isInteger(y)||!Number.isInteger(z))continue;
        if(Math.abs(x)>64||y<0||y>64||Math.abs(z)>64)continue;
        if(!['grass','dirt','stone','crystal','wood','leaf','gold','sand','glass','brick'].includes(type))continue;
        const id=`${x},${y},${z}`;if(seen.has(id))continue;seen.add(id);clean.push([worldId,x,y,z,type]);
      }
      await db.batch(['DELETE FROM world_blocks WHERE world_id = ?',...clean.map(([wid,x,y,z,type])=>({sql:'INSERT INTO world_blocks (world_id, x, y, z, type) VALUES (?, ?, ?, ?, ?)',args:[wid,x,y,z,type]})),{sql:"UPDATE worlds SET updated_at = datetime('now') WHERE id = ?",args:[worldId]}]);
      return res.status(200).json({ saved: clean.length });
    }
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) { console.error(error); return res.status(500).json({ error: 'Unable to save VEXORA world.' }); }
};
