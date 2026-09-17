// @ts-check
// History navigation: the calendar is driven by an active-dates lookup.
const { test } = require("@playwright/test");
const { expect, gotoGlobe, readGlobal } = require("../lib/globe");

test("Active Dates feature flag is enabled", async ({ page }) => {
  await gotoGlobe(page);
  expect(await readGlobal(page, "enableActiveDates")).toBe(true);
});

test("history looks up active-dates for an aircraft", async ({ page }) => {
  await gotoGlobe(page);
  const hex = "abc123";
  const activeDates = page.waitForRequest(new RegExp(`/active-dates/${hex}`), { timeout: 15_000 });
  await page.evaluate((h) => ActivityHistory.fetchHistoricalDates(h), hex);
  expect((await activeDates).url()).toContain(`/active-dates/${hex}`);
});
