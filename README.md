# VEXORA

VEXORA is an online 3D sandbox game project.

## Current stage

Account foundation is now connected to Turso:
- Login with username or email
- Registration
- Secure password hashing with bcrypt
- HTTP-only session cookie
- Account dashboard
- Guest mode
- Logout

## Vercel environment variables

Add these as **server-only** Environment Variables in Vercel:

```text
TURSO_DATABASE_URL=libsql://your-database.turso.io
TURSO_AUTH_TOKEN=your_turso_token
AUTH_SECRET=your_random_secret_at_least_32_characters_long
```

Do not prefix these with `NEXT_PUBLIC_` and never commit real secrets.

## Database

The API automatically creates the `users` table on the first authentication request. The reference schema is in `schema.sql`.

## Routes

- `/` — Login
- `/register.html` — Create account
- `/dashboard.html` — Account home
- `/api/auth/register` — Registration API
- `/api/auth/login` — Login API
- `/api/auth/me` — Current session API
- `/api/auth/logout` — Logout API

## Next stage

3D game client, world creation, inventory, multiplayer synchronization, and persistent game data will be added after the account foundation is verified.
