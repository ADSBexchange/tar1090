// @ts-check
// Our map-layer stack. osm_adsbx / esri are aggregator-gated (absent on a plain local recipe), so those
// self-skip when absent rather than flaking.
const { test } = require("@playwright/test");
const { expect, gotoGlobe, mapLayerNames } = require("../lib/globe");

test.beforeEach(async ({ page }) => {
  await gotoGlobe(page);
});

test("the OpenLayers map has a non-empty layer collection", async ({ page }) => {
  expect((await mapLayerNames(page)).length).toBeGreaterThan(0);
});

test("our OpenFreeMap base layers are present", async ({ page }) => {
  const openFreeMap = (await mapLayerNames(page)).filter((n) => typeof n === "string" && n.startsWith("OpenFreeMap"));
  expect(openFreeMap.length).toBeGreaterThan(0);
});

test("ESRI base layer (aggregator-gated)", async ({ page }) => {
  const names = await mapLayerNames(page);
  test.skip(!names.includes("esri"), "aggregator-gated layer absent on this deployment");
  expect(names).toContain("esri");
});

test("ADSBx custom OSM layer (aggregator-gated)", async ({ page }) => {
  const names = await mapLayerNames(page);
  test.skip(!names.includes("osm_adsbx"), "aggregator-gated layer absent on this deployment");
  expect(names).toContain("osm_adsbx");
});
