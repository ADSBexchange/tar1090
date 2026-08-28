// @ts-check
// Automatable subset of the tar1090 manual smoke test (Confluence "tar1090 - Functional Testing").
const { test } = require("@playwright/test");
const { expect, gotoGlobe, readGlobal, mapLayerNames, captureErrors } = require("../lib/globe");

test("no uncaught JS errors from our own code on load", async ({ page }) => {
  const errors = captureErrors(page);
  await gotoGlobe(page);
  await page.waitForTimeout(3000); // let init + first fetch + db loads settle
  expect(errors.ourErrors, `our-code errors:\n${errors.ourErrors.join("\n---\n")}`).toEqual([]);
});

// RainViewer intentionally not asserted — AX-856/AX-1068 remove it.
test("OpenFreeMap base layers are present", async ({ page }) => {
  await gotoGlobe(page);
  const names = await mapLayerNames(page);
  for (const layer of ["OpenFreeMapLiberty", "OpenFreeMapPositron", "OpenFreeMapBright", "OpenFreeMapDark", "OpenFreeMapFiord"]) {
    expect(names, `missing base layer ${layer}`).toContain(layer);
  }
});

// Our differentiator: routes off by default AND not enableable by a visitor (routeApiUrl empty).
test("routes are disabled by default and cannot be enabled by a visitor", async ({ page }) => {
  await gotoGlobe(page);
  expect(await readGlobal(page, "useRouteAPI")).toBe(false);
  expect(await readGlobal(page, "routeApiUrl")).toBe("");
});

// Open only — our close path reloads the page (verified manually); historical playback is dev-only.
test("replay button opens the replay bar", async ({ page }) => {
  await gotoGlobe(page);
  await page.locator("#RP").click();
  await expect(page.locator("#replayBar")).toBeVisible();
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
