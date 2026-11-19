// @ts-check
// Our ADSBx globe UI: differentiators that must survive upstream uplifts, plus core controls + health.
const { test } = require("@playwright/test");
const { expect, gotoGlobe, readGlobal, captureErrors } = require("../lib/globe");
const { openMap } = require("../lib/map-page");

const FEED_ID = "e2efeed01";
const FEED_TIMEOUT_MS = 20_000;
const FEED_REQUEST_PATH = "uuid/?feed=";
const FILTER_UUID_PARAM = "filter_uuid";

test("no uncaught JS errors from our own code on load", async ({ page }) => {
  const errors = captureErrors(page);
  await gotoGlobe(page);
  await page.waitForTimeout(3000); // let init + first fetch + db loads settle
  expect(errors.ourErrors, `our-code errors:\n${errors.ourErrors.join("\n---\n")}`).toEqual([]);
});

test("Replay button opens the replay bar (our replay entry point)", async ({ page, baseURL }) => {
  await openMap(page, baseURL);
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

test("Tailvision link follows enableTailvisionLink", async ({ page }) => {
  await gotoGlobe(page);
  const link = page.locator("#tailvision_link");
  await expect(link).toHaveText("Tailvision app");
  await expect(link).toHaveAttribute("href", "https://www.adsbexchange.com/maps/tailvision/");
  await expect(link).toHaveAttribute("target", "_blank");
  const display = await link.evaluate((el) => getComputedStyle(el).display);
  if (await readGlobal(page, "enableTailvisionLink")) expect(display).not.toBe("none");
  else expect(display).toBe("none");
});

test("?feed= opens that feed and leaves filterUuid unset", async ({ page }) => {
  const requested = [];
  page.on("request", (request) => requested.push(request.url()));
  const feedRequest = page.waitForRequest((request) => request.url().includes(FEED_REQUEST_PATH + FEED_ID), { timeout: FEED_TIMEOUT_MS });
  await page.goto("/?feed=" + FEED_ID, { waitUntil: "commit" });
  const state = await page
    .waitForFunction(() => { try { return uuid ? JSON.stringify({ uuid, filterUuid }) : null; } catch { return null; } }, null, { timeout: FEED_TIMEOUT_MS })
    .then((handle) => handle.jsonValue())
    .catch(() => null);
  expect(state, "uuid should be populated from ?feed").not.toBeNull();
  expect(JSON.parse(state)).toEqual({ uuid: [FEED_ID], filterUuid: null });
  await feedRequest;
  expect(requested.filter((url) => url.includes(FILTER_UUID_PARAM))).toEqual([]);
});
