const { initDb } = require('./_lib/db');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ ok:false, error:'Method not allowed' });
  try {
    const db = await initDb();
    await db.execute({ sql:'SELECT 1 AS ok' });
    return res.status(200).json({
      ok: true,
      service: 'vexora',
      runtime: process.version,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Health check failed:', error);
    return res.status(503).json({ ok:false, error:'Database unavailable.' });
  }
};
