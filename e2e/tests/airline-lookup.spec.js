// @ts-check
// Upstream airline-lookup feature (wiedehopf), on by default like upstream.
const { test } = require("@playwright/test");
const { expect, gotoGlobe, readGlobal, trackOperatorsFetch, isDevTarget } = require("../lib/globe");

test("airlineLookup is enabled by default", async ({ page }) => {
  await gotoGlobe(page);
  expect(await readGlobal(page, "airlineLookup")).toBe(true);
});

test("operators.js (the airline DB) is fetched at startup", async ({ page }) => {
  const ops = trackOperatorsFetch(page);
  await gotoGlobe(page);
  await page.waitForTimeout(2000);
  expect(ops.requested).toBe(true);
});

test("the airline lookup function and cache exist in page scope", async ({ page }) => {
  await gotoGlobe(page);
  expect(await readGlobal(page, "typeof lookupAirlineForCallsign")).toBe("function");
  expect(await readGlobal(page, "typeof operatorsCache")).not.toBe("undefined");
});

test("the selected-aircraft panel has an airline row", async ({ page }) => {
  await gotoGlobe(page);
  await expect(page.locator("#selected_airline_row")).toBeAttached();
});

// Real resolution via the same code path getAirline() uses, but with a deterministic callsign so it
// needs no live aircraft. Skips only if the operators DB isn't served here.
test("a known airline callsign resolves to its operator", async ({ page }) => {
  await gotoGlobe(page);
  const dbLoaded = await page
    .waitForFunction(() => typeof operatorsCache !== "undefined" && operatorsCache && Object.keys(operatorsCache).length > 0, null, { timeout: 20_000 })
    .then(() => true)
    .catch(() => false);
  test.skip(!dbLoaded, "operators DB not served here (needs db-current/operators.js)");

  const op = await page.evaluate(() => lookupAirlineForCallsign("AAL123")); // AAL = American Airlines
  expect(op, "AAL123 should resolve to an operator").toBeTruthy();
  expect(op.n).toMatch(/american/i);
});

// Live end-to-end: find an airliner in view, select it, confirm the panel shows its airline.
// Dev-only — local readsb crashes under the full dev feed (re-api 502 → 0 planes).
test("selecting a live airliner shows its airline in the info panel", async ({ page }) => {
  test.skip(!isDevTarget(), "needs a stable live feed — run with -Dev");
  await gotoGlobe(page);
  await page.waitForFunction(() => typeof operatorsCache !== "undefined" && operatorsCache && Object.keys(operatorsCache).length > 0, null, { timeout: 20_000 });

  const hex = await page.waitForFunction(() => {
    for (const p of (typeof g !== "undefined" && g.planesOrdered) || []) {
      const a = p.getAirline && p.getAirline();
      if (a && a.n) return p.icao;
    }
    return null;
  }, null, { timeout: 30_000 }).then((h) => h.jsonValue());

  await page.evaluate((h) => selectPlaneByHex(h, { follow: false }), hex);
  await expect(page.locator("#selected_airline_row")).toBeVisible();
  await expect(page.locator("#selected_airline")).not.toHaveText(/^n\/a$/);
});
