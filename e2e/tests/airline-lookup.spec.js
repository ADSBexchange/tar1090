// @ts-check
// Upstream airline-lookup feature (wiedehopf) + our flag gating. Our fork defaults airlineLookup=false,
// so by default: the operators DB is never fetched and the airline row stays hidden. Flipping the flag
// (via config.js, our normal override mechanism) turns the feature on.
const { test } = require("@playwright/test");
const { expect, gotoGlobe, readGlobal, enableAirlineLookupViaConfig, trackOperatorsFetch } = require("../lib/globe");

test.describe.configure({ mode: "serial" });

test.describe("airline lookup OFF by default (our default)", () => {
  test("airlineLookup global defaults to false", async ({ page }) => {
    await gotoGlobe(page);
    expect(await readGlobal(page, "airlineLookup")).toBe(false);
  });

  test("operators.js is NOT fetched when the flag is off", async ({ page }) => {
    const ops = trackOperatorsFetch(page);
    await gotoGlobe(page);
    await page.waitForTimeout(2000); // let afterFirstFetch()'s db loads run
    expect(ops.requested).toBe(false);
  });

  test("the highlight-popup airline row stays hidden", async ({ page }) => {
    await gotoGlobe(page);
    // Row exists in the DOM (from upstream markup) but is display:none unless the flag reveals it.
    await expect(page.locator("#highlighted_airline_row")).toBeHidden();
  });
});

test.describe("airline lookup ON (flag flipped via config.js)", () => {
  test("airlineLookup global reads true after config override", async ({ page }) => {
    await enableAirlineLookupViaConfig(page);
    await gotoGlobe(page);
    expect(await readGlobal(page, "airlineLookup")).toBe(true);
  });

  test("operators.js IS requested when the flag is on", async ({ page }) => {
    const ops = trackOperatorsFetch(page);
    await enableAirlineLookupViaConfig(page);
    await gotoGlobe(page);
    await page.waitForTimeout(2000);
    // Deployment may or may not ship operators.js (comes from tar1090-db / AX-941). We assert the app
    // ATTEMPTS the fetch — that proves the gate opened; the file's presence is a deployment concern.
    expect(ops.requested).toBe(true);
  });
});
