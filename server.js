const express = require('express');
const path = require('path');

const app = express();
const PORT = Number(process.env.PORT) || 10000;
const ROOT = __dirname;

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

const routes = {
  '/api/health': './api/health.js',
  '/api/player': './api/player.js',
  '/api/inventory': './api/inventory.js',
  '/api/friends': './api/friends.js',
  '/api/presence': './api/presence.js',
  '/api/chat': './api/chat.js',
  '/api/locks': './api/locks.js',
  '/api/world/access': './api/world/access.js',
  '/api/world/settings': './api/world/settings.js',
  '/api/drops': './api/drops.js',
  '/api/objects': './api/objects.js',
  '/api/farming': './api/farming.js',
  '/api/trades': './api/trades.js',
  '/api/quests': './api/quests.js',
  '/api/achievements': './api/achievements.js',
  '/api/guilds': './api/guilds.js',
  '/api/shop': './api/shop.js',
  '/api/equipment': './api/equipment.js',
  '/api/game/action': './api/game/action.js',
  '/api/worlds': './api/worlds/index.js',
  '/api/worlds/state': './api/worlds/state.js',
  '/api/auth/login': './api/auth/login.js',
  '/api/auth/register': './api/auth/register.js',
  '/api/auth/logout': './api/auth/logout.js',
  '/api/auth/me': './api/auth/me.js'
};

for (const [route, file] of Object.entries(routes)) {
  app.all(route, async (req, res, next) => {
    try {
      const handler = require(path.join(ROOT, file));
      if (typeof handler !== 'function') throw new Error(`Invalid API handler: ${file}`);
      await handler(req, res);
    } catch (error) {
      next(error);
    }
  });
}

// Never expose source/config directories directly.
app.use((req, res, next) => {
  const blocked = /^\/api(?:\/|$)|^\/\.git(?:\/|$)|^\/\.github(?:\/|$)|^\/scripts(?:\/|$)|^\/data(?:\/|$)|^\/schema\.sql$/i;
  if (blocked.test(req.path)) return res.status(404).send('Not found');
  next();
});

app.use(express.static(ROOT, {
  index: 'index.html',
  dotfiles: 'deny'
}));

app.use((error, req, res, next) => {
  console.error(error);
  if (res.headersSent) return next(error);
  res.status(500).json({ error: 'Internal server error.' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`VEXORA server listening on 0.0.0.0:${PORT}`);
});
