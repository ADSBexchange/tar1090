// @ts-check
const { test } = require("@playwright/test");
const { expect } = require("../lib/globe");
const { openMap } = require("../lib/map-page");

const FIXTURE_HEX = "a1b2c3";
const GROUND_HEX = "d4e5f6";
const READY_TIMEOUT_MS = 30000;
const RE_API_PATH = "/re-api/";
const BINCRAFT_PARAM = "binCraft";
const JSON_PARAM = "json";
const FIXTURE = {
  hex: FIXTURE_HEX,
  flight: "TEST123 ",
  lat: 39.8,
  lon: -98.6,
  alt_baro: 35000,
  alt_geom: 35800,
  gs: 450,
  track: 270,
  seen: 0.4,
  seen_pos: 0.4,
  messages: 1000,
  rssi: -20,
  category: "A3",
};
const GROUND_FIXTURE = { hex: GROUND_HEX, flight: "GND456  ", alt_baro: "ground", seen: 0.4, messages: 500, rssi: -20, category: "A1" };

test("the fixture aircraft reaches the page with its fields", async ({ page, baseURL }) => {
  const reApiUrls = [];
  page.on("request", (request) => { if (request.url().includes(RE_API_PATH)) reApiUrls.push(request.url()); });
  await openMap(page, baseURL, { aircraft: [FIXTURE, GROUND_FIXTURE] });
  await page.waitForFunction((hex) => !!(typeof g !== "undefined" && g.planes && g.planes[hex]), FIXTURE_HEX, { timeout: READY_TIMEOUT_MS });
  const plane = await page.evaluate((hex) => {
    const { flight, position, altitude, gs, track, category } = g.planes[hex];
    return { flight, position, altitude, gs, track, category };
  }, FIXTURE_HEX);
  expect(plane.flight).toBe("TEST123 ");
  expect(plane.position).toEqual([-98.6, 39.8]);
  expect(plane.altitude).toBe(35000);
  expect(plane.gs).toBe(450);
  expect(plane.track).toBe(270);
  expect(plane.category).toBe("A3");
  const usesBinCraft = await page.evaluate(() => typeof binCraft !== "undefined" && binCraft);
  const expectedParam = usesBinCraft ? BINCRAFT_PARAM : JSON_PARAM;
  expect(reApiUrls.some((url) => url.includes(expectedParam))).toBe(true);
  expect(await page.locator("#update_error").evaluate((element) => getComputedStyle(element).display)).not.toBe("block");
});

test("a ground aircraft without a position decodes as ground with no position", async ({ page, baseURL }) => {
  await openMap(page, baseURL, { aircraft: [FIXTURE, GROUND_FIXTURE] });
  await page.waitForFunction((hex) => typeof g !== "undefined" && g.planes && g.planes[hex], GROUND_HEX, { timeout: READY_TIMEOUT_MS });
  const plane = await page.evaluate((hex) => {
    const { altitude, position } = g.planes[hex];
    return { altitude, position };
  }, GROUND_HEX);
  expect(plane.altitude).toBe("ground");
  expect(plane.position == null).toBe(true);
});
