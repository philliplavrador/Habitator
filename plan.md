# Plan: Habitator — Personal Habit Tracker

> **How to use this file:** This is a complete, self-contained build spec. The repo owner will open a fresh Claude Code chat and say *"execute plan.md"*. That chat must build the entire app from this document with no prior context. Build it end-to-end, then run the Verification section.

---

## Context

The owner currently tracks daily habits in a Google Sheet (`Routine.xlsx`, in the repo root). Each habit is a column with a name, an instructions/details blurb, an "exceptions" note, and a start date. Each day, each habit cell is colored **green (passed)**, **red (failed)**, or left **blank (not counted — a sick day / exception)**. An Apps Script computes win rates from the green/red counts.

The owner wants to replace this spreadsheet with a small personal web app because:
- The sheet is clunky on a phone, and the app will be used **primarily on an iPhone** (Safari → "Add to Home Screen"), occasionally on desktop.
- Adding a new habit happens often (every couple of days) and must be **very fast and easy**.
- They want quick daily **pass/fail check-off** of a list of habits, plus **stats/visualization** (completion %, current streak, longest streak).

**Outcome:** A minimalist, mobile-first, single-user habit tracker behind a single shared password, deployed to Railway from GitHub, installable as a PWA on iOS.

### Hard requirements (from the owner)
- **Single user.** No accounts, no roles, no multi-tenant anything.
- **Single shared password gate.** Visit the site → enter one password → you're in (on any device). Low security is fine; this is personal and not a target.
- **Mobile-first, minimalist UI.** Clean, fast, uncluttered. Works great on iPhone Safari and as a home-screen PWA.
- **Easy daily check-off** of a habit list as pass/fail.
- **Very easy to add a new habit** (name + details + exceptions + start date).
- **Stats:** completion %, current streak, longest streak per habit.
- **Deploy:** GitHub repo → Railway (auto-deploy on push), hosted on a subdomain of the owner's site.
- **Persistence:** SQLite file on a Railway **persistent volume** (chosen explicitly — see Storage section).

### Out of scope for v1 (note, don't build)
- Push reminders/notifications (iOS web push is finicky; revisit later).
- Importing the old spreadsheet (only ~3 habits; faster to re-add by hand).
- Multi-user, sharing, social features.
- Offline sync / service worker (basic PWA install only; SW is a possible future add).

---

## Tech stack

- **Next.js 14 (App Router) + React 18 + TypeScript** (strict mode). Full-stack in one app (UI + API route handlers). Matches the owner's existing CuttleQuest project and runs cleanly on Railway.
- **Tailwind CSS** — mobile-first, minimalist, **dark mode as the default** theme.
- **SQLite via `better-sqlite3`** — synchronous, zero-network, single file. DB file lives on a Railway persistent volume. **No ORM and no migration framework** for v1: a small `lib/db.ts` opens the database and runs idempotent `CREATE TABLE IF NOT EXISTS` on startup. Keep it transparent and dependency-light.
- **Auth:** single password → `httpOnly` cookie session, enforced by `middleware.ts`.
- **PWA:** web manifest + Apple touch icons + iOS meta tags for home-screen install.
- **Package manager:** npm. **Deploy:** Railway (Nixpacks auto-detects Next.js).

---

## Data model

SQLite, two tables. Use `TEXT` ISO dates (`YYYY-MM-DD`) to avoid timezone headaches; the app operates in the owner's local day.

```sql
CREATE TABLE IF NOT EXISTS habits (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  details     TEXT    NOT NULL DEFAULT '',   -- what to do (instructions)
  exceptions  TEXT    NOT NULL DEFAULT '',   -- e.g. "if late, if sick" or "None"
  start_date  TEXT    NOT NULL,              -- YYYY-MM-DD; stats only count days >= this
  sort_order  INTEGER NOT NULL DEFAULT 0,    -- manual ordering on the Today screen
  archived    INTEGER NOT NULL DEFAULT 0,    -- 0/1; archived hides from Today but keeps history
  created_at  TEXT    NOT NULL               -- ISO timestamp
);

CREATE TABLE IF NOT EXISTS entries (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  habit_id   INTEGER NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  date       TEXT    NOT NULL,               -- YYYY-MM-DD
  status     TEXT    NOT NULL CHECK (status IN ('pass','fail')),
  created_at TEXT    NOT NULL,
  UNIQUE (habit_id, date)
);
```

