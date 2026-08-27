// @ts-check
// Shared helpers for the ADSBx tar1090 E2E suite. Everything here is DOM/global-driven so specs need
// no live aircraft: the differentiator UI (Replay/Most-Watched buttons, replay bar) is static markup,
// the feature flags are top-level `let` globals, and the map layers live in the OpenLayers map.

const { expect } = require("@playwright/test");

// tar1090 top-level `let` globals are visible by bare name inside page.evaluate (same realm), but NOT
// as window.* properties. eval(name) resolves the lexical binding; returns undefined if not declared.
async function readGlobal(page, name) {
  return page.evaluate((n) => {
    try {
      // eslint-disable-next-line no-eval
      return eval(n);
    } catch {
      return undefined;
    }
  }, name);
}

// Wait until the app has booted enough to assert on: our Replay button is static markup that is always
// present once index.html parses, and OLMap is the OpenLayers map created during init.
async function waitForGlobeReady(page) {
  await page.waitForSelector("#RP", { state: "attached" });
  await page.waitForFunction(() => typeof OLMap !== "undefined" && OLMap && typeof OLMap.getLayers === "function", null, {
    timeout: 30_000,
  });
}

async function gotoGlobe(page, { query = "" } = {}) {
  // No ?icao → nothing selected, so the update loop never re-shows a panel mid-test.
  await page.goto(`/${query}`);
  await waitForGlobeReady(page);
}

// Collect the layer names present in the live OpenLayers map (base layers + overlays).
async function mapLayerNames(page) {
  return page.evaluate(() =>
    (typeof OLMap !== "undefined" && OLMap ? OLMap.getLayers().getArray() : [])
      .map((l) => (l && typeof l.get === "function" ? l.get("name") : undefined))
      .filter((n) => n != null)
  );
}

// Whether a network request for the operators DB (operators.js) was made during the run.
function trackOperatorsFetch(page) {
  const state = { requested: false, urls: [] };
  page.on("request", (req) => {
    if (/\/operators\.js(\?|$)/.test(req.url())) {
      state.requested = true;
      state.urls.push(req.url());
    }
  });
  return state;
}

module.exports = {
  expect,
  readGlobal,
  waitForGlobeReady,
  gotoGlobe,
  mapLayerNames,
  trackOperatorsFetch,
};
