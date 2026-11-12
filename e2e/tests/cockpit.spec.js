// @ts-check
const { test } = require("@playwright/test");
const { expect, readGlobal } = require("../lib/globe");
const { expectNoUiOverlap, uiLayoutProblems } = require("../lib/ui-layout-check");
const { DEFAULT_CENTRE, FULL_TABLE_RELEASE_SHARE, openMap, rectOf, touchSender } = require("../lib/map-page");
const { FAKE_AD_CLASS, fillAdContainers } = require("../lib/ad-containers");

const ORIGIN_HEX = "a1b2c3";
const OTHER_HEX = "d4e5f6";
const CENTRE = DEFAULT_CENTRE;
const FLAT_MAP_SAMPLE_MS = 300;
const PREVIEW_LOAD_SAMPLE_MS = 2500;
const SCREENSHOT_DIR = process.env.COCKPIT_SCREENSHOT_DIR || "";
const MAP_CONTROLS = "#header_top, #altitude_chart, .ol-zoom, .ol-attribution, .layer-switcher";
const PROBE_LABEL = "probe";
const PROBE_HEIGHT_PX = 8;
const PROBE_WIDTH_FACTOR = 2;
const LIVE_MODE = !!process.env.COCKPIT_LIVE;
const HISTORY_BUTTON = "#show_trace";
const HISTORY_SECTION = "#history_collapse";
const COCKPIT_BUTTON = "#cockpit_view";
const HISTORY_VIEW_TITLE = "Not available in this view";
const INFO_PANEL_TEXT = '#selected_infoblock .infoHeading[title^="The speed of the aircraft over the ground"]';
const AD_BLOCKS = [
  { id: "FreeStarVideoAdContainer_Slider", width: 300, height: 170, place: "video" },
  { id: "fs-sticky-footer", width: 320, height: 50, place: "footer" },
];
const ADS_OVER_COCKPIT = AD_BLOCKS.map((block) => `#${block.id}`);
const IN_MAP_AD = `#tracking_leaderboard_container .${FAKE_AD_CLASS}`;
const IN_MAP_AD_CLOSE_BAR = '#tracking_leaderboard_container > [title="Close"]';
const LAYOUT_SIZES = {
  desktop: [{ width: 1400, height: 900 }, { width: 800, height: 900 }],
  mobile: [null],
};

function aircraft(hex, lat, lon, flight) {
  return {
    hex, flight, lat, lon, alt_baro: 35000, alt_geom: 35800, gs: 450, track: 270,
    seen_pos: 0.4, seen: 0.4, messages: 1000, rssi: -20, type: "adsb_icao", category: "A3",
  };
}

const AIRCRAFT = [
  aircraft(ORIGIN_HEX, CENTRE.lat, CENTRE.lon, "TEST123 "),
  aircraft(OTHER_HEX, CENTRE.lat + 0.1, CENTRE.lon + 0.2, "TEST456 "),
];

async function adBoxes(page) {
  return page.evaluate((adClass) => Array.from(document.querySelectorAll(`.${adClass}`))
    .map((el) => el.getBoundingClientRect())
    .filter((rect) => rect.width > 0 && rect.height > 0)
    .map((rect) => ({ left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom })), FAKE_AD_CLASS);
}

function overlaps(a, b) {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

async function openGlobe(page, baseURL) {
  await page.addInitScript(() => {
    window.__cockpitLoads = 0;
    document.addEventListener("load", (e) => {
      const target = e.target;
      if (target && target.tagName === "IFRAME" && target.closest && target.closest("#cockpit_overlay") && !/^about:/.test(target.src)) window.__cockpitLoads++;
    }, true);
  });
  await openMap(page, baseURL, { aircraft: AIRCRAFT, centre: CENTRE });
  await page.waitForFunction((hex) => typeof g !== "undefined" && g.planes && !!g.planes[hex], ORIGIN_HEX, { timeout: 30_000 });
  await fillAdContainers(page, AD_BLOCKS);
}

async function selectPlane(page, hex) {
  await page.evaluate((h) => { if (!SelectedPlane || SelectedPlane.icao !== h) selectPlaneByHex(h, { follow: false }); }, hex);
  await page.waitForFunction((h) => typeof SelectedPlane !== "undefined" && SelectedPlane && SelectedPlane.icao === h, hex);
}

async function openCockpit(page) {
  await selectPlane(page, ORIGIN_HEX);
  const button = page.locator("#cockpit_view");
  await expect(button).toBeVisible();
  await button.click();
  await expect(page.locator("#map_container > #cockpit_overlay.is-open")).toBeVisible();
  await expectOpeningSettled(page);
}

async function expectOpeningSettled(page) {
  await expect(page.locator("#map_container > #cockpit_overlay.is-open")).toHaveCSS("opacity", "1");
  await expect.poll(() => page.evaluate(() => document.getAnimations()
    .filter((animation) => animation.playState === "running")
    .filter((animation) => {
      const target = animation.effect && animation.effect.target;
      return !!target && !!target.closest && !!target.closest("#map_container");
    }).length)).toBe(0);
}

async function expectClosed(page) {
  await expect(page.locator("#cockpit_overlay.is-open")).toHaveCount(0);
  await expect(page.locator("#cockpit_overlay")).toHaveCount(0, { timeout: 2_000 });
}

async function expectFillsMapColumn(page) {
  const overlay = await rectOf(page, "#cockpit_overlay");
  const map = await rectOf(page, "#map_container");
  const panel = await rectOf(page, "#selected_infoblock");
  const rail = await rectOf(page, "#header_side");
  expect(overlay).not.toBeNull();
  expect(Math.abs(overlay.top - map.top)).toBeLessThanOrEqual(1);
  expect(Math.abs(overlay.bottom - map.bottom)).toBeLessThanOrEqual(1);
  if (panel && panel.width > 0 && panel.height >= map.height - 2) expect(Math.abs(overlay.left - panel.right)).toBeLessThanOrEqual(1);
  else expect(Math.abs(overlay.left - map.left)).toBeLessThanOrEqual(1);
  if (rail && rail.width > 0) expect(Math.abs(overlay.right - rail.left)).toBeLessThanOrEqual(1);
  else expect(Math.abs(overlay.right - map.right)).toBeLessThanOrEqual(1);
  const centre = await page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y);
    return !!el && !!el.closest("#cockpit_overlay");
  }, { x: (overlay.left + overlay.right) / 2, y: (overlay.top + overlay.bottom) / 2 });
  expect(centre, "the cockpit is on top in the middle of the map column").toBe(true);
}

