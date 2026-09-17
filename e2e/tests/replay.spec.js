// @ts-check
// Replay — real UI flow, dev-only (self-skips local; local globe_history is ephemeral/incomplete).
// Clicking PLAY (#replayPlay) is what triggers loadReplay — a programmatic replayJump does not.
const { test } = require("@playwright/test");
const { expect, gotoGlobe, isDevTarget } = require("../lib/globe");

// Must be a date dev's globe_history currently has (rolling retention — 2023-01-09 has aged out; confirm
// in the dev UI before relying). Kept in one place so the fast-follower can point it at a live date.
const REPLAY_DATE = "2023-09-01";
const DATE_PATH = REPLAY_DATE.replace(/-/g, "/");

test.beforeEach(() => {
  test.skip(!isDevTarget(), `historical replay needs dev globe_history; run with -Dev`);
});

test(`replaying ${REPLAY_DATE} loads that day's data and an aircraft's dated trace`, async ({ page }) => {
  await gotoGlobe(page);
  await page.locator("#RP").click();
  await expect(page.locator("#replayBar")).toBeVisible();

  await page.evaluate((d) => { replay.dateText = d; }, REPLAY_DATE); // calendar clicks are impractical; PLAY is the real trigger

  const dayLoad = page.waitForRequest(new RegExp(`globe_history/${DATE_PATH}/`), { timeout: 30_000 });
  await page.locator("#replayPlay").click();
  expect((await dayLoad).url()).toContain(`/globe_history/${DATE_PATH}/`);

  await page.waitForFunction(() => typeof g !== "undefined" && g.planesOrdered && g.planesOrdered.length > 0, null, { timeout: 30_000 });

  // Selecting an aircraft must request its trace for the SAME date (regression check: correct replay date).
  const traceLoad = page.waitForRequest(new RegExp(`globe_history/${DATE_PATH}/traces/.*trace_full_.*\\.json`), { timeout: 30_000 });
  await page.evaluate(() => { selectPlaneByHex(g.planesOrdered[0].icao, { follow: false }); });
  expect((await traceLoad).url()).toMatch(new RegExp(`globe_history/${DATE_PATH}/traces/.+/trace_full_.+\\.json`));
});
