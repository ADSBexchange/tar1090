const { waitForGlobeReady } = require("./globe");
const { binCraftOf, zstdBinCraftOf } = require("./bincraft-feed");

const BINCRAFT_REQUEST = /[?&]binCraft(&|$)/;
const ZSTD_REQUEST = /[?&]zstd(&|$)/;
const TURNSTILE_EXP_KEY = "globeTurnstileExp";
const TURNSTILE_EXP_LIFE_S = 86400;

const DEFAULT_CENTRE = { lat: 39.8, lon: -98.6 };
const DEFAULT_ZOOM = 8;

function feedOf(aircraft) {
  return { now: Date.now() / 1000, resultCount: aircraft.length, ptime: 1, aircraft };
}

async function routeFeed(page, baseURL, aircraft) {
  const origin = new URL(baseURL).origin;
  await page.route((url) => url.origin !== origin, (route) => route.abort());
  await page.route(/\/re-api\/?\?/, (route) => {
    const url = route.request().url();
    if (!BINCRAFT_REQUEST.test(url)) return route.fulfill({ json: feedOf(aircraft) });
    const body = ZSTD_REQUEST.test(url) ? zstdBinCraftOf(aircraft) : binCraftOf(aircraft, Date.now());
    return route.fulfill({ status: 200, contentType: "application/octet-stream", body });
  });
  await page.route(/\/data\/traces\//, (route) => route.fulfill({ status: 404, json: { error: "not found" } }));
  await page.route(/\/data\/aircraft\.json/, (route) => route.fulfill({ json: feedOf(aircraft) }));
}

async function openMap(page, baseURL, { aircraft = [], centre = DEFAULT_CENTRE, query = "" } = {}) {
  await page.addInitScript(({ key, life }) => { try { localStorage.setItem(key, String(Math.floor(Date.now() / 1000) + life)); } catch (e) {} }, { key: TURNSTILE_EXP_KEY, life: TURNSTILE_EXP_LIFE_S });
  await routeFeed(page, baseURL, aircraft);
  await page.goto(`/?lat=${centre.lat}&lon=${centre.lon}&zoom=${DEFAULT_ZOOM}${query}`, { waitUntil: "domcontentloaded" });
  await waitForGlobeReady(page);
}

async function rectOf(page, selector) {
  return page.evaluate((sel) => {
    const element = document.querySelector(sel);
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
  }, selector);
}

module.exports = { DEFAULT_CENTRE, feedOf, routeFeed, openMap, rectOf };
