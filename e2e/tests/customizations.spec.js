// @ts-check
// Our ADSBx differentiators that must survive every upstream uplift. If an upstream merge silently
// drops one of these, a spec here goes red.
const { test } = require("@playwright/test");
const { expect, gotoGlobe, readGlobal } = require("../lib/globe");

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ page }) => {
  await gotoGlobe(page);
});

test("Replay button (#RP) is present — our replay entry point", async ({ page }) => {
  await expect(page.locator("#RP")).toBeAttached();
});

test("Replay bar (#replayBar) markup exists for our custom replay flow", async ({ page }) => {
  await expect(page.locator("#replayBar")).toBeAttached();
});

test("Most Watched button (#MW) is present — our Interesting Flights entry point", async ({ page }) => {
  await expect(page.locator("#MW")).toBeAttached();
});

test("our Most Watched feature-flag globals exist", async ({ page }) => {
  expect(await readGlobal(page, "typeof enableMostWatchedFilter")).toBe("boolean");
  expect(await readGlobal(page, "typeof enableMostWatchedClickTracking")).toBe("boolean");
});

test("our route-API globals exist (route enrichment differentiator)", async ({ page }) => {
  // useRouteAPI drives the setFlight batching block we preserved through the merge.
  expect(await readGlobal(page, "typeof useRouteAPI")).not.toBe("undefined");
  expect(await readGlobal(page, "typeof g.route_check_array")).toBe("object");
});

test("Active Dates flag global exists (history-nav differentiator)", async ({ page }) => {
  expect(await readGlobal(page, "typeof enableActiveDates")).toBe("boolean");
});
