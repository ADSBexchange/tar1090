// @ts-check
// Shared helpers for the tar1090 E2E suite.
const { expect } = require("@playwright/test");

// tar1090 top-level `let` globals aren't on window; eval() resolves the lexical binding in page scope.
async function readGlobal(page, name) {
  return page.evaluate((n) => { try { return eval(n); } catch { return undefined; } }, name);
}

async function waitForGlobeReady(page) {
  await page.waitForSelector("#RP", { state: "attached" });
  await page.waitForFunction(() => typeof OLMap !== "undefined" && OLMap && typeof OLMap.getLayers === "function", null, { timeout: 30_000 });
}

async function gotoGlobe(page, { query = "" } = {}) {
  // domcontentloaded, not "load": the globe keeps ad/streaming connections open so "load" never fires.
  await page.goto(`/${query}`, { waitUntil: "domcontentloaded" });
  await waitForGlobeReady(page);
}

// Dev/prod target. Historical-replay data (fixed dates) only exists there; local history is ephemeral.
function isDevTarget() {
  const base = process.env.BASE_URL || "";
  return process.env.TARGET === "dev" || (base && !base.includes("localhost") && !base.includes("127.0.0.1"));
}

// Leaf layer names in the live map. tar1090 nests base layers inside ol.layer.Group, so recurse.
async function mapLayerNames(page) {
  return page.evaluate(() => {
    const names = [];
    const walk = (layers) => layers.forEach((l) => {
      if (l && typeof l.getLayers === "function") walk(l.getLayers().getArray());
      else if (l && typeof l.get === "function" && l.get("name") != null) names.push(l.get("name"));
    });
    if (typeof OLMap !== "undefined" && OLMap) walk(OLMap.getLayers().getArray());
    return names;
  });
}

// Uncaught JS exceptions from our own origin. Origin-filtered (not a vendor allowlist) so ad/consent/
// identity noise is excluded automatically; cross-origin errors are masked as "Script error." with no stack.
function captureErrors(page) {
  const origin = new URL(process.env.BASE_URL || "http://localhost:8080").origin;
  const state = {
    pageErrors: [],
    get ourErrors() {
      return this.pageErrors.filter((e) => (e.stack || "").includes(origin)).map((e) => `${e.message}\n${e.stack}`);
    },
  };
  page.on("pageerror", (err) => state.pageErrors.push({ message: err.message, stack: err.stack || "" }));
  return state;
}

// Whether operators.js (the airline DB) was requested during the run.
function trackOperatorsFetch(page) {
  const state = { requested: false };
  page.on("request", (req) => { if (/\/operators\.js(\?|$)/.test(req.url())) state.requested = true; });
  return state;
}

module.exports = { expect, readGlobal, waitForGlobeReady, gotoGlobe, isDevTarget, mapLayerNames, captureErrors, trackOperatorsFetch };
