const bcrypt = require('bcryptjs');
const { initDb } = require('../_lib/db');
const { makeSession, sessionCookie } = require('../_lib/auth');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const identity = String(body.identity || '').trim().toLowerCase();
    const password = String(body.password || '');
    if (!identity || !password) return res.status(400).json({ error: 'Enter your username/email and password.' });

    const db = await initDb();
    const result = await db.execute({
      sql: 'SELECT id, username, email, display_name, password_hash FROM users WHERE username = ? OR email = ? LIMIT 1',
      args: [identity, identity]
    });
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Incorrect username/email or password.' });
    }

    const token = makeSession(user.id);
    return res.status(200).setHeader('Set-Cookie', sessionCookie(token)).json({
      ok: true,
      user: { id: user.id, username: user.username, email: user.email, displayName: user.display_name }
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Login failed. Check the Render/Turso configuration.' });
  }
};
