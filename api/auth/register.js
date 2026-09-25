const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { initDb } = require('../_lib/db');
const { makeSession, sessionCookie } = require('../_lib/auth');

function json(data, status = 200, headers = {}) {
  return { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers }, body: JSON.stringify(data) };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const username = String(body.username || '').trim().toLowerCase();
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const displayName = String(body.displayName || username).trim().slice(0, 40);

    if (!/^[a-z0-9_]{3,20}$/.test(username)) {
      return res.status(400).json({ error: 'Username must be 3–20 characters using letters, numbers, or underscore.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Enter a valid email address.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }

    const db = await initDb();
    const existing = await db.execute({
      sql: 'SELECT id FROM users WHERE username = ? OR email = ? LIMIT 1',
      args: [username, email]
    });
    if (existing.rows.length) return res.status(409).json({ error: 'Username or email is already registered.' });

    const passwordHash = await bcrypt.hash(password, 12);
    const id = crypto.randomUUID();
    await db.execute({
      sql: 'INSERT INTO users (id, username, email, password_hash, display_name) VALUES (?, ?, ?, ?, ?)',
      args: [id, username, email, passwordHash, displayName || username]
    });

    const token = makeSession(id);
    return res.status(201).setHeader('Set-Cookie', sessionCookie(token)).json({
      ok: true,
      user: { id, username, email, displayName: displayName || username }
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Registration failed. Check the Vercel/Turso configuration.' });
  }
};