async function expectExitClear(page) {
  const exit = await rectOf(page, "#cockpit_overlay .cockpit-exit");
  expect(exit && exit.width > 0).toBeTruthy();
  for (const ad of await adBoxes(page)) expect(overlaps(exit, ad), `Exit overlaps an ad at ${JSON.stringify(ad)}`).toBe(false);
  const hit = await page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y);
    return !!el && el.classList.contains("cockpit-exit");
  }, { x: (exit.left + exit.right) / 2, y: (exit.top + exit.bottom) / 2 });
  expect(hit, "Exit is the top element under its own centre").toBe(true);
}

async function shownMapControls(page) {
  return page.evaluate((sel) => Array.from(document.querySelectorAll(sel))
    .filter((el) => {
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0 || getComputedStyle(el).visibility === "hidden") return false;
      const x = Math.min(Math.max((r.left + r.right) / 2, 0), innerWidth - 1);
      const y = Math.min(Math.max((r.top + r.bottom) / 2, 0), innerHeight - 1);
      const top = document.elementFromPoint(x, y);
      return !!top && (el === top || el.contains(top));
    })
    .map((el) => el.id || el.className), MAP_CONTROLS);
}

async function visibleExits(page) {
  const own = await page.locator("#cockpit_overlay .cockpit-exit").isVisible();
  const framed = await page.frameLocator("#cockpit_overlay iframe").locator("#exit").isVisible();
  return [own, framed].filter(Boolean).length;
}

async function expectSingleExit(page) {
  await expect(page.locator("#cockpit_overlay .cockpit-exit")).toBeVisible();
  await expect(page.frameLocator("#cockpit_overlay iframe").locator("#exit")).toBeHidden();
  expect(await visibleExits(page), "one exit control on screen").toBe(1);
}

async function historyBelowCockpit(page) {
  const cockpit = await rectOf(page, COCKPIT_BUTTON);
  const history = await rectOf(page, HISTORY_BUTTON);
  return { cockpitHeight: cockpit.height, historyOffset: history.top - cockpit.top, historyLeft: history.left };
}

async function signIn(page) {
  await page.goto("/dev/login");
}

async function pressOn(page, selector, inset = null, released = true) {
  const target = page.locator(selector).first();
  const box = await target.boundingBox();
  expect(box, `${selector} is on screen`).not.toBeNull();
  if (inset !== null) { box.width = inset * 2; box.height = inset * 2; }
  await page.evaluate(({ x, y, released }) => {
    const el = document.elementFromPoint(x, y);
    const at = { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y };
    const pointer = Object.assign({ pointerType: "touch", isPrimary: true }, at);
    el.dispatchEvent(new PointerEvent("pointerdown", pointer));
    if (!released) return;
    el.dispatchEvent(new PointerEvent("pointerup", pointer));
    el.dispatchEvent(new MouseEvent("click", at));
  }, { x: box.x + box.width / 2, y: box.y + box.height / 2, released });
}