### Status semantics (mirror the spreadsheet exactly)
- **pass** = green, **fail** = red, **no row for that (habit, date)** = blank = an exception / not counted.
- A day is recorded only when a `pass` or `fail` row exists. Clearing a mark **deletes** the row (back to blank).

### Stats rules (implement in `lib/stats.ts`, document these in code comments)
For a given habit, consider only `entries` with `date >= habit.start_date`, ordered by date ascending. Let "recorded days" = days that have a pass/fail row (blanks are skipped entirely, treated as exceptions — consistent with how blanks work in the sheet).

- **Completion % (win rate)** = `passes / (passes + fails)`, over recorded days. If no recorded days, show `—`.
- **Longest streak** = the longest run of consecutive `pass` recorded days. A `fail` breaks the run; blank days are skipped (do not break, do not extend).
- **Current streak** = starting from the most recent recorded day and walking backward, the number of consecutive `pass` days until a `fail` is hit. If the most recent recorded day is a `fail`, current streak = 0.
- **Per-day roll-up** (Today screen): of the active habits whose `start_date <= selected date`, how many are marked `pass` that day → show "X / Y done".

> These rules make "sick/exception" days (left blank) neither hurt your win rate nor break your streak — which is exactly the behavior the owner relies on in the spreadsheet. If the owner later wants blanks to break streaks, it's a one-line change here.

---

## Screens & UX

Keep everything minimalist: big tap targets, generous spacing, no chrome you don't need. Dark theme default. Single accent color. Green for pass, red for fail.

### 1. `/login`
- One password input + submit button. Nothing else.
- POST to `/api/login`. On success → redirect to `/`. On failure → inline "Incorrect password."

### 2. `/` — Today (default screen, the core of the app)
- **Date header** showing the selected day (defaults to today) with `‹` / `›` arrows to move to previous/next days. This lets the owner **back-fill or correct past days** (they do this in the sheet). Don't allow navigating to future days past today.
- **Per-day summary:** "X / Y done" for the selected date.
- **Habit list:** each active habit (not archived, `start_date <= selected date`) renders a row with:
  - Habit **name** (tap name → habit detail page).
  - A **three-state toggle**: a ✓ (pass) button and a ✗ (fail) button.
    - Tap ✓ → set `pass`. Tap ✗ → set `fail`. Tap the currently-active one again → **clear** (delete the row → blank).
    - Visual: active ✓ is green-filled, active ✗ is red-filled, inactive are outlined/muted.
  - Optional: a tiny current-streak badge (e.g. "🔥 5").
- **Prominent "＋ Add habit"** button (e.g. a floating action button or a fixed bottom bar) — adding must be one tap away.
- All toggles persist immediately via an API call (optimistic UI is fine).

### 3. Add / Edit habit — `/habits/new` and `/habits/[id]/edit` (a full page or a slide-up modal; pick whichever is cleaner on mobile)
- Fields: **Name** (required), **Details** (textarea, "what do you have to do?"), **Exceptions** (textarea, e.g. "if late, if sick"), **Start date** (date picker, defaults to today).
- Save → returns to Today with the new/updated habit visible.
- Edit page also offers **Archive** (hide from Today, keep history) and **Delete** (remove habit + its entries, with a confirm).

### 4. `/habits/[id]` — Habit detail / stats
- Shows name, details, exceptions, start date.
- **Stat cards:** Completion %, Current streak, Longest streak, total passes / fails.
- **Visualization:** a GitHub-style **heatmap/calendar** of the last ~3 months — green cells = pass, red = fail, empty = blank. The owner explicitly enjoys visualizing the data; this is the payoff. Keep it lightweight (a simple CSS grid, no heavy charting lib).
- Buttons: Edit, Archive/Unarchive, Delete.

### 5. (Optional, low effort) `/stats` overview
- A simple list of all active habits with their completion % and current streak side by side. If it adds clutter, fold this into the Today screen footer instead.

