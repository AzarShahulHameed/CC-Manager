# CC Manager

Multi-office credit card management for Catapult Consulting (UAE + India).
NestJS-style Express backend on Postgres (Neon), React frontend.

## First-time setup

1. **Database**
   ```
   cd backend
   cp .env.example .env       # fill in DATABASE_URL and JWT_SECRET
   npm install
   npm run migrate            # creates offices, users, settings, office scoping
   NODE_ENV=seed node seed.users.js   # edit the passwords in that file first
   ```

2. **Backend**
   ```
   npm start                  # http://localhost:3001
   ```

3. **Frontend**
   ```
   cd ../frontend
   cp .env.example .env.local # optional — defaults to the deployed backend
   npm install
   npm start                  # http://localhost:3000
   ```

Or from `backend/`, `./start.sh` runs the migration check and starts both.

## Environment variables

See `backend/.env.example` and `frontend/.env.example`. `JWT_SECRET` and
`DATABASE_URL` are required — the server refuses to boot without them
(`config/env.js`) rather than failing on the first request. Twilio and
Resend are optional; missing either just logs a warning and that channel
runs in mock mode.

**In production (Render), set these in the dashboard's environment tab —
a local `.env` file is never deployed with your code.**

## Migrations

New schema changes go in `backend/migrations/`, numbered (`002_...sql`,
`003_...sql`). `npm run migrate` tracks what's applied in a
`schema_migrations` table and only runs new files — safe to run on every
deploy.

## Architecture

- `backend/` — Express + Postgres. Auth is JWT (`middleware/auth.js`), all
  data is scoped by `office_id`. See `routes/` for endpoints.
- `frontend/` — React (CRA), single `App.js`. `authFetch()` wraps every API
  call with the JWT and force-logs-out on 401.
- Offices, users, and settings (bank lists, notification channels) all live
  in the database — see the Settings screen in-app, not source code.

## Notifications

Dual channel: WhatsApp (Twilio) and email (Resend), toggled per office in
Settings. Fires daily at 9am via cron (`server.js`), or manually via
"Trigger Now" in the Alerts tab. Failed sends can be retried individually
from the notification log.
