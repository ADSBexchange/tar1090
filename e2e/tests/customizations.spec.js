// @ts-check
// Our ADSBx globe UI: differentiators that must survive upstream uplifts, plus core controls + health.
const { test } = require("@playwright/test");
const { expect, gotoGlobe, readGlobal, captureErrors } = require("../lib/globe");

test("no uncaught JS errors from our own code on load", async ({ page }) => {
  const errors = captureErrors(page);
  await gotoGlobe(page);
  await page.waitForTimeout(3000); // let init + first fetch + db loads settle
  expect(errors.ourErrors, `our-code errors:\n${errors.ourErrors.join("\n---\n")}`).toEqual([]);
});

test("Replay button opens the replay bar (our replay entry point)", async ({ page }) => {
  await gotoGlobe(page);
  await expect(page.locator("#RP")).toBeAttached();
  await page.locator("#RP").click();
  await expect(page.locator("#replayBar")).toBeVisible();
});

test("Most Watched button is present (our Interesting Flights entry point)", async ({ page }) => {
  await gotoGlobe(page);
  await expect(page.locator("#MW")).toBeAttached();
});

test("leaderboard control is present and wired", async ({ page }) => {
  await gotoGlobe(page);
  await expect(page.locator("#leaderboard")).toBeAttached();
  expect(await readGlobal(page, "typeof openLeaderboard")).toBe("function");
});

test("login control is present and wired", async ({ page }) => {
  await gotoGlobe(page);
  await expect(page.locator("#ax-identity")).toBeAttached();
  expect(await readGlobal(page, "typeof openAxIdentity")).toBe("function");
});

// Exact expected state — flipping any of these (enabling or disabling a feature) fails the test.
test("our feature flags are in their expected state", async ({ page }) => {
  await gotoGlobe(page);
  expect(await readGlobal(page, "enableMostWatchedFilter")).toBe(true);
  expect(await readGlobal(page, "enableMostWatchedClickTracking")).toBe(true);
  expect(await readGlobal(page, "enableActiveDates")).toBe(true);
  expect(await readGlobal(page, "airlineLookup")).toBe(true);
  expect(await readGlobal(page, "useRouteAPI")).toBe(false); // routes disabled — differentiator
  expect(await readGlobal(page, "routeApiUrl")).toBe("");
});

// ?feed is normalized into filterUuid (upstream feedAsUuid). Assert via waitForFunction resolving, not a
// follow-up evaluate — feed mode pegs the main thread ~15s, which would block a one-shot evaluate.
test("?feed= normalizes into filterUuid", async ({ page }) => {
  await page.goto("/?feed=af289464-5906-455a-8205-5d09dcfb9065", { waitUntil: "commit" });
  const populated = await page
    .waitForFunction(() => { try { return !!filterUuid; } catch { return false; } }, null, { timeout: 20_000 })
    .then(() => true)
    .catch(() => false);
  expect(populated, "filterUuid should be populated from ?feed").toBe(true);
});
