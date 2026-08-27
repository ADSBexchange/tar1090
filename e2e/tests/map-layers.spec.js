// @ts-check
// Our map-layer stack. We keep a richer layer set than upstream (OpenFreeMap raster/vector variants,
// ESRI, GIBS, plus deployment-gated ADSBx/premium layers). Some layers are gated behind aggregator
// mode or API keys and only appear on a full ADSBx deployment; those assertions self-skip when absent
// rather than flaking on the local recipe.
const { test } = require("@playwright/test");
const { expect, gotoGlobe, mapLayerNames } = require("../lib/globe");

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ page }) => {
  await gotoGlobe(page);
});

test("the OpenLayers map has a non-empty layer collection", async ({ page }) => {
  const names = await mapLayerNames(page);
  expect(names.length).toBeGreaterThan(0);
});

test("our OpenFreeMap base layers are present (fork layer stack loaded)", async ({ page }) => {
  const names = await mapLayerNames(page);
  const openFreeMap = names.filter((n) => typeof n === "string" && n.startsWith("OpenFreeMap"));
  expect(openFreeMap.length).toBeGreaterThan(0);
});

test("ESRI base layers are present", async ({ page }) => {
  const names = await mapLayerNames(page);
  expect(names).toContain("esri");
});

test("ADSBx custom OSM layer is aggregator-gated (documented, not forced)", async ({ page }, testInfo) => {
  // osm_adsbx is only pushed when the deployment runs in aggregator mode (our globe). On a plain
  // recipe it is absent by design — skip rather than fail so this documents the gating.
  const names = await mapLayerNames(page);
  test.skip(!names.includes("osm_adsbx"), "aggregator-gated layer absent on this deployment");
  expect(names).toContain("osm_adsbx");
});
