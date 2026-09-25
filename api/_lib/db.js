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
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      avatar_url TEXT,
      total_play_seconds INTEGER NOT NULL DEFAULT 0
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
    `CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      world_id TEXT NULL,
      user_id TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (world_id) REFERENCES worlds(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`,
    `CREATE TABLE IF NOT EXISTS world_presence (
      world_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      x REAL NOT NULL DEFAULT 0,
      y REAL NOT NULL DEFAULT 2,
      z REAL NOT NULL DEFAULT 0,
      yaw REAL NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (world_id, user_id),
      FOREIGN KEY (world_id) REFERENCES worlds(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`,
    `CREATE TABLE IF NOT EXISTS friendships (
      requester_id TEXT NOT NULL,
      addressee_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (requester_id, addressee_id),
      CHECK (requester_id <> addressee_id),
      FOREIGN KEY (requester_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (addressee_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
    `CREATE INDEX IF NOT EXISTS idx_worlds_owner ON worlds(owner_id)`,
    `CREATE INDEX IF NOT EXISTS idx_world_blocks_world ON world_blocks(world_id)`,
    `CREATE INDEX IF NOT EXISTS idx_chat_scope_time ON chat_messages(world_id, created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_presence_world_time ON world_presence(world_id, updated_at)`,
    `CREATE INDEX IF NOT EXISTS idx_friendships_requester ON friendships(requester_id, status)`,
    `CREATE INDEX IF NOT EXISTS idx_friendships_addressee ON friendships(addressee_id, status)`,
  ]);

  // Safe migrations for users created before profile features existed.
  const columns = await db.execute({ sql: `PRAGMA table_info(users)` });
  const names = new Set(columns.rows.map(row => row.name));
  if (!names.has('avatar_url')) await db.execute({ sql: `ALTER TABLE users ADD COLUMN avatar_url TEXT` });
  if (!names.has('total_play_seconds')) await db.execute({ sql: `ALTER TABLE users ADD COLUMN total_play_seconds INTEGER NOT NULL DEFAULT 0` });

  return db;
}

module.exports = { getDb, initDb };
