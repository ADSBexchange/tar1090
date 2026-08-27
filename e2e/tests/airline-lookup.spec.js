// @ts-check
// Upstream airline-lookup feature (wiedehopf). We run it on-by-default, same as upstream: the operators
// DB (operators.js) loads at startup and callsign→airline resolution is available. These specs assert
// the wiring loads; the actual airline text is data-driven (needs a live airliner) so it's a manual
// walkthrough case, not asserted here.
const { test } = require("@playwright/test");
const { expect, gotoGlobe, readGlobal, trackOperatorsFetch } = require("../lib/globe");

test.describe.configure({ mode: "serial" });

test("airlineLookup is enabled by default (like upstream)", async ({ page }) => {
  await gotoGlobe(page);
  expect(await readGlobal(page, "airlineLookup")).toBe(true);
});

test("operators.js (the airline DB) is fetched at startup", async ({ page }) => {
  const ops = trackOperatorsFetch(page);
  await gotoGlobe(page);
  await page.waitForTimeout(2000); // let afterFirstFetch()'s db loads run
  expect(ops.requested).toBe(true);
});

test("the airline lookup function and cache are present in page scope", async ({ page }) => {
  await gotoGlobe(page);
  expect(await readGlobal(page, "typeof lookupAirlineForCallsign")).toBe("function");
  // operatorsCache is null until the DB resolves; the binding must exist regardless.
  expect(await readGlobal(page, "typeof operatorsCache")).not.toBe("undefined");
});

test("the selected-aircraft panel has an airline row for the feature to fill", async ({ page }) => {
  await gotoGlobe(page);
  await expect(page.locator("#selected_airline_row")).toBeAttached();
});