---

## Auth design (single shared password)

Simple and "secure enough" for a personal app — no user table, no hashing ceremony required beyond a constant-time compare.

- **Env vars:**
  - `APP_PASSWORD` — the shared password the owner types in.
  - `SESSION_SECRET` — a long random string; used as the opaque cookie value that proves "logged in."
- **`POST /api/login`:** constant-time compare submitted password to `APP_PASSWORD`. On match, set cookie `session=<SESSION_SECRET>` with `httpOnly`, `secure`, `sameSite=lax`, `path=/`, `maxAge` ≈ 1 year (so the phone stays logged in). Return `{ ok: true }`.
- **`middleware.ts`:** for every route except `/login`, `/api/login`, and static assets (`/_next/*`, icons, manifest), require cookie `session === SESSION_SECRET`. Otherwise redirect page requests to `/login` and return `401` for `/api/*`.
- **Optional `POST /api/logout`:** clears the cookie. Minor; include a tiny logout link in a settings/footer if convenient.
- Middleware runs in the Edge runtime; a plain string comparison of the cookie against `process.env.SESSION_SECRET` is all that's needed (no Web Crypto required).

---

## Storage: SQLite on a Railway volume (footgun-proofed)

Railway containers have an **ephemeral filesystem** — rebuilt from source on every deploy. A SQLite file written next to the code would be wiped on each redeploy. A **volume** is a persistent disk mounted at a fixed path that survives deploys/restarts. The DB must live there.

### Implementation
- `lib/db.ts` opens `better-sqlite3` at `process.env.DATABASE_PATH`. **Local dev fallback:** if unset, use `./data/habitator.db` (and `.gitignore` the `data/` dir). On open, run the `CREATE TABLE IF NOT EXISTS` statements (idempotent init) and `PRAGMA journal_mode = WAL;` `PRAGMA foreign_keys = ON;`. Export a single shared connection (guard against Next.js dev hot-reload creating multiple connections via a `globalThis` singleton).
- Provide typed query helpers in `lib/habits.ts` / `lib/entries.ts` (e.g. `listActiveHabits()`, `setEntry(habitId, date, status)`, `clearEntry(habitId, date)`, `getHabitStats(habitId)`).

### Railway one-time setup checklist (put this in the README too)
1. Create the Railway service from the GitHub repo.
2. **Add a Volume** to the service; set **mount path = `/data`**.
3. Set service variables: `DATABASE_PATH=/data/habitator.db`, `APP_PASSWORD=<chosen password>`, `SESSION_SECRET=<long random string>`.
4. Deploy. The app creates the DB file on the volume on first boot.

> **"Misconfigured" = the DB file landing anywhere other than `/data`.** That only happens if the volume isn't attached or `DATABASE_PATH` isn't set (app falls back to the ephemeral `./data`). Following the 4 steps above prevents it permanently.

### Backup safety net
- Add an authorized **`GET /api/export`** route that streams a JSON dump of all habits + entries (and/or the raw `.db` file). Surface it as a small **"Export data"** link on a settings/footer. This guarantees the owner can always pull a backup regardless of infra.

---

## Project structure (target)

```
plan.md                      # this file
package.json
next.config.mjs              # ensure better-sqlite3 is external (serverExternalPackages)
tsconfig.json                # strict
tailwind.config.ts, postcss.config.mjs
.gitignore                   # node_modules, .next, data/, .env*
.env.example                 # APP_PASSWORD, SESSION_SECRET, DATABASE_PATH
README.md                    # setup + Railway + volume + custom domain steps
middleware.ts                # password gate
app/
  layout.tsx                 # html shell, PWA meta tags, theme
  globals.css                # Tailwind + base styles
  page.tsx                   # Today screen
  login/page.tsx
  habits/new/page.tsx
  habits/[id]/page.tsx       # detail + stats + heatmap
  habits/[id]/edit/page.tsx
  api/
    login/route.ts
    logout/route.ts
    habits/route.ts          # GET list, POST create
    habits/[id]/route.ts     # GET, PATCH, DELETE
    entries/route.ts         # POST set (pass/fail), DELETE clear
    export/route.ts          # JSON/db backup
lib/
  db.ts                      # better-sqlite3 singleton + schema init
  habits.ts                  # habit queries
  entries.ts                 # entry queries
  stats.ts                   # win rate + streak calculations
  dates.ts                   # local-day helpers (YYYY-MM-DD)
components/
  HabitRow.tsx               # name + ✓/✗ three-state toggle
  AddHabitForm.tsx
  StatCard.tsx
  Heatmap.tsx                # CSS-grid calendar heatmap
  DateNav.tsx                # ‹ today ›
public/
  manifest.webmanifest
  icons/icon-192.png, icon-512.png, apple-touch-icon.png
```

