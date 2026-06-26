# Habitator

A minimalist, mobile-first **personal** habit tracker. Single user, single shared
password, installable as a PWA on iPhone. Built with Next.js 14 (App Router) +
TypeScript + Tailwind, backed by SQLite (`better-sqlite3`) on a persistent disk.

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

```bash
npm install                 # builds the better-sqlite3 native module
cp .env.example .env.local  # then edit the values
npm run dev                 # http://localhost:3000
```

Minimal `.env.local`:

```
APP_PASSWORD=test
SESSION_SECRET=devsecret123
# DATABASE_PATH unset → falls back to ./data/habitator.db
```

Open <http://localhost:3000> → you'll be redirected to `/login`. Enter the password
and you're in. The SQLite file is created automatically at `./data/habitator.db`
(git-ignored).

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

| Variable         | Required | Purpose                                                                 |
| ---------------- | -------- | ----------------------------------------------------------------------- |
| `APP_PASSWORD`   | yes      | The single shared password typed on the login screen.                   |
| `SESSION_SECRET` | yes      | Long random string; the opaque "logged in" cookie value.                |
| `DATABASE_PATH`  | prod     | Absolute path to the SQLite file. **Point at the Railway volume.**      |
| `TZ`             | prod     | Your timezone (e.g. `America/New_York`), so "today" = your local day.   |

Generate a secret: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

> **Why `TZ`?** The app computes the current day on the server. Railway hosts run
> in **UTC**, so without `TZ` set, "today" flips at UTC midnight — which can be hours
> off from your local day. Set `TZ` to your IANA timezone name and the day lines up.
> Local dev already uses your machine's timezone.

---

## Deploy to Railway

The app stores data in a single SQLite file. Railway containers have an **ephemeral
filesystem** that is wiped on every deploy, so the database **must** live on a
persistent **volume**. Do this once:

1. **Create the service** from this GitHub repo (Railway auto-detects Next.js via
   Nixpacks; no Dockerfile needed). Auto-deploy on push is on by default.
2. **Add a Volume** to the service. Set the **mount path to `/data`**.
3. **Set service variables** (service → Variables):
   - `DATABASE_PATH=/data/habitator.db`
   - `APP_PASSWORD=<your password>`
   - `SESSION_SECRET=<long random string>`
   - `TZ=<your timezone>` (e.g. `America/New_York`) — so "today" matches your local day
4. **Deploy.** On first boot the app creates `/data/habitator.db` on the volume and
   runs its schema.

> ⚠️ **The one footgun:** if the volume isn't attached or `DATABASE_PATH` isn't set,
> the app falls back to `./data/habitator.db` on the **ephemeral** disk and your data
> is lost on the next deploy. Following steps 2–3 prevents this permanently.

### Persistence check (do this once after deploying)

Add a habit and a few marks, then push a trivial commit to trigger a redeploy. After
it redeploys, confirm the habit and marks are **still there**. If they vanished, the
volume/`DATABASE_PATH` is misconfigured — recheck steps 2–3.

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

`GET /api/export` streams a JSON dump of all habits + entries. It's linked as
**Export data** in the footer of the Today screen. Use it any time to pull a backup,
independent of the hosting setup.

---

## Project layout

```
middleware.ts            # single-password gate
app/
  layout.tsx             # shell + PWA meta
  page.tsx               # Today screen
  login/page.tsx
  habits/new, [id], [id]/edit
  api/login, logout, habits, habits/[id], entries, export
lib/
  db.ts                  # better-sqlite3 singleton + schema
  habits.ts, entries.ts  # typed queries
  stats.ts               # win rate + streaks
  dates.ts               # local-day YYYY-MM-DD helpers
  auth.ts, validate.ts, client.ts
components/               # HabitRow, AddHabitForm, Heatmap, DateNav, StatCard, …
public/                  # manifest.webmanifest, icons/
scripts/gen-icons.mjs    # regenerate the icons
```

---

## Out of scope (v1)

Push notifications, spreadsheet import, multi-user, and offline sync are
intentionally left out. See `plan.md` for the full build spec.
