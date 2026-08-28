# tar1090 (ADSBx fork) — Playwright E2E

End-to-end tests for the ADSBx tar1090 globe. They guard our differentiators through upstream
(wiedehopf) uplifts and codify the automatable parts of the manual functional-test doc
(Confluence "tar1090 - Functional Testing"). DOM/global-driven — they read tar1090's config globals,
the OpenLayers layer collection, and network requests; no fixed aircraft required.

## Prerequisite for the LOCAL target: bring the stack up first

The specs run against a served globe. For `localhost:8080` the tar1090 + API V2 Docker recipe must be
running, pointed at this worktree:

```powershell
# in C:\Projects\adsbexchange-docker-recipes\tar1090-api-v2
#   .env: TAR1090_PATH -> this worktree, TAR1090_DB_PATH -> a local tar1090-db clone (airline/type/reg)
.\scripts\start.ps1          # Globe UI on http://localhost:8080 ; stop with .\scripts\stop.ps1
```

- **VPN to dev** is needed for the live beast feed (aircraft data).
- The **airline / type / registration** specs need the metadata DB served at `/db-current` (the recipe
  mounts `TAR1090_DB_PATH`).
- The **`-Dev` target** needs no local stack — it hits the deployed dev globe (VPN required) and is the
  only way to run the **historical-replay** specs (they self-skip on local, since local history is
  ephemeral).

## Run

```powershell
cd e2e
.\run-playwright.ps1              # local stack (http://localhost:8080), desktop + mobile
.\run-playwright.ps1 -Dev        # https://globe.dev.adsbexchange.com (VPN) — also runs replay + ads-manual context
.\run-playwright.ps1 -Project desktop -Grep "airline" -Headed
```

First run auto-installs deps + Chromium. Or via npm: `npm run e2e` (local), `npm run e2e:dev` (dev).
View the last report: `npx playwright show-report`.

See `tests/` for what's covered — each spec is small and self-documenting.

## Ads are manual (by design)

Ads drive revenue and can't be meaningfully automated: fills and rendering are non-deterministic (a live
auction) and need the Freestar stack, which only loads on a real deployment. Automating only the wiring
would give false confidence. So there is **no ad automation** — `ads-manual.spec.js` shows up as a
skipped reminder in every run, and the actual verification is the manual checklist on dev (per the
Confluence functional-test doc). Do it whenever ad markup or the globe bundle changes.

## Notes

- Some map layers are deployment-gated (aggregator mode / premium API keys / API keys). Those specs
  self-skip when the layer is absent rather than flaking.
- Premium map layers are verified manually (signed-in premium user) — not automated.
- `operators.js` (airline DB) comes from tar1090-db, not this repo; the recipe mounts a local clone.
- `node_modules/` and reports are gitignored; this `e2e/` folder is dev-only and never deploys
  (`install.sh` copies only `html/`).
