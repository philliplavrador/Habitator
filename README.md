# Habitator

A minimalist, mobile-first habit tracker. **Multi-user** — each person signs in
with their own username + password and sees only their own data — installable as
a PWA on iPhone. Built with Next.js 14 (App Router) + TypeScript + Tailwind,
backed by **PostgreSQL** (`pg`).

- **Today screen** — check each habit off as **pass (✓)** or **fail (✗)**; tap the
  active one again to clear it (blank = an exception that isn't counted). Navigate
  to previous days with `‹ ›` to back-fill or correct.
- **Stats** — completion %, current streak, longest streak, and a GitHub-style
  heatmap per habit.
- **Fast add** — the **＋ Add habit** button is always one tap away.

---

## Tracking model (mirrors the old spreadsheet)

Each habit/day is **green (pass)**, **red (fail)**, or **blank**. Blank means
"exception / not counted" (e.g. a sick day):

- **Completion %** = `passes / (passes + fails)` over recorded days. Blanks don't count.
- **Longest streak** = longest run of consecutive passes. A fail breaks it; blanks
  are skipped (neither break nor extend).
- **Current streak** = consecutive passes walking back from the most recent recorded
  day. If that day is a fail, it's 0.

Clearing a mark **deletes** the row, returning the day to blank.

---

## Local development

Requires **Node ≥ 20**.

Requires a reachable **PostgreSQL**. The quickest local one is Docker:

```bash
docker run -d --name habitator-pg -e POSTGRES_PASSWORD=devpass \
  -e POSTGRES_DB=habitator -p 55432:5432 postgres:16-alpine
```

```bash
npm install
cp .env.example .env.local  # then edit the values
npm run dev                 # http://localhost:3000
```

Minimal `.env.local`:

```
SESSION_SECRET=devsecret123
DATABASE_URL=postgres://postgres:devpass@localhost:55432/habitator
PGSSL=disable
REGISTRATION_CODE=letmein
```

Open <http://localhost:3000> → you'll be redirected to `/login`. Pick a username +
password (the first time you'll also need the `REGISTRATION_CODE`) and you're in.
The schema is created automatically on first query.

### Scripts

| Script           | What it does                                  |
| ---------------- | --------------------------------------------- |
| `npm run dev`    | Dev server with hot reload                    |
| `npm run build`  | Production build                              |
| `npm start`      | Serve the production build (honors `$PORT`)   |
| `npm run lint`   | ESLint                                        |

Regenerate the PWA icons (white check on the accent) with
`node scripts/gen-icons.mjs`.

---

## Environment variables

| Variable            | Required | Purpose                                                                        |
| ------------------- | -------- | ------------------------------------------------------------------------------ |
| `DATABASE_URL`      | yes      | Postgres connection string. On Railway: `${{Postgres.DATABASE_URL}}`.          |
| `SESSION_SECRET`    | yes      | Long random string; the HMAC key that signs the session cookie.                |
| `REGISTRATION_CODE` | rec.     | Shared code required to create a **new** account. Unset ⇒ sign-ups disabled.   |
| `PGSSL`             | no       | `disable` / `require`; auto by default (off for localhost + Railway internal). |
| `DATABASE_PATH`     | migration | Path to the OLD SQLite file to import once on first boot (see Deploy).         |
| `DATA_DIR`          | prod     | Base dir for app files; videos go in `<DATA_DIR>/uploads/`. Defaults near `DATABASE_PATH`. |
| `TZ`                | prod     | Your timezone (e.g. `America/New_York`), so "today" = your local day.          |

Generate a secret: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

> **Why `TZ`?** The app computes the current day on the server. Railway hosts run
> in **UTC**, so without `TZ` set, "today" flips at UTC midnight — which can be hours
> off from your local day. Set `TZ` to your IANA timezone name and the day lines up.
> Local dev already uses your machine's timezone.

---

## Deploy to Railway (and the SQLite → Postgres cutover)

Data now lives in **Postgres**, not the SQLite volume file. Migrating an existing
deployment is a **one-time cutover** that copies every row from the old SQLite file
into Postgres under the **`Fifi`** account. Do it in this order so nothing is lost:

1. **Add the Postgres plugin** to the Railway project (New → Database → PostgreSQL).
   It exposes a `DATABASE_URL` you'll reference from the app service.
2. **Keep the existing `/data` volume mounted** on the app service — the migration
   reads the old `/data/habitator.db` from it. Do **not** delete the volume yet.
3. **Set the app service variables** (service → Variables):
   - `DATABASE_URL=${{Postgres.DATABASE_URL}}`  ← reference the plugin
   - `DATABASE_PATH=/data/habitator.db`  ← the old file, so it gets imported
   - `SESSION_SECRET=<long random string>` (keep the existing one)
   - `REGISTRATION_CODE=<a code you choose>` — needed to create new accounts
   - `TZ=<your timezone>` (e.g. `America/New_York`)
   - (While `DATABASE_PATH=/data/habitator.db` is set, rep-program videos already
     land in `/data/uploads/`. If you later unset `DATABASE_PATH`, set
     `DATA_DIR=/data` to keep them on the volume.)
   - You can delete the old `APP_PASSWORD` — it's no longer used.
4. **Deploy** (push to `main`). On first boot the app creates the Postgres schema
   and, seeing `DATABASE_PATH`, copies all rows from SQLite into Postgres under
   `Fifi` — **once** (a flag then prevents re-runs). The SQLite file is only read
   and left in place as a backup.
5. **Verify**, then log in as **`Fifi`** with the owner's password. Check the app
   shows all your habits/entries/fasts/pushups/anki. Pull `GET /api/export` to
   confirm counts.
6. **After you've confirmed** the data is all there, you may unset `DATABASE_PATH`
   (so the importer is skipped forever) and — once you're confident — remove the
   old volume. Keep `UPLOADS_DIR` on a volume if you use videos.

> ⚠️ The migration only runs when **both** `DATABASE_URL` (Postgres) and a readable
> `DATABASE_PATH` (old SQLite) are present on the same boot. If `DATABASE_URL` is
> missing the app can't start — provision Postgres **before** deploying this version.

### Fresh deployment (no existing data)

Skip the SQLite steps: add the Postgres plugin, set `DATABASE_URL`,
`SESSION_SECRET`, and `REGISTRATION_CODE`, and deploy. A `Fifi` account is still
seeded (override its password with `SEED_FIFI_PASSWORD`), or just register your own
username with the registration code.

### Custom subdomain

Railway service → **Settings → Networking → Add a custom domain** (e.g.
`habits.yourdomain.com`). Railway shows a target host — add a **CNAME** for that
subdomain at your DNS provider pointing to it. Once it resolves, the app is live on
your subdomain.

---

## Install on iPhone (PWA)

1. Open the subdomain in **Safari**.
2. Share → **Add to Home Screen**.
3. Launch from the new icon — it opens standalone (no Safari chrome) and the login
   persists (~1-year cookie).

No service worker in v1, so it needs a network connection to load.

---

## Backups

`GET /api/export` streams a JSON dump of the logged-in user's habits + entries +
fasts + pushups + pullups + anki. It's linked as **Export data** in the footer of
the Today screen. Use it any time to pull a backup, independent of the hosting setup.

---

## Project layout

```
middleware.ts            # per-user session gate (verifies the signed cookie)
app/
  layout.tsx             # shell + PWA meta
  page.tsx               # Today screen
  login/page.tsx         # username + password (+ registration code)
  habits/new, [id], [id]/edit
  api/login, logout, habits, entries, fasts, pushups, pullups, anki, export
lib/
  db.ts                  # Postgres pool + schema + query helpers (async)
  migrate.ts             # one-time SQLite → Postgres import (under "Fifi")
  session.ts             # signed session tokens (Edge + Node safe)
  auth.ts                # scrypt passwords, users table, current-user helpers
  habits.ts, entries.ts  # typed, user-scoped queries
  stats.ts               # win rate + streaks
  dates.ts               # local-day YYYY-MM-DD helpers
  validate.ts, client.ts
components/               # HabitRow, AddHabitForm, Heatmap, DateNav, StatCard, …
public/                  # manifest.webmanifest, icons/
scripts/gen-icons.mjs    # regenerate the icons
```

---

## Out of scope (v1)

Push notifications, spreadsheet import, and offline sync are intentionally left
out. (Multi-user is now supported — each account is isolated.) See `plan.md` for
the original build spec.
