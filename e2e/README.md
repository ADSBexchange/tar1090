# Globe ad-lifecycle E2E (Playwright)

Deterministic end-to-end checks for the panel-driven Freestar ad lifecycle on the globe
(`panel-watcher.js` → `ad-controller.js` → `ad-slots.js`). Asserts the **wiring** — a slot is
requested when its panel opens, torn down when it closes, and **not re-requested** when content
changes while the panel stays open — by wrapping `freestar.newAdSlots`/`deleteAdSlots` and counting
the calls our code makes (append-only counts, so the assertions are device-independent and robust to
the app's update loop). It does **not** read the GPT slot registry (`getSlots()`) — Freestar
device-gates GPT slot creation for desktop-only sizes, so a slot our code correctly requested may
never register at mobile width — and it does **not** assert ad fills (a live auction is
non-deterministic).

Panels are opened/closed by toggling their container's `display` in-page — exactly the transition
the watcher observes — so the suite needs **no aircraft, no Docker, and no VPN**. It runs against any
deployed URL, which makes it CI-friendly.

## Run

### One-shot (recommended) — installs deps + browser on first run, then runs

```powershell
cd e2e
.\run-playwright.ps1                 # against local stack (http://localhost:8080)
.\run-playwright.ps1 -Dev            # against https://globe.dev.adsbexchange.com (needs VPN)
.\run-playwright.ps1 -Project mobile -Headed
.\run-playwright.ps1 -Grep "switching"
```

No manual setup — the script runs `npm install` (only if `node_modules` is missing) and
`playwright install chromium` (idempotent) before the suite.

### Manual (npm scripts)

```bash
cd e2e
npm install
npm run install:browser        # one-time: downloads Playwright's Chromium

# against the local Docker recipe (default BASE_URL=http://localhost:8080)
npm run e2e

# against dev (needs network access to globe.dev — i.e. VPN)
npm run e2e:dev
# or explicitly:
BASE_URL=https://globe.dev.adsbexchange.com npx playwright test
```

Projects: `desktop` (1400×900) and `mobile` (Pixel 5, <768px). Target `?mobile` behaviour with
`--project=mobile`.

## What it covers

- At load, no ad requested into a closed panel (drawer / left panel absent).
- Each panel (Full Details, selected-aircraft left panel, sidebar, map overlay): open → slot(s)
  requested; close → slot(s) destroyed.
- **Switch**: deselect+select in one tick (panel stays open) → the ad is kept, **zero** extra
  `newAdSlots` calls.
- Re-open after a real close → a fresh request.
- Static mobile-footer unit is not requested on desktop (no hidden impression).
- Subscribers: no ad stack loads at all.

## Notes

- `fixtures/aircraft.json` is **not used by the CI suite** — it's a convenience fixture for anyone
  doing a manual "real aircraft selection" run against the local recipe (stop readsb, drop it into
  `readsb-output/`).
- CI against **dev** needs VPN/VPC reachability to `globe.dev`; a public prod URL later would need none.
- `node_modules/` and reports are gitignored; this folder is dev-only and never deploys
  (tar1090's `install.sh` copies only `html/`).
