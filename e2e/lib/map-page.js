const { waitForGlobeReady } = require("./globe");

const DEFAULT_BASE_URL = "http://localhost:8091";
const DEFAULT_CENTRE = { lat: 39.8, lon: -98.6 };
const DEFAULT_ZOOM = 8;
const FULL_TABLE_RELEASE_SHARE = 0.05;
const RIGHT_CONTROLS = ["#header_side", "#header_top", "#map_container .ol-zoom", "#map_container .layer-switcher"];

function feedOf(aircraft) {
  return { now: Date.now() / 1000, resultCount: aircraft.length, ptime: 1, aircraft };
}

async function routeFeed(page, baseURL, aircraft) {
  const origin = new URL(baseURL || DEFAULT_BASE_URL).origin;
  await page.route((url) => url.origin !== origin, (route) => route.abort());
  await page.route(/\/re-api\/?\?/, (route) => route.fulfill({ json: feedOf(aircraft) }));
  await page.route(/\/data\/aircraft\.json/, (route) => route.fulfill({ json: feedOf(aircraft) }));
}

async function openMap(page, baseURL, { aircraft = [], centre = DEFAULT_CENTRE, query = "" } = {}) {
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

async function touchSender(page) {
  const cdp = await page.context().newCDPSession(page);
  return (type, touchPoints) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints });
}

module.exports = { DEFAULT_CENTRE, FULL_TABLE_RELEASE_SHARE, RIGHT_CONTROLS, feedOf, routeFeed, openMap, rectOf, touchSender };
