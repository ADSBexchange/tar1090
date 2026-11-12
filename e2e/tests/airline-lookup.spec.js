// @ts-check
// Upstream airline-lookup feature (wiedehopf), on by default like upstream.
const { test } = require("@playwright/test");
const { expect, gotoGlobe, readGlobal, trackOperatorsFetch } = require("../lib/globe");
const { openMap } = require("../lib/map-page");

const OPERATORS_TIMEOUT_MS = 20_000;
const PLANE_TIMEOUT_MS = 30_000;
const AIRLINER = {
  hex: "a1b2c3", flight: "AAL123  ", lat: 39.8, lon: -98.6, alt_baro: 35000, alt_geom: 35800, gs: 450, track: 270,
  seen_pos: 0.4, seen: 0.4, messages: 1000, rssi: -20, type: "adsb_icao", category: "A3",
};

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

test("selecting an airliner shows its airline in the info panel", async ({ page, baseURL }) => {
  await openMap(page, baseURL, { aircraft: [AIRLINER] });
  await page.waitForFunction(() => typeof operatorsCache !== "undefined" && operatorsCache && Object.keys(operatorsCache).length > 0, null, { timeout: OPERATORS_TIMEOUT_MS });
  await page.waitForFunction((hex) => typeof g !== "undefined" && g.planes && g.planes[hex], AIRLINER.hex, { timeout: PLANE_TIMEOUT_MS });

  await page.evaluate((hex) => selectPlaneByHex(hex, { follow: false }), AIRLINER.hex);
  await expect(page.locator("#selected_airline_row")).toBeVisible();
  await expect(page.locator("#selected_airline")).toHaveText(/american/i);
});
