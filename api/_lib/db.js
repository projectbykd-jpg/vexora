const { createClient } = require('@libsql/client');

let client;

function getDb() {
  if (client) return client;
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!url || !authToken) {
    throw new Error('Turso is not configured. Add TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in Vercel.');
  }
  client = createClient({ url, authToken });
  return client;
}

async function initDb() {
  const db = getDb();
  await db.batch([
    `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS worlds (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'normal',
      privacy TEXT NOT NULL DEFAULT 'private',
      seed INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (owner_id) REFERENCES users(id)
    )`,
    `CREATE TABLE IF NOT EXISTS world_blocks (
      world_id TEXT NOT NULL,
      x INTEGER NOT NULL,
      y INTEGER NOT NULL,
      z INTEGER NOT NULL,
      type TEXT NOT NULL,
      PRIMARY KEY (world_id, x, y, z),
      FOREIGN KEY (world_id) REFERENCES worlds(id) ON DELETE CASCADE
    )`,
    `CREATE INDEX IF NOT EXISTS idx_worlds_owner ON worlds(owner_id)`,
    `CREATE INDEX IF NOT EXISTS idx_world_blocks_world ON world_blocks(world_id)`,
  ]);
  return db;
}

module.exports = { getDb, initDb };
