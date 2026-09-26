const { createClient } = require('@libsql/client');

let client;
let initPromise = null;

function getDb() {
  if (client) return client;
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!url || !authToken) {
    throw new Error('Turso is not configured. Add TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in Render.');
  }
  client = createClient({ url, authToken });
  return client;
}

async function initDb() {
  if (initPromise) return initPromise;
  initPromise = (async () => {
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
    `CREATE TABLE IF NOT EXISTS player_wallets (
      user_id TEXT PRIMARY KEY,
      gems INTEGER NOT NULL DEFAULT 0,
      world_coins INTEGER NOT NULL DEFAULT 0,
      event_tokens INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS player_inventory (
      user_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, item_id),
      CHECK (quantity >= 0),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS player_equipment (
      user_id TEXT NOT NULL,
      slot TEXT NOT NULL,
      item_id TEXT,
      metadata_json TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, slot),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS player_roles (
      user_id TEXT NOT NULL,
      role_id TEXT NOT NULL,
      level INTEGER NOT NULL DEFAULT 1,
      xp INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, role_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS player_progress (
      user_id TEXT PRIMARY KEY,
      level INTEGER NOT NULL DEFAULT 1,
      xp INTEGER NOT NULL DEFAULT 0,
      total_xp INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS world_locks (
      id TEXT PRIMARY KEY,
      world_id TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      x1 INTEGER NOT NULL,
      y1 INTEGER NOT NULL,
      x2 INTEGER NOT NULL,
      y2 INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (world_id) REFERENCES worlds(id) ON DELETE CASCADE,
      FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS world_permissions (
      world_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'builder',
      can_build INTEGER NOT NULL DEFAULT 1,
      can_break INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (world_id, user_id),
      FOREIGN KEY (world_id) REFERENCES worlds(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS world_bans (
      world_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      reason TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (world_id, user_id),
      FOREIGN KEY (world_id) REFERENCES worlds(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS world_settings (
      world_id TEXT PRIMARY KEY,
      description TEXT NOT NULL DEFAULT '',
      max_players INTEGER NOT NULL DEFAULT 20,
      min_level INTEGER NOT NULL DEFAULT 1,
      spawn_x REAL NOT NULL DEFAULT 0,
      spawn_y REAL NOT NULL DEFAULT 20,
      background TEXT NOT NULL DEFAULT 'day',
      FOREIGN KEY (world_id) REFERENCES worlds(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS dropped_items (
      id TEXT PRIMARY KEY,
      world_id TEXT NOT NULL,
      x REAL NOT NULL,
      y REAL NOT NULL,
      z REAL NOT NULL DEFAULT 0,
      item_id TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (world_id) REFERENCES worlds(id) ON DELETE CASCADE,
      CHECK (quantity > 0)
    )`,
    `CREATE TABLE IF NOT EXISTS world_plants (
      world_id TEXT NOT NULL,
      x INTEGER NOT NULL,
      y INTEGER NOT NULL,
      seed_item_id TEXT NOT NULL,
      planted_at TEXT NOT NULL DEFAULT (datetime('now')),
      grows_at TEXT NOT NULL,
      stage INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (world_id, x, y),
      FOREIGN KEY (world_id) REFERENCES worlds(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS quests (
      user_id TEXT NOT NULL,
      quest_id TEXT NOT NULL,
      progress INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, quest_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS achievements (
      user_id TEXT NOT NULL,
      achievement_id TEXT NOT NULL,
      unlocked_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, achievement_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS guilds (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      name TEXT NOT NULL UNIQUE,
      tag TEXT NOT NULL UNIQUE,
      level INTEGER NOT NULL DEFAULT 1,
      xp INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS guild_members (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member',
      joined_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (guild_id, user_id),
      FOREIGN KEY (guild_id) REFERENCES guilds(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS trades (
      id TEXT PRIMARY KEY,
      initiator_id TEXT NOT NULL,
      recipient_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      initiator_payload TEXT NOT NULL DEFAULT '{}',
      recipient_payload TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (initiator_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS shop_listings (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      world_id TEXT,
      item_id TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      price INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'gems',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (world_id) REFERENCES worlds(id) ON DELETE CASCADE,
      CHECK (quantity > 0),
      CHECK (price >= 0)
    )`,
    `CREATE TABLE IF NOT EXISTS world_objects (
      id TEXT PRIMARY KEY,
      world_id TEXT NOT NULL,
      x INTEGER NOT NULL,
      y INTEGER NOT NULL,
      type TEXT NOT NULL,
      label TEXT NOT NULL DEFAULT '',
      link_world_id TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (world_id) REFERENCES worlds(id) ON DELETE CASCADE,
      FOREIGN KEY (link_world_id) REFERENCES worlds(id) ON DELETE SET NULL,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(world_id,x,y)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_world_objects_world ON world_objects(world_id,x,y)`,
    `CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      world_id TEXT,
      action TEXT NOT NULL,
      payload_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (world_id) REFERENCES worlds(id) ON DELETE SET NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_worlds_owner ON worlds(owner_id)`,
    `CREATE INDEX IF NOT EXISTS idx_world_blocks_world ON world_blocks(world_id)`,
    `CREATE INDEX IF NOT EXISTS idx_chat_scope_time ON chat_messages(world_id, created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_presence_world_time ON world_presence(world_id, updated_at)`,
    `CREATE INDEX IF NOT EXISTS idx_friendships_requester ON friendships(requester_id, status)`,
    `CREATE INDEX IF NOT EXISTS idx_friendships_addressee ON friendships(addressee_id, status)`,
    `CREATE INDEX IF NOT EXISTS idx_inventory_user ON player_inventory(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_locks_world ON world_locks(world_id)`,
    `CREATE INDEX IF NOT EXISTS idx_permissions_world ON world_permissions(world_id)`,
    `CREATE INDEX IF NOT EXISTS idx_bans_world ON world_bans(world_id)`,
    `CREATE INDEX IF NOT EXISTS idx_drops_world ON dropped_items(world_id)`,
    `CREATE INDEX IF NOT EXISTS idx_plants_world ON world_plants(world_id)`,
    `CREATE INDEX IF NOT EXISTS idx_quests_user ON quests(user_id, status)`,
    `CREATE INDEX IF NOT EXISTS idx_guild_members_user ON guild_members(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_shops_world ON shop_listings(world_id, active)`
  ], 'write');

  // Safe migrations for trade confirmations added after the initial schema.
  const tradeColumns = await db.execute({ sql: `PRAGMA table_info(trades)` });
  const tradeNames = new Set(tradeColumns.rows.map(row => row.name));
  if (!tradeNames.has('initiator_confirmed')) {
    await db.execute({ sql: `ALTER TABLE trades ADD COLUMN initiator_confirmed INTEGER NOT NULL DEFAULT 0` });
  }
  if (!tradeNames.has('recipient_confirmed')) {
    await db.execute({ sql: `ALTER TABLE trades ADD COLUMN recipient_confirmed INTEGER NOT NULL DEFAULT 0` });
  }

  // Safe migrations for users created before profile features existed.
  const columns = await db.execute({ sql: `PRAGMA table_info(users)` });
  const names = new Set(columns.rows.map(row => row.name));
  if (!names.has('avatar_url')) await db.execute({ sql: `ALTER TABLE users ADD COLUMN avatar_url TEXT` });
  if (!names.has('total_play_seconds')) await db.execute({ sql: `ALTER TABLE users ADD COLUMN total_play_seconds INTEGER NOT NULL DEFAULT 0` });

  return db;
  })();
  try {
    return await initPromise;
  } catch (error) {
    initPromise = null;
    throw error;
  }
}

module.exports = { getDb, initDb };
