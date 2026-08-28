// @ts-check
// Our ADSBx differentiators that must survive every upstream uplift.
const { test } = require("@playwright/test");
const { expect, gotoGlobe, readGlobal } = require("../lib/globe");

test.beforeEach(async ({ page }) => {
  await gotoGlobe(page);
});

test("Replay button + bar are present (our replay entry point)", async ({ page }) => {
  await expect(page.locator("#RP")).toBeAttached();
  await expect(page.locator("#replayBar")).toBeAttached();
});

test("Most Watched button is present (our Interesting Flights entry point)", async ({ page }) => {
  await expect(page.locator("#MW")).toBeAttached();
});

// Exact expected state — flipping any of these (enabling or disabling a feature) fails the test.
test("our feature flags are in their expected state", async ({ page }) => {
  expect(await readGlobal(page, "enableMostWatchedFilter")).toBe(true);
  expect(await readGlobal(page, "enableMostWatchedClickTracking")).toBe(true);
  expect(await readGlobal(page, "enableActiveDates")).toBe(true);
  expect(await readGlobal(page, "airlineLookup")).toBe(true);
  expect(await readGlobal(page, "useRouteAPI")).toBe(false); // routes disabled — differentiator
  expect(await readGlobal(page, "routeApiUrl")).toBe("");
});
