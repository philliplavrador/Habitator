# tests/ — the Playwright UI checks

`npm run test:e2e`. The rule about *when* they must pass lives in the root
`CLAUDE.md` ("UI changes — prove it with Playwright"); this file is the how.

## Running them

```
docker start habitator-pg     # the app needs its Postgres, so the tests do too
npm run test:e2e              # next build, then the suite on its own :3210
npm run test:e2e:rerun        # skip the rebuild (iterating on a test)
npm run test:e2e:rerun -- --project=phone --headed    # watch it drive
npm run test:e2e:report                               # report + screenshots
```

**It runs `next start`, never `next dev`, and never reuses a server it didn't
start.** Under a dozen parallel workers the dev server compiles on demand and
will serve a page before its stylesheet is ready — a blank white screen that
looks exactly like the breakage these tests exist to catch. That's why
`test:e2e` builds first, and why `test:e2e:rerun` needs a fresh `.next` to be
telling you the truth.

`E2E_BASE_URL=https://…` points the run at an already-running instance and skips
starting anything. The cookie is still minted locally, so that target has to
share this machine's `SESSION_SECRET`.

## How the tests are logged in

`auth.setup.ts` runs first (every project `dependencies: ['setup']`). It:

1. finds — or creates — a user called `e2e` in `DATABASE_URL`, and
2. **signs a session token with `SESSION_SECRET`** and writes it as a Playwright
   `storageState` cookie.

No password is involved anywhere: the `e2e` row's `password_hash` is a
deliberately unusable string, so that account exists *only* down this path.
`POST /api/login` would have meant putting the owner's real password in the test
environment for no gain — the middleware only ever checks the signature.

The separate user is not incidental. Habitator is `user_id`-scoped end to end,
so `e2e` gives the specs an empty, predictable app ("No chats yet.") and keeps
them off the owner's dev data — `/tasks` alone rewrites rows on every read.

## The two specs

- **`chat-home.spec.ts`** — the chat header's navigation: the left drawer
  (geometry, New chat, Escape/backdrop), the "Go to" popup (its two entries,
  where it hangs, what it navigates to), and the absence of any log-out or
  account UI on every screen.
- **`ui-health.spec.ts`** — the same four "is it broken" checks over every route
  in its `ROUTES` list: it renders with no console error, nothing scrolls
  sideways, no control sits outside the `app-shell` column, every control clears
  28px. **Add new routes to that list.** Each run attaches a full-page
  screenshot per route per viewport, so the report is also a contact sheet.

## Gotchas worth knowing before you write one

- **Measuring a framer-motion panel.** Don't poll for "it stopped moving" — a
  spring's first frames haven't moved yet either, so you'll happily measure the
  panel at its off-screen *start*. Retry against the expected resting position
  instead (`restingBox` in `chat-home.spec.ts`).
- **Measure against `data-testid="app-shell"`, not the viewport.** The app is a
  centred 448px column; on desktop its left edge is nowhere near `x = 0`, and
  the drawer is pinned to the column, not the window.
- **`toHaveCount(0)` is the honest way to assert something is gone.**
  `not.toBeVisible()` passes just as happily when your selector is wrong.
- **Console-error assertions need a noise filter.** `next dev` and the service
  worker log things that mean nothing; `CONSOLE_NOISE` holds the known ones. Add
  to it only for genuine noise — never to silence a real error.
- **No pixel snapshots, on purpose.** This app rewrites its own UI through the
  build agent; a screenshot baseline would be stale by the next deploy and would
  train everyone to run `--update-snapshots` without looking.