---

## PWA / iOS install

- `public/manifest.webmanifest`: `name`, `short_name: "Habitator"`, `display: "standalone"`, `theme_color`, `background_color`, `icons` (192 + 512).
- In `app/layout.tsx` head/metadata: link the manifest; `apple-touch-icon`; `<meta name="apple-mobile-web-app-capable" content="yes">`; `apple-mobile-web-app-status-bar-style`; `theme-color`; viewport `width=device-width, initial-scale=1, viewport-fit=cover` (handle the iPhone notch with safe-area insets in CSS).
- Generate simple placeholder icons (a checkmark glyph on the accent color is fine). No service worker in v1.

---

## Build & deploy

- `package.json` scripts: `dev` (`next dev`), `build` (`next build`), `start` (`next start -p ${PORT:-3000}`). Railway provides `$PORT`.
- Add `engines.node` (e.g. `>=20`). `better-sqlite3` is a native module — Nixpacks' default Node image compiles it fine; if `next build` tries to bundle it, mark it external (`serverExternalPackages: ['better-sqlite3']` in `next.config`).
- `.gitignore`: `node_modules`, `.next`, `data/`, `.env*` (keep `.env.example`).
- README documents: local run, env vars, the **Railway volume checklist** above, and adding the **custom subdomain** (Railway service → Settings → Networking → add domain; set the CNAME at the owner's DNS).

---

## Verification (run after building)

**Local:**
1. `npm install` succeeds (incl. `better-sqlite3` native build).
2. Create `.env.local` with `APP_PASSWORD=test`, `SESSION_SECRET=devsecret123`.
3. `npm run dev` → open `http://localhost:3000` → redirected to `/login`.
4. Wrong password → rejected. Correct password → Today screen loads, cookie set.
5. Tap **＋ Add habit**, create one (name + details + exceptions + start date) → it appears in the list.
6. Toggle ✓ then ✗ then clear → state persists across a hard refresh (confirms SQLite write). Confirm a `data/habitator.db` file exists locally.
7. Use `‹` to go to a previous day and back-fill an entry → it saves to that date.
8. Open habit detail → completion %, current streak, longest streak, and the heatmap render and match the entries you set.
9. Archive a habit → it leaves Today but its detail/history remains. Delete → it and its entries are gone.
10. `GET /api/export` returns a JSON dump.
11. `npm run build` then `npm start` serves successfully.

**On Railway (after first push):**
12. Connect repo, add volume at `/data`, set the three env vars, deploy.
13. Visit the URL → login → add a habit, record a few entries.
14. **Persistence test (critical):** trigger a redeploy (push a trivial commit) → after redeploy, confirm the habit and entries are **still there** (validates the volume config).
15. On iPhone Safari: open the subdomain, "Add to Home Screen", launch from the icon → opens standalone (no Safari chrome), login persists.

---

## Open decisions already made (so the executor doesn't re-ask)
- **Tracking model:** binary **pass/fail** per day, blank = exception (not counted). ✔
- **Stats:** completion %, current streak, longest streak, plus a heatmap on habit detail. ✔
- **Stack:** Next.js 14 + TS + Tailwind. ✔
- **Storage:** SQLite + Railway volume (not Postgres). ✔
- **Auth:** single password + `httpOnly` cookie + middleware gate. ✔
- **No** reminders, **no** spreadsheet import, **no** service worker in v1. ✔
- **Theme:** dark, minimalist, mobile-first; green=pass / red=fail. ✔
```