test.describe("Cockpit view in the map frame", () => {
  test("opens inside the map column, beside the side panel and the button rail, once", async ({ page, baseURL }) => {
    await openGlobe(page, baseURL);
    await openCockpit(page);
    await expectFillsMapColumn(page);
    await expectExitClear(page);
    await expect(page.frameLocator("#cockpit_overlay iframe").getByRole("link", { name: /become a feeder/i })).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.__cockpitLoads)).toBe(1);
    if (SCREENSHOT_DIR) await page.screenshot({ path: `${SCREENSHOT_DIR}/cockpit-in-map-frame-${test.info().project.name}.png` });
  });

  test("at a narrow window it still fills only the map column with Exit clear", async ({ page, baseURL }) => {
    test.skip(test.info().project.name !== "desktop", "the phone project is already narrow");
    await page.setViewportSize({ width: 800, height: 900 });
    await openGlobe(page, baseURL);
    await openCockpit(page);
    await expectFillsMapColumn(page);
    await expectExitClear(page);
    if (SCREENSHOT_DIR) await page.screenshot({ path: `${SCREENSHOT_DIR}/cockpit-in-map-frame-narrow-800w.png` });
  });

  test("the preview's own buttons are not covered by anything on the page", async ({ page, baseURL }) => {
    await openGlobe(page, baseURL);
    await openCockpit(page);
    const frame = page.frameLocator("#cockpit_overlay iframe");
    for (const name of [/become a feeder/i, /sign in/i]) {
      const button = frame.getByRole("button", { name }).or(frame.getByRole("link", { name })).first();
      await expect(button).toBeVisible();
      const box = await button.boundingBox();
      const top = await page.evaluate(({ x, y }) => {
        const el = document.elementFromPoint(x, y);
        return el ? el.tagName : null;
      }, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
      expect(top, `${name} is under the cockpit frame, not a page element`).toBe("IFRAME");
      for (const ad of await adBoxes(page)) expect(overlaps({ left: box.x, top: box.y, right: box.x + box.width, bottom: box.y + box.height }, ad)).toBe(false);
    }
  });

  test("the preview shows one exit, the shim's, and Escape inside it still closes it", async ({ page, baseURL }) => {
    await openGlobe(page, baseURL);
    await openCockpit(page);
    await expect(page.frameLocator("#cockpit_overlay iframe").getByRole("link", { name: /become a feeder/i })).toBeVisible();
    await expectSingleExit(page);
    await expect(page.frameLocator("#cockpit_overlay iframe").locator("#film")).toHaveJSProperty("disablePictureInPicture", true);
    await page.frameLocator("#cockpit_overlay iframe").locator("#feeder").focus();
    await page.keyboard.press("Escape");
    await expectClosed(page);
  });

  test("while the preview loads, its own Close never shows beside the shim's", async ({ page, baseURL }) => {
    await openGlobe(page, baseURL);
    await selectPlane(page, ORIGIN_HEX);
    const shown = await page.evaluate((sampleMs) => new Promise((resolve) => {
      const frames = [];
      const started = performance.now();
      document.getElementById("cockpit_view").click();
      const tick = () => {
        const iframe = document.querySelector("#cockpit_overlay iframe");
        const doc = iframe && iframe.contentDocument;
        const close = doc && doc.getElementById("exit");
        if (close) frames.push(!close.hidden && close.getClientRects().length > 0);
        if (performance.now() - started < sampleMs) requestAnimationFrame(tick);
        else resolve(frames);
      };
      requestAnimationFrame(tick);
    }), PREVIEW_LOAD_SAMPLE_MS);
    expect(shown.length, "frames sampled with the preview loaded").toBeGreaterThan(0);
    expect(shown.filter(Boolean).length, "frames showing the preview's own Close").toBe(0);
  });

  test("the live cockpit shows one exit, the shim's, and Escape inside it still closes it", async ({ page, baseURL }) => {
    test.skip(!LIVE_MODE, "live mode is checked separately with COCKPIT_LIVE=1");
    await signIn(page);
    await openGlobe(page, baseURL);
    await openCockpit(page);
    const frame = page.frameLocator("#cockpit_overlay iframe");
    await expect(frame.locator("#stage")).toHaveCount(1);
    await expectSingleExit(page);
    if (SCREENSHOT_DIR) await page.screenshot({ path: `${SCREENSHOT_DIR}/cockpit-live-signed-in-${test.info().project.name}.png` });
    await frame.locator("body").press("Escape");
    await expectClosed(page);
  });

  test("nothing on the open cockpit overlaps or crowds another control", async ({ page, baseURL }) => {
    for (const size of LAYOUT_SIZES[test.info().project.name]) {
      if (size) await page.setViewportSize(size);
      await openGlobe(page, baseURL);
      await openCockpit(page);
      await expect(page.frameLocator("#cockpit_overlay iframe").getByRole("link", { name: /become a feeder/i })).toBeVisible();
      await expectNoUiOverlap(page, { within: "#cockpit_overlay", ignore: ADS_OVER_COCKPIT.concat(COCKPIT_BUTTON), coveredBy: "#cockpit_overlay" });
    }
  });

  test("an element placed over the open cockpit is still reported", async ({ page, baseURL }) => {
    await openGlobe(page, baseURL);
    await openCockpit(page);
    const exit = await rectOf(page, "#cockpit_overlay .cockpit-exit");
    await page.evaluate(({ label, width, height, centreX, centreY }) => {
      const probe = document.createElement("button");
      probe.textContent = label;
      probe.style.cssText = `position:fixed;z-index:2147483647;width:${width}px;height:${height}px;left:${centreX - width / 2}px;top:${centreY - height / 2}px`;
      document.body.appendChild(probe);
    }, { label: PROBE_LABEL, width: exit.width * PROBE_WIDTH_FACTOR, height: PROBE_HEIGHT_PX, centreX: exit.left + exit.width / 2, centreY: exit.top + exit.height / 2 });
    const problems = await uiLayoutProblems(page, { within: "#cockpit_overlay", ignore: ADS_OVER_COCKPIT, coveredBy: "#cockpit_overlay" });
    expect(problems.some((problem) => problem.includes(PROBE_LABEL) && problem.includes("cockpit-exit")), problems.join(", ")).toBe(true);
  });

  test("the map buttons and map controls sit under it while open and come back after", async ({ page, baseURL }) => {
    await openGlobe(page, baseURL);
    await selectPlane(page, ORIGIN_HEX);
    const before = await shownMapControls(page);
    expect(before.length, "the map shows its own controls before the cockpit opens").toBeGreaterThan(0);
    await openCockpit(page);
    expect(await shownMapControls(page), "no map control shows over or beside the cockpit").toEqual([]);
    await expect(page.locator("#header_side")).toBeHidden();
    await expect(page.locator("#selected_infoblock")).toBeVisible();
    await page.locator("#cockpit_overlay .cockpit-exit").click();
    await expectClosed(page);
    await expect(page.locator("#header_side")).toBeVisible();
    expect(await shownMapControls(page)).toEqual(before);
  });

  test("Exit, Escape and Back close it", async ({ page, baseURL }) => {
    await openGlobe(page, baseURL);
    await openCockpit(page);
    await page.locator("#cockpit_overlay .cockpit-exit").click();
    await expectClosed(page);
    expect(await readGlobal(page, "SelectedPlane && SelectedPlane.icao")).toBe(ORIGIN_HEX);
    await expect(page.locator("#cockpit_view")).toBeFocused();

    await openCockpit(page);
    await page.locator("#cockpit_overlay .cockpit-exit").focus();
    await page.keyboard.press("Escape");
    await expectClosed(page);
    expect(await readGlobal(page, "SelectedPlane && SelectedPlane.icao")).toBe(ORIGIN_HEX);

    await openCockpit(page);
    const before = await page.evaluate(() => history.length);
    await page.goBack();
    await expectClosed(page);
    expect(await page.evaluate(() => history.length)).toBe(before);
  });

  test("closing another way takes back the history entry it added", async ({ page, baseURL }) => {
    await openGlobe(page, baseURL);
    await openCockpit(page);
    const state = await page.evaluate(() => history.state);
    expect(state && typeof state.cockpit).toBe("number");
    await page.locator("#cockpit_overlay .cockpit-exit").click();
    await expectClosed(page);
    await page.waitForFunction(() => !(history.state && history.state.cockpit));
  });

  test("closing straight after tar1090 rewrites the address bar still takes back the cockpit's entry", async ({ page, baseURL }) => {
    await openGlobe(page, baseURL);
    await selectPlane(page, ORIGIN_HEX);
    await expect.poll(() => page.evaluate((hex) => location.search.includes(`icao=${hex}`), ORIGIN_HEX)).toBe(true);
    await page.evaluate(() => {
      history.pushState({ e2e: "one-back" }, "", location.href);
      history.pushState({ e2e: "before-cockpit" }, "", location.href);
    });
    await openCockpit(page);
    await page.evaluate(() => {
      toggleFollow(true);
      lastAddressBarUpdate = 0;
      updateAddressBarString = null;
      updateAddressBar();
      document.querySelector("#cockpit_overlay .cockpit-exit").click();
    });
    await expectClosed(page);
    await expect.poll(() => page.evaluate(() => history.state)).toEqual({ e2e: "before-cockpit" });
    await page.goBack();
    await expect.poll(() => page.evaluate(() => history.state)).toEqual({ e2e: "one-back" });
  });

  for (const panel of [
    { name: "the info panel", selector: INFO_PANEL_TEXT },
  ]) {
    test(`a press on ${panel.name} closes it`, async ({ page, baseURL }) => {
      await openGlobe(page, baseURL);
      await openCockpit(page);
      const visible = await page.locator(panel.selector).first().isVisible();
      test.skip(!visible, `${panel.name} is not shown at this size`);
      const box = await page.locator(panel.selector).first().boundingBox();
      const underAd = await page.evaluate(({ x, y, adClass }) => {
        const el = document.elementFromPoint(x, y);
        return !!el && !!el.closest(`.${adClass}`);
      }, { x: box.x + box.width / 2, y: box.y + box.height / 2, adClass: FAKE_AD_CLASS });
      test.skip(underAd, `an ad covers ${panel.name} at this size`);
      await pressOn(page, panel.selector);
      await expectClosed(page);
    });
  }

  test("one click on History in the info panel closes it and opens History", async ({ page, baseURL }) => {
    await openGlobe(page, baseURL);
    await openCockpit(page);
    const history = page.locator(HISTORY_BUTTON);
    test.skip(!(await history.isVisible()), "History is not shown at this size");
    await history.click({ force: true });
    await expectClosed(page);
    await expect(page.locator(HISTORY_SECTION)).toBeVisible();
  });

  test("one tap on History in the info panel closes it and opens History", async ({ page, baseURL }) => {
    test.skip(test.info().project.name !== "mobile", "a tap needs a touch screen");
    await openGlobe(page, baseURL);
    await openCockpit(page);
    const history = page.locator(HISTORY_BUTTON);
    test.skip(!(await history.isVisible()), "History is not shown at this size");
    await history.tap({ force: true });
    await expectClosed(page);
    await expect(page.locator(HISTORY_SECTION)).toBeVisible();
  });

  test("while open, Cockpit view stays in place greyed out, so a press that closes it moves nothing in the panel", async ({ page, baseURL }) => {
    await openGlobe(page, baseURL);
    await openCockpit(page);
    const history = page.locator(HISTORY_BUTTON);
    test.skip(!(await history.isVisible()), "History is not shown at this size");
    await expect(page.locator(COCKPIT_BUTTON)).toBeVisible();
    await expect(page.locator(COCKPIT_BUTTON)).toBeDisabled();
    const before = await rectOf(page, HISTORY_BUTTON);
    await pressOn(page, HISTORY_BUTTON, null, false);
    await expectClosed(page);
    await expect(page.locator(COCKPIT_BUTTON)).toBeEnabled();
    expect(await rectOf(page, HISTORY_BUTTON)).toEqual(before);
  });

  test("in History, Cockpit view stays in place greyed out with History not moving, and leaving History brings it back", async ({ page, baseURL }) => {
    await openGlobe(page, baseURL);
    await selectPlane(page, ORIGIN_HEX);
    const cockpit = page.locator(COCKPIT_BUTTON);
    const history = page.locator(HISTORY_BUTTON);
    test.skip(!(await history.isVisible()), "History is not shown at this size");
    await expect(cockpit).toBeEnabled();
    const before = await historyBelowCockpit(page);
    await history.click();
    await expect(page.locator(HISTORY_SECTION)).toBeVisible();
    await expect.poll(() => readGlobal(page, "showTrace")).toBeTruthy();
    await expect(cockpit).toBeVisible();
    await expect(cockpit).toBeDisabled();
    await expect(cockpit).toHaveAttribute("title", HISTORY_VIEW_TITLE);
    expect(await historyBelowCockpit(page)).toEqual(before);
    await cockpit.click({ force: true });
    await expect(page.locator("#cockpit_overlay")).toHaveCount(0);
    await history.click();
    await expect.poll(() => readGlobal(page, "showTrace")).toBeFalsy();
    await expect(cockpit).toBeEnabled();
    await expect(cockpit).not.toHaveAttribute("title", HISTORY_VIEW_TITLE);
    expect(await historyBelowCockpit(page)).toEqual(before);
  });

  test("the button rail is hidden while the cockpit is open and the cockpit meets the panel", async ({ page, baseURL }) => {
    await openGlobe(page, baseURL);
    await page.evaluate(() => { const s = document.getElementById("sidebar_container"); if (s && getComputedStyle(s).display === "none" && typeof toggleSidebarVisibility === "function") toggleSidebarVisibility(); });
    const shown = await page.locator("#sidebar_container").isVisible();
    test.skip(!shown, "the sidebar is not shown at this size");
    await openCockpit(page);
    await expect(page.locator("#header_side")).toBeHidden();
    const overlay = await rectOf(page, "#cockpit_overlay");
    const panel = await rectOf(page, "#sidebar_container");
    expect(Math.abs(overlay.right - panel.left)).toBeLessThanOrEqual(1);
  });

  test("pressing the edge tab hides the panel and the cockpit widens to the screen edge, still open", async ({ page, baseURL }) => {
    await openGlobe(page, baseURL);
    await page.evaluate(() => { const s = document.getElementById("sidebar_container"); if (s && getComputedStyle(s).display === "none" && typeof toggleSidebarVisibility === "function") toggleSidebarVisibility(); });
    const shown = await page.locator("#sidebar_container").isVisible();
    test.skip(!shown, "the sidebar is not shown at this size");
    await openCockpit(page);
    const before = await rectOf(page, "#cockpit_overlay");
    await page.locator("#toggle_sidebar_button").click();
    await expect(page.locator("#sidebar_container")).toBeHidden();
    await expect.poll(async () => (await rectOf(page, "#cockpit_overlay")).right).toBeGreaterThan(before.right + 1);
    const after = await rectOf(page, "#cockpit_overlay");
    const viewport = page.viewportSize();
    expect(Math.abs(after.right - viewport.width)).toBeLessThanOrEqual(1);
    await expect(page.locator("#map_container > #cockpit_overlay.is-open")).toBeVisible();
  });

  test("on a phone, pressing the edge tab shows the panel and the cockpit narrows to it, still open", async ({ page, baseURL }) => {
    test.skip(test.info().project.name !== "mobile", "the desktop project starts with the panel shown");
    await openGlobe(page, baseURL);
    await expect(page.locator("#sidebar_container")).toBeHidden();
    await openCockpit(page);
    const before = await rectOf(page, "#cockpit_overlay");
    await page.locator("#toggle_sidebar_button").click();
    await expect(page.locator("#sidebar_container")).toBeVisible();
    await expect(page.locator("#map_container > #cockpit_overlay.is-open")).toHaveCount(1);
    await expect(page.locator("#sidebar_container")).not.toHaveClass(/sidebar-sliding/);
    const after = await rectOf(page, "#cockpit_overlay");
    expect(after.right).toBeLessThan(before.right - 1);
    const panel = await rectOf(page, "#sidebar_container");
    expect(Math.abs(after.right - panel.left)).toBeLessThanOrEqual(1);
  });

  test("dragging the panel edge keeps the cockpit open and resizes it with the panel", async ({ page, baseURL }) => {
    test.skip(test.info().project.name !== "desktop", "the edge is dragged with a mouse");
    await openGlobe(page, baseURL);
    await page.evaluate(() => { const s = document.getElementById("sidebar_container"); if (s && getComputedStyle(s).display === "none" && typeof toggleSidebarVisibility === "function") toggleSidebarVisibility(); });
    await expect(page.locator("#sidebar_container")).toBeVisible();
    await openCockpit(page);
    const before = await rectOf(page, "#cockpit_overlay");
    const edge = await rectOf(page, "#splitter");
    const x = edge.left + edge.width / 2;
    const y = edge.top + edge.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x - 120, y, { steps: 8 });
    await page.mouse.up();
    await expect(page.locator("#map_container > #cockpit_overlay.is-open")).toHaveCount(1);
    await expect.poll(async () => (await rectOf(page, "#cockpit_overlay")).width).toBeLessThan(before.width - 60);
    const after = await rectOf(page, "#cockpit_overlay");
    const panel = await rectOf(page, "#sidebar_container");
    expect(Math.abs(after.right - panel.left)).toBeLessThanOrEqual(1);
  });

  test("dragging the panel out to the full table closes it cleanly, keeping the aircraft selected", async ({ page, baseURL }) => {
    await openGlobe(page, baseURL);
    const mobile = test.info().project.name === "mobile";
    if (mobile) {
      await page.locator("#toggle_sidebar_button").tap();
      await expect(page.locator("#sidebar_container")).not.toHaveClass(/sidebar-sliding/);
    }
    await expect(page.locator("#sidebar_container")).toBeVisible();
    await openCockpit(page);
    const screen = page.viewportSize().width;
    const tab = await rectOf(page, "#toggle_sidebar_control");
    const x = tab.left + tab.width / 2;
    const y = tab.top + tab.height / 2;
    const farLeft = screen * FULL_TABLE_RELEASE_SHARE;
    if (mobile) {
      const send = await touchSender(page);
      await send("touchStart", [{ x, y }]);
      for (let i = 1; i <= 10; i++) await send("touchMove", [{ x: x + (farLeft - x) * i / 10, y }]);
      await send("touchEnd", []);
    } else {
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(farLeft, y, { steps: 10 });
      await page.mouse.up();
    }
    await expect.poll(() => readGlobal(page, "mapIsVisible")).toBe(false);
    await expectClosed(page);
    await expect(page.locator("#map_container")).not.toHaveClass(/cockpit-open/);
    expect(await readGlobal(page, "SelectedPlane && SelectedPlane.icao")).toBe(ORIGIN_HEX);
    await expect(page.locator(COCKPIT_BUTTON)).toBeDisabled();
  });

  test("a press in the sidebar closes it", async ({ page, baseURL }) => {
    await openGlobe(page, baseURL);
    await page.evaluate(() => { const s = document.getElementById("sidebar_container"); if (s && getComputedStyle(s).display === "none" && typeof toggleSidebarVisibility === "function") toggleSidebarVisibility(); });
    const shown = await page.locator("#sidebar_container").isVisible();
    test.skip(!shown, "the sidebar is not shown at this size");
    await openCockpit(page);
    await pressOn(page, "#sidebar_canvas", 12);
    await expectClosed(page);
  });

  test("a press on an ad keeps it open", async ({ page, baseURL }) => {
    await openGlobe(page, baseURL);
    await openCockpit(page);
    for (const id of AD_BLOCKS.map((block) => `#${block.id} .${FAKE_AD_CLASS}`)) {
      await pressOn(page, id);
      await expect(page.locator("#cockpit_overlay.is-open")).toHaveCount(1);
    }
    if (await readGlobal(page, "onMobile")) {
      await expect(page.locator(IN_MAP_AD)).toBeHidden();
      return;
    }
    for (const selector of [IN_MAP_AD, IN_MAP_AD_CLOSE_BAR]) {
      await expect(page.locator(selector)).toBeVisible();
      await pressOn(page, selector);
      await expect(page.locator("#cockpit_overlay.is-open"), selector).toHaveCount(1);
    }
  });

  test("selecting another aircraft closes it without putting the old one back", async ({ page, baseURL }) => {
    await openGlobe(page, baseURL);
    await openCockpit(page);
    await page.evaluate((h) => selectPlaneByHex(h, { follow: false }), OTHER_HEX);
    await expectClosed(page);
    expect(await readGlobal(page, "SelectedPlane && SelectedPlane.icao")).toBe(OTHER_HEX);
  });

  test("resizing keeps it filling the map column without reloading the frame", async ({ page, baseURL }) => {
    await openGlobe(page, baseURL);
    await openCockpit(page);
    const size = page.viewportSize();
    await page.setViewportSize({ width: Math.round(size.width * 0.8), height: size.height });
    await expect(async () => expectFillsMapColumn(page)).toPass({ timeout: 5000 });
    await expectExitClear(page);
    if (SCREENSHOT_DIR) await page.screenshot({ path: `${SCREENSHOT_DIR}/cockpit-in-map-frame-${test.info().project.name}-${Math.round(size.width * 0.8)}w.png` });
    await page.setViewportSize(size);
    await expect(async () => expectFillsMapColumn(page)).toPass({ timeout: 5000 });
    expect(await page.evaluate(() => window.__cockpitLoads)).toBe(1);
  });

  test("the cockpit's right edge follows the panel while it slides, both ways", async ({ page, baseURL }) => {
    await openGlobe(page, baseURL);
    if (test.info().project.name === "mobile") {
      await page.locator("#toggle_sidebar_button").tap();
      await expect(page.locator("#sidebar_container")).not.toHaveClass(/sidebar-sliding/);
    }
    await openCockpit(page);
    for (let i = 0; i < 2; i++) {
      const frames = await page.evaluate(() => new Promise((resolve) => {
        const panel = document.getElementById("sidebar_container");
        const overlay = document.getElementById("cockpit_overlay");
        const out = [];
        document.getElementById("toggle_sidebar_button").click();
        const started = performance.now();
        const tick = () => {
          if (panel.classList.contains("sidebar-sliding")) out.push(panel.getBoundingClientRect().left - overlay.getBoundingClientRect().right);
          if (performance.now() - started < 600) requestAnimationFrame(tick);
          else resolve(out);
        };
        requestAnimationFrame(tick);
      }));
      expect(frames.length).toBeGreaterThan(0);
      for (const gap of frames) expect(Math.abs(gap)).toBeLessThanOrEqual(2);
      await expect(page.locator("#map_container > #cockpit_overlay.is-open")).toBeVisible();
    }
  });

  test("sliding the panel during the map dive keeps the cockpit fading in", async ({ page, baseURL }) => {
    await openGlobe(page, baseURL);
    await selectPlane(page, ORIGIN_HEX);
    await expect(page.locator(COCKPIT_BUTTON)).toBeEnabled();
    const opacities = await page.evaluate(() => new Promise((resolve) => {
      const map = document.getElementById("map_container");
      const seen = [];
      let slideStarted = false;
      document.getElementById("cockpit_view").click();
      const tick = () => {
        const overlay = document.getElementById("cockpit_overlay");
        if (!slideStarted && overlay && overlay.classList.contains("is-open")) {
          slideStarted = true;
          document.getElementById("toggle_sidebar_button").click();
        }
        if (map.classList.contains("panel-sliding")) seen.push(Number(getComputedStyle(overlay).opacity));
        if (slideStarted && seen.length > 0 && !map.classList.contains("panel-sliding")) resolve(seen);
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }));
    expect(opacities.length).toBeGreaterThan(0);
    expect(Math.max(...opacities), "the cockpit is still fading in, not snapped opaque").toBeLessThan(1);
  });

  test("rotating the phone keeps it filling the map column without reloading the frame", async ({ page, baseURL }) => {
    test.skip(test.info().project.name !== "mobile", "rotation is a phone case");
    await openGlobe(page, baseURL);
    await openCockpit(page);
    const portrait = page.viewportSize();
    await page.setViewportSize({ width: portrait.height, height: portrait.width });
    await expect(async () => expectFillsMapColumn(page)).toPass({ timeout: 5000 });
    await expectExitClear(page);
    if (SCREENSHOT_DIR) await page.screenshot({ path: `${SCREENSHOT_DIR}/cockpit-in-map-frame-mobile-landscape.png` });
    await page.setViewportSize(portrait);
    await expect(async () => expectFillsMapColumn(page)).toPass({ timeout: 5000 });
    expect(await page.evaluate(() => window.__cockpitLoads)).toBe(1);
  });

  test("opens with the map dive: the map tilts and pushes in toward the aircraft, then the cockpit fades in", async ({ page, baseURL }) => {
    await openGlobe(page, baseURL);
    await selectPlane(page, ORIGIN_HEX);
    const aircraft = await page.evaluate(() => OLMap.getPixelFromCoordinate(ol.proj.fromLonLat(SelectedPlane.position)));
    const samples = await page.evaluate(() => new Promise((resolve) => {
      const out = [];
      let started = null;
      document.getElementById("cockpit_view").click();
      const tick = () => {
        const overlay = document.getElementById("cockpit_overlay");
        if (overlay && started === null) started = performance.now();
        if (overlay) {
          out.push({
            map: getComputedStyle(document.getElementById("map_canvas")).transform,
            origin: getComputedStyle(document.getElementById("map_canvas")).transformOrigin,
            overlay: Number(getComputedStyle(overlay).opacity),
            clipped: getComputedStyle(document.getElementById("map_container")).overflow === "hidden",
          });
        }
        if (started !== null && performance.now() - started > 2000) resolve(out);
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }));
    await expect(page.locator("#map_container > #cockpit_overlay.is-open")).toHaveAttribute("data-transition", "map-dive");
    expect(samples.some((sample) => sample.map !== "none" && sample.overlay === 0), "the map dives before the cockpit shows").toBe(true);
    expect(samples.some((sample) => sample.overlay > 0 && sample.overlay < 1), "the cockpit fades in").toBe(true);
    const last = samples[samples.length - 1];
    expect(samples.some((sample) => /^matrix3d/.test(sample.map)), "the map tilts during the dive").toBe(true);
    expect(samples.every((sample) => sample.map === "none" || sample.clipped), "the dive never spills outside the map area").toBe(true);
    expect(last.map, "once the cockpit covers it the map is back to how it looked").toBe("none");
    expect(last.overlay).toBe(1);
    const origin = samples.find((sample) => sample.map !== "none").origin.split(" ").map(parseFloat);
    expect(Math.abs(origin[0] - aircraft[0])).toBeLessThanOrEqual(2);
    expect(Math.abs(origin[1] - aircraft[1])).toBeLessThanOrEqual(2);
    if (SCREENSHOT_DIR) {
      await page.locator("#cockpit_overlay .cockpit-exit").click();
      await expectClosed(page);
      await page.locator("#cockpit_view").click();
      await page.locator("#map_container > #cockpit_overlay.is-open").waitFor();
      await page.waitForFunction(() => /^matrix3d/.test(getComputedStyle(document.getElementById("map_canvas")).transform));
      await page.screenshot({ path: `${SCREENSHOT_DIR}/cockpit-transition-mid-${test.info().project.name}.png` });
      await page.waitForFunction(() => {
        const opacity = Number(getComputedStyle(document.getElementById("cockpit_overlay")).opacity);
        return opacity > 0 && opacity < 1;
      });
      await page.screenshot({ path: `${SCREENSHOT_DIR}/cockpit-transition-mid2-${test.info().project.name}.png` });
    }
  });

  test("with reduced motion it is a plain fade: the map stays flat", async ({ page, baseURL }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openGlobe(page, baseURL);
    await selectPlane(page, ORIGIN_HEX);
    await page.locator("#cockpit_view").click();
    const overlay = page.locator("#map_container > #cockpit_overlay.is-open");
    await expect(overlay).toBeVisible();
    const transforms = await page.evaluate((sampleMs) => new Promise((resolve) => {
      const seen = [];
      const started = performance.now();
      const tick = () => {
        seen.push(getComputedStyle(document.getElementById("map_canvas")).transform);
        if (performance.now() - started < sampleMs) requestAnimationFrame(tick);
        else resolve(seen);
      };
      requestAnimationFrame(tick);
    }), FLAT_MAP_SAMPLE_MS);
    expect(transforms.every((transform) => transform === "none"), "the map never tilts").toBe(true);
    expect(await overlay.locator(".cockpit-inner").evaluate((el) => getComputedStyle(el).transform)).toBe("none");
    await expect(overlay).toHaveCSS("opacity", "1");
  });

  test("the close control is one circled X named Exit cockpit, in the top-right corner, keyboard usable", async ({ page, baseURL }) => {
    await openGlobe(page, baseURL);
    await openCockpit(page);
    const exit = page.getByRole("button", { name: "Exit cockpit" });
    await expect(exit).toHaveCount(1);
    await expect(exit).toHaveAttribute("title", "Exit cockpit");
    await expect(exit).toHaveText("");
    const box = await rectOf(page, "#cockpit_overlay .cockpit-exit");
    const overlay = await rectOf(page, "#cockpit_overlay");
    expect(box.width).toBeGreaterThanOrEqual(32);
    expect(box.height).toBeGreaterThanOrEqual(32);
    expect(overlay.right - box.right).toBeLessThanOrEqual(20);
    const corner = { left: box.left, top: overlay.top, right: overlay.right, bottom: overlay.top + 52 };
    const above = (await adBoxes(page)).filter((ad) => overlaps(corner, ad)).map((ad) => ad.bottom);
    const top = above.length ? Math.max(...above) : overlay.top;
    expect(box.top - top).toBeGreaterThanOrEqual(0);
    expect(box.top - top).toBeLessThanOrEqual(20);
    expect(await exit.evaluate((el) => getComputedStyle(el, "::before").maskImage || getComputedStyle(el, "::before").webkitMaskImage)).toContain("close-settings.png");
    await expectSingleExit(page);
    await exit.focus();
    await expect(exit).toBeFocused();
    await page.keyboard.press("Enter");
    await expectClosed(page);
  });

  test("the preview's Simulated flight label sits at the top centre", async ({ page, baseURL }) => {
    await openGlobe(page, baseURL);
    await openCockpit(page);
    const label = page.frameLocator("#cockpit_overlay iframe").locator(".sim-badge");
    await expect(label).toBeVisible();
    const box = await label.boundingBox();
    const frame = await rectOf(page, "#cockpit_overlay iframe");
    expect(Math.abs(box.x + box.width / 2 - (frame.left + frame.right) / 2)).toBeLessThanOrEqual(2);
    expect(box.y - frame.top).toBeLessThanOrEqual(20);
  });

  for (const motion of ["no-preference", "reduce"]) {
    test(`it is gone within 300 ms of Exit (${motion} motion)`, async ({ page, baseURL }) => {
      await page.emulateMedia({ reducedMotion: motion });
      await openGlobe(page, baseURL);
      await openCockpit(page);
      const ms = await page.evaluate(() => new Promise((resolve) => {
        const map = document.getElementById("map_container");
        const started = performance.now();
        const observer = new MutationObserver(() => {
          if (!document.getElementById("cockpit_overlay")) { observer.disconnect(); resolve(performance.now() - started); }
        });
        observer.observe(map, { childList: true });
        document.querySelector("#cockpit_overlay .cockpit-exit").click();
      }));
      expect(ms).toBeLessThanOrEqual(300);
    });
  }

  test("nothing loads from the cockpit while it is closed", async ({ page, baseURL }) => {
    const cockpitRequests = [];
    page.on("request", (req) => { if (/\/cockpit\//.test(req.url()) && !/flag\.json/.test(req.url())) cockpitRequests.push(req.url()); });
    await openGlobe(page, baseURL);
    await selectPlane(page, ORIGIN_HEX);
    await expect(page.locator("#cockpit_view")).toBeVisible();
    expect(cockpitRequests).toEqual([]);
  });
});
