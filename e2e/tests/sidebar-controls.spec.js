// @ts-check
const { test } = require("@playwright/test");
const { expect, readGlobal } = require("../lib/globe");
const { expectNoUiOverlap } = require("../lib/ui-layout-check");
const { FULL_TABLE_RELEASE_SHARE, RIGHT_CONTROLS, openMap, rectOf, touchSender } = require("../lib/map-page");

const EDGE_TAB = "#toggle_sidebar_control";
const EDGE_BUTTON = "#toggle_sidebar_button";
const PANEL = "#sidebar_container";
const MAP = "#map_container";
const CENTRE_TOLERANCE_PX = 2;
const EDGE_TOLERANCE_PX = 1;
const WIDTH_TOLERANCE_PX = 2;
const RELEASE_SETTLE_MS = 1000;
const MID_SLIDE_DRAG_PX = 80;
const ROTATION_RAD = 0.6;
const SIDEBAR_MIN_WIDTH_PX = 150;
const SIDEBAR_MAX_WIDTH_SHARE = 0.8;
const SPRING_BACK_RELEASE_SHARE = 0.15;
const STRETCH_TRAVEL_SHARE = 0.06;
const HALF_SCREEN_SHARE = 0.5;
const GLIDE_SAMPLE_MS = 700;
const STABLE_WIDTH_FRAMES = 10;
const HIDE_BUTTONS_KEY = "Shift+KeyH";
const KEYBOARD_ONLY_REASON = "keyboard focus follows a mouse press, a touch drag swallows the next click";
const SELECTED_AIRCRAFT = {
  hex: "a1b2c3", flight: "TEST123 ", lat: 39.8, lon: -98.6, alt_baro: 35000, alt_geom: 35800, gs: 450, track: 270,
  seen_pos: 0.4, seen: 0.4, messages: 1000, rssi: -20, type: "adsb_icao", category: "A3",
};

async function openGlobe(page, baseURL) {
  await openMap(page, baseURL);
}

test.describe("sidebar controls", () => {
  test("the rail no longer carries the sidebar carets", async ({ page, baseURL }) => {
    await openGlobe(page, baseURL);
    await expect(page.locator("#header_side #toggle_sidebar_button")).toHaveCount(0);
    await expect(page.locator("#header_side #expand_sidebar_button")).toHaveCount(0);
  });

  test("the edge tab sits on the panel's left edge, vertically centred", async ({ page, baseURL }, testInfo) => {
    await openGlobe(page, baseURL);
    if (testInfo.project.name === "mobile") await page.locator(EDGE_BUTTON).click();
    await expect(page.locator(PANEL)).toBeVisible();
    await expect(page.locator(PANEL)).not.toHaveClass(/sidebar-sliding/);
    await expect(page.locator(EDGE_TAB)).toBeVisible();
    const tab = await rectOf(page, EDGE_TAB);
    const map = await rectOf(page, MAP);
    expect(Math.abs(tab.right - map.right)).toBeLessThanOrEqual(EDGE_TOLERANCE_PX);
    const tabCentre = (tab.top + tab.bottom) / 2;
    const mapCentre = (map.top + map.bottom) / 2;
    expect(Math.abs(tabCentre - mapCentre)).toBeLessThanOrEqual(CENTRE_TOLERANCE_PX);
  });

  test("pressing the edge tab hides the panel and the tab flips, pressing again shows it", async ({ page, baseURL }, testInfo) => {
    await openGlobe(page, baseURL);
    const mobile = testInfo.project.name === "mobile";
    const button = page.locator(EDGE_BUTTON);
    const panel = page.locator(PANEL);
    if (mobile) {
      await expect(panel).toBeHidden();
      await expect(button).toHaveClass(/show_sidebar/);
      await button.click();
    }
    await expect(panel).toBeVisible();
    await expect(button).not.toHaveClass(/show_sidebar/);
    await button.click();
    await expect(panel).toBeHidden();
    await expect(button).toHaveClass(/show_sidebar/);
    await expect(page.locator(EDGE_TAB)).toBeVisible();
    await button.click();
    await expect(panel).toBeVisible();
    await expect(button).not.toHaveClass(/show_sidebar/);
  });

  test.describe("slide", () => {
    async function openReady(page, baseURL, testInfo) {
      await openGlobe(page, baseURL);
      if (testInfo.project.name === "mobile") await page.locator(EDGE_BUTTON).tap();
      await expect(page.locator(PANEL)).toBeVisible();
      await expect(page.locator(PANEL)).not.toHaveClass(/sidebar-sliding/);
    }

    async function pointerFor(page, testInfo) {
      if (testInfo.project.name !== "mobile") {
        return { move: (x, y, steps = 1) => page.mouse.move(x, y, { steps }), down: () => page.mouse.down(), up: () => page.mouse.up() };
      }
      const send = await touchSender(page);
      let at = { x: 0, y: 0 };
      let pressed = false;
      return {
        move: async (x, y, steps = 1) => {
          const from = at;
          at = { x, y };
          if (!pressed) return;
          for (let i = 1; i <= steps; i++) await send("touchMove", [{ x: from.x + (x - from.x) * i / steps, y: from.y + (y - from.y) * i / steps }]);
        },
        down: async () => { pressed = true; await send("touchStart", [at]); },
        up: async () => { pressed = false; await send("touchEnd", []); }
      };
    }

    async function sampleAfterPress(page) {
      return page.evaluate(() => new Promise((resolve) => {
        const panel = document.getElementById("sidebar_container");
        const map = document.getElementById("map_container");
        const frames = [];
        const tab = document.getElementById("toggle_sidebar_control");
        const sample = () => ({ panel: panel.getBoundingClientRect().left, visible: panel.offsetParent !== null, map: map.getBoundingClientRect().width, tab: tab.getBoundingClientRect().right });
        document.getElementById("toggle_sidebar_button").click();
        const started = performance.now();
        const tick = () => {
          frames.push(sample());
          if (performance.now() - started < 700) requestAnimationFrame(tick);
          else resolve({ frames, end: sample() });
        };
        requestAnimationFrame(tick);
      }));
    }

    test("closing resizes the map at once and slides the panel off to the right", async ({ page, baseURL }, testInfo) => {
      await openReady(page, baseURL, testInfo);
      const open = await rectOf(page, PANEL);
      const { frames, end } = await sampleAfterPress(page);
      const sliding = frames.filter((frame) => frame.visible);
      expect(sliding.some((frame) => frame.panel > open.left + 1), "the panel moves right while still on screen").toBe(true);
      expect(sliding.every((frame) => frame.map === end.map), "the map is already full width").toBe(true);
      expect(end.visible).toBe(false);
    });

    test("opening slides the panel in and shrinks the map once, at the end", async ({ page, baseURL }, testInfo) => {
      await openReady(page, baseURL, testInfo);
      await page.locator(EDGE_BUTTON).click();
      await expect(page.locator(PANEL)).toBeHidden();
      await expect(page.locator(MAP)).not.toHaveClass(/panel-sliding/);
      const full = (await rectOf(page, MAP)).width;
      const { frames, end } = await sampleAfterPress(page);
      const sliding = frames.filter((frame) => frame.visible && frame.map === full);
      expect(sliding.length, "frames where the panel is in and the map still full").toBeGreaterThan(0);
      expect(end.visible).toBe(true);
      expect(end.map).toBeLessThan(full);
    });

    test("the panel is solid while it slides, both ways", async ({ page, baseURL }, testInfo) => {
      await openReady(page, baseURL, testInfo);
      for (let i = 0; i < 2; i++) {
        const colours = await page.evaluate(() => new Promise((resolve) => {
          const panel = document.getElementById("sidebar_container");
          const seen = [];
          document.getElementById("toggle_sidebar_button").click();
          const started = performance.now();
          const tick = () => {
            if (panel.classList.contains("sidebar-sliding")) seen.push(getComputedStyle(panel).backgroundColor);
            if (performance.now() - started < 600) requestAnimationFrame(tick);
            else resolve({ seen, page: getComputedStyle(document.body).backgroundColor });
          };
          requestAnimationFrame(tick);
        }));
        expect(colours.seen.length).toBeGreaterThan(0);
        for (const colour of colours.seen) expect(colour).toBe(colours.page);
      }
    });

    test("the chevron spins half a turn as the panel slides", async ({ page, baseURL }, testInfo) => {
      await openReady(page, baseURL, testInfo);
      const button = page.locator(EDGE_BUTTON);
      const timing = await button.evaluate((el) => ({ property: getComputedStyle(el).transitionProperty, delay: getComputedStyle(el).transitionDelay }));
      expect(timing).toEqual({ property: "transform", delay: "0s" });
      await button.click();
      await expect.poll(() => button.evaluate((el) => getComputedStyle(el).transform)).toMatch(/^matrix\(-1, /);
    });

    test("the tab rides on the panel's edge while it slides, both ways", async ({ page, baseURL }, testInfo) => {
      await openReady(page, baseURL, testInfo);
      for (let i = 0; i < 2; i++) {
        const { frames } = await sampleAfterPress(page);
        const sliding = frames.filter((frame) => frame.visible);
        expect(sliding.length).toBeGreaterThan(0);
        for (const frame of sliding) expect(Math.abs(frame.tab - frame.panel)).toBeLessThanOrEqual(2);
      }
    });

    test("the map's right-hand controls ride with the panel instead of jumping when it settles", async ({ page, baseURL }, testInfo) => {
      await openReady(page, baseURL, testInfo);
      const offsets = () => page.evaluate((sels) => {
        const panel = document.getElementById("sidebar_container").getBoundingClientRect().left;
        return sels.map((sel) => panel - document.querySelector(sel).getBoundingClientRect().right);
      }, RIGHT_CONTROLS);
      const resting = await offsets();
      for (let i = 0; i < 2; i++) {
        const frames = await page.evaluate((sels) => new Promise((resolve) => {
          const panel = document.getElementById("sidebar_container");
          const out = [];
          document.getElementById("toggle_sidebar_button").click();
          const started = performance.now();
          const tick = () => {
            if (panel.classList.contains("sidebar-sliding")) {
              const left = panel.getBoundingClientRect().left;
              out.push(sels.map((sel) => left - document.querySelector(sel).getBoundingClientRect().right));
            }
            if (performance.now() - started < 600) requestAnimationFrame(tick);
            else resolve(out);
          };
          requestAnimationFrame(tick);
        }), RIGHT_CONTROLS);
        expect(frames.length).toBeGreaterThan(0);
        for (const frame of frames) frame.forEach((offset, index) => expect(Math.abs(offset - resting[index]), RIGHT_CONTROLS[index]).toBeLessThanOrEqual(2));
      }
    });

    test("the map does not move under the panel when it opens or closes", async ({ page, baseURL }, testInfo) => {
      await openReady(page, baseURL, testInfo);
      await expectMapStaysPut(page);
    });

    test("a rotated map does not move under the panel when it opens or closes", async ({ page, baseURL }, testInfo) => {
      await openReady(page, baseURL, testInfo);
      await page.evaluate((rotation) => { OLMap.getView().setRotation(rotation); OLMap.renderSync(); }, ROTATION_RAD);
      await expectMapStaysPut(page);
    });

    async function expectMapStaysPut(page) {
      const anchor = await page.evaluate(() => OLMap.getCoordinateFromPixel([100, 300]));
      for (let i = 0; i < 2; i++) {
        await sampleAfterPress(page);
        const pixel = await page.evaluate((c) => OLMap.getPixelFromCoordinate(c), anchor);
        expect(Math.abs(pixel[0] - 100)).toBeLessThanOrEqual(1);
        expect(Math.abs(pixel[1] - 300)).toBeLessThanOrEqual(1);
      }
    }

    async function dragTab(page, testInfo, deltaX) {
      const pointer = await pointerFor(page, testInfo);
      const tab = await rectOf(page, EDGE_TAB);
      const x = tab.left + tab.width / 2;
      const y = tab.top + tab.height / 2;
      await pointer.move(x, y);
      await pointer.down();
      await pointer.move(x + deltaX / 2, y, 5);
      const during = await page.locator(EDGE_BUTTON).evaluate((el) => ({ dragging: el.classList.contains("dragging"), cursor: getComputedStyle(el).cursor }));
      await pointer.move(x + deltaX, y, 5);
      await pointer.up();
      return during;
    }

    test("press, hold and drag the tab resizes the panel instead of toggling it", async ({ page, baseURL }, testInfo) => {
      await openReady(page, baseURL, testInfo);
      const before = (await rectOf(page, PANEL)).width;
      const during = await dragTab(page, testInfo, -120);
      expect(during).toEqual({ dragging: true, cursor: "ew-resize" });
      await expect(page.locator(PANEL)).toBeVisible();
      expect(Math.abs((await rectOf(page, PANEL)).width - before - 120)).toBeLessThanOrEqual(6);
      await expect(page.locator(EDGE_BUTTON)).not.toHaveClass(/dragging/);
    });

    test("holding the tab shows the resize icon before it moves, and a hold alone does not toggle", async ({ page, baseURL }, testInfo) => {
      await openReady(page, baseURL, testInfo);
      const pointer = await pointerFor(page, testInfo);
      const tab = await rectOf(page, EDGE_TAB);
      await pointer.move(tab.left + tab.width / 2, tab.top + tab.height / 2);
      await pointer.down();
      await expect(page.locator(EDGE_BUTTON)).toHaveClass(/dragging/);
      expect(await page.locator(EDGE_BUTTON).evaluate((el) => getComputedStyle(el, "::before").backgroundImage)).toContain("M3 12h18");
      await page.evaluate((settleMs) => {
        window.__releaseSettled = new Promise((resolve) => {
          window.addEventListener("click", resolve, { capture: true, once: true });
          setTimeout(resolve, settleMs);
        });
      }, RELEASE_SETTLE_MS);
      await pointer.up();
      await page.evaluate(() => window.__releaseSettled);
      expect(await page.evaluate(() => toggles["sidebar_visible"].state), "the hold did not toggle the panel").toBe(true);
      await expect(page.locator(PANEL)).not.toHaveClass(/sidebar-sliding/);
      await expect(page.locator(PANEL)).toBeVisible();
      await expect(page.locator(EDGE_BUTTON)).not.toHaveClass(/dragging/);
    });

    test("holding the tab on a hidden panel then dragging opens it with its edge on the pointer, no jump", async ({ page, baseURL }, testInfo) => {
      await openReady(page, baseURL, testInfo);
      await page.locator(EDGE_BUTTON).click();
      await expect(page.locator(PANEL)).toBeHidden();
      await expect(page.locator(MAP)).not.toHaveClass(/panel-sliding/);
      const pointer = await pointerFor(page, testInfo);
      const screen = page.viewportSize().width;
      const tab = await rectOf(page, EDGE_TAB);
      const x = tab.left + tab.width / 2;
      const y = tab.top + tab.height / 2;
      const grabOffset = screen - x;
      const widthFor = (pointerX) => Math.max(SIDEBAR_MIN_WIDTH_PX, Math.min(screen - (pointerX + grabOffset), screen * SIDEBAR_MAX_WIDTH_SHARE));
      await pointer.move(x, y);
      await pointer.down();
      await expect(page.locator(EDGE_BUTTON)).toHaveClass(/dragging/);
      await expect(page.locator(PANEL)).toBeVisible();
      const opened = (await rectOf(page, PANEL)).width;
      expect(Math.abs(opened - widthFor(x)), "the panel opens with its edge at the pointer, within tar1090's limits").toBeLessThanOrEqual(WIDTH_TOLERANCE_PX);
      for (const step of [-40, -120, -200]) {
        await pointer.move(x + step, y);
        await expect.poll(async () => Math.abs((await rectOf(page, PANEL)).width - widthFor(x + step))).toBeLessThanOrEqual(WIDTH_TOLERANCE_PX);
      }
      await pointer.up();
    });

    test("a drag started while the panel is still sliding grabs the edge where it settles", async ({ page, baseURL }, testInfo) => {
      test.skip(testInfo.project.name !== "desktop", "synthetic mouse pointer events");
      await openReady(page, baseURL, testInfo);
      await page.locator(EDGE_BUTTON).click();
      await expect(page.locator(PANEL)).toBeHidden();
      await expect(page.locator(MAP)).not.toHaveClass(/panel-sliding/);
      const result = await page.evaluate((dragPx) => new Promise((resolve) => {
        const panel = document.getElementById("sidebar_container");
        const button = document.getElementById("toggle_sidebar_button");
        const pointer = (type, clientX) => new PointerEvent(type, { bubbles: true, cancelable: true, clientX, clientY: 300, button: 0, pointerId: 1, pointerType: "mouse", isPrimary: true });
        button.click();
        const slidingAtPress = panel.classList.contains("sidebar-sliding");
        const pressX = button.getBoundingClientRect().left + 4;
        button.dispatchEvent(pointer("pointerdown", pressX));
        const settledWidth = panel.getBoundingClientRect().width;
        button.dispatchEvent(pointer("pointermove", pressX - dragPx));
        const draggedWidth = panel.getBoundingClientRect().width;
        const slideMs = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--panel-slide-ms"));
        const afterSlide = () => {
          const laterWidth = panel.getBoundingClientRect().width;
          const laterSliding = panel.classList.contains("sidebar-sliding");
          button.dispatchEvent(pointer("pointerup", pressX - dragPx));
          resolve({ slidingAtPress, settledWidth, draggedWidth, laterWidth, laterSliding });
        };
        const started = performance.now();
        const wait = () => (performance.now() - started > slideMs * 2 ? afterSlide() : requestAnimationFrame(wait));
        requestAnimationFrame(wait);
      }), MID_SLIDE_DRAG_PX);
      expect(result.slidingAtPress, "the press landed mid-slide").toBe(true);
      expect(Math.abs(result.draggedWidth - (result.settledWidth + MID_SLIDE_DRAG_PX)), "the edge moved with the pointer").toBeLessThanOrEqual(WIDTH_TOLERANCE_PX);
      expect(result.laterSliding, "the slide did not resume during the drag").toBe(false);
      expect(Math.abs(result.laterWidth - result.draggedWidth), "the slide timer did not change the panel during the drag").toBeLessThanOrEqual(1);
    });

    test("dragging the tab out from a hidden panel opens it at that width", async ({ page, baseURL }, testInfo) => {
      await openReady(page, baseURL, testInfo);
      await page.locator(EDGE_BUTTON).click();
      await expect(page.locator(PANEL)).toBeHidden();
      await dragTab(page, testInfo, -300);
      await expect(page.locator(PANEL)).toBeVisible();
      expect(Math.abs((await rectOf(page, PANEL)).width - 300)).toBeLessThanOrEqual(6);
    });

    test("dragging the tab past tar1090's 80% limit and letting go short of the far left springs back to 80% and keeps the map", async ({ page, baseURL }, testInfo) => {
      await openReady(page, baseURL, testInfo);
      const pointer = await pointerFor(page, testInfo);
      const screen = page.viewportSize().width;
      const tab = await rectOf(page, EDGE_TAB);
      const y = tab.top + tab.height / 2;
      await pointer.move(tab.left + tab.width / 2, y);
      await pointer.down();
      await pointer.move(screen * SPRING_BACK_RELEASE_SHARE, y, 10);
      await pointer.up();
      await expect.poll(async () => Math.abs((await rectOf(page, PANEL)).width - screen * 0.8)).toBeLessThanOrEqual(2);
      await expect(page.locator(MAP)).toBeVisible();
      await expect(page.locator(EDGE_TAB)).toBeVisible();
    });

    test("past the 80% limit the panel keeps stretching, but slower than the pointer", async ({ page, baseURL }, testInfo) => {
      await openReady(page, baseURL, testInfo);
      const pointer = await pointerFor(page, testInfo);
      const screen = page.viewportSize().width;
      const tab = await rectOf(page, EDGE_TAB);
      const panel = await rectOf(page, PANEL);
      const x = tab.left + tab.width / 2;
      const y = tab.top + tab.height / 2;
      const grabOffset = panel.left - x;
      const atLimit = screen * (1 - SIDEBAR_MAX_WIDTH_SHARE) - grabOffset;
      const travel = screen * STRETCH_TRAVEL_SHARE;
      await pointer.move(x, y);
      await pointer.down();
      await pointer.move(atLimit, y, 10);
      await expect.poll(async () => Math.abs((await rectOf(page, PANEL)).width - screen * SIDEBAR_MAX_WIDTH_SHARE), "the edge reaches the limit with the pointer").toBeLessThanOrEqual(WIDTH_TOLERANCE_PX);
      const limitWidth = (await rectOf(page, PANEL)).width;
      await pointer.move(atLimit - travel, y, 5);
      await expect.poll(async () => (await rectOf(page, PANEL)).width - limitWidth, "the panel keeps moving past the limit").toBeGreaterThan(WIDTH_TOLERANCE_PX);
      const stretchedWidth = await settledPanelWidth(page);
      await pointer.up();
      expect(stretchedWidth - limitWidth, "but it resists the pointer").toBeLessThan(travel / 2);
      await expect.poll(async () => Math.abs((await rectOf(page, PANEL)).width - screen * SIDEBAR_MAX_WIDTH_SHARE)).toBeLessThanOrEqual(2);
    });

    async function settledPanelWidth(page) {
      return page.evaluate((stableFrames) => new Promise((resolve) => {
        const panel = document.getElementById("sidebar_container");
        let lastWidth = panel.getBoundingClientRect().width;
        let unchangedFrames = 0;
        const tick = () => {
          const width = panel.getBoundingClientRect().width;
          unchangedFrames = width === lastWidth ? unchangedFrames + 1 : 0;
          lastWidth = width;
          if (unchangedFrames >= stableFrames) resolve(width);
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }), STABLE_WIDTH_FRAMES);
    }

    async function sampleWidthsAround(page, act) {
      await page.evaluate((sampleMs) => {
        const panel = document.getElementById("sidebar_container");
        window.__panelWidthSamples = new Promise((resolve) => {
          const widths = [];
          const started = performance.now();
          const tick = () => {
            widths.push(panel.getBoundingClientRect().width);
            if (performance.now() - started < sampleMs) requestAnimationFrame(tick);
            else resolve(widths);
          };
          requestAnimationFrame(tick);
        });
      }, GLIDE_SAMPLE_MS);
      await act();
      return page.evaluate(() => window.__panelWidthSamples);
    }

    async function dragTabTo(page, testInfo, releaseShare, release) {
      const pointer = await pointerFor(page, testInfo);
      const screen = page.viewportSize().width;
      const tab = await rectOf(page, EDGE_TAB);
      const y = tab.top + tab.height / 2;
      await pointer.move(tab.left + tab.width / 2, y);
      await pointer.down();
      await pointer.move(screen * releaseShare, y, 10);
      return release(pointer);
    }

    async function dragToFarLeft(page, testInfo, release) {
      return dragTabTo(page, testInfo, FULL_TABLE_RELEASE_SHARE, release);
    }

    async function recordGlidingAtKeydown(page) {
      await page.evaluate(() => {
        const panel = document.getElementById("sidebar_container");
        window.addEventListener("keydown", () => { window.__glidingAtKeydown = panel.classList.contains("sidebar-gliding"); }, { capture: true, once: true });
      });
    }

    async function releaseThenPressEnter(page, pointer) {
      await pointer.up();
      await page.keyboard.press("Enter");
    }

    async function tabIsTopmostAtItsCentre(page) {
      return page.evaluate((tabSelector) => {
        const tab = document.querySelector(tabSelector);
        const tabRect = tab.getBoundingClientRect();
        const topmost = document.elementFromPoint(tabRect.left + tabRect.width / 2, tabRect.top + tabRect.height / 2);
        return !!topmost && tab.contains(topmost);
      }, EDGE_TAB);
    }

    async function tapTab(page, testInfo) {
      if (testInfo.project.name === "mobile") await page.locator(EDGE_BUTTON).tap();
      else await page.locator(EDGE_BUTTON).click();
    }

    async function expectFullTable(page) {
      await expect.poll(() => readGlobal(page, "mapIsVisible")).toBe(false);
      await expect(page.locator(MAP)).toBeHidden();
      await expect(page.locator(PANEL)).toBeVisible();
      await expect(page.locator("#shrink_sidebar_button")).toHaveCount(0);
      await expect(page.locator(EDGE_TAB)).toBeVisible();
    }

    async function enterFullTable(page, testInfo) {
      await dragToFarLeft(page, testInfo, (pointer) => pointer.up());
      await expectFullTable(page);
      await expect.poll(async () => Math.abs((await rectOf(page, PANEL)).width - page.viewportSize().width)).toBeLessThanOrEqual(1);
    }

    test("letting go at the far left glides the panel to full width and shows tar1090's full table", async ({ page, baseURL }, testInfo) => {
      await openReady(page, baseURL, testInfo);
      const screen = page.viewportSize().width;
      const widths = await dragToFarLeft(page, testInfo, (pointer) => sampleWidthsAround(page, () => pointer.up()));
      await expectFullTable(page);
      expect(Math.abs((await rectOf(page, PANEL)).width - screen)).toBeLessThanOrEqual(1);
      const gliding = widths.filter((width) => width > screen * SIDEBAR_MAX_WIDTH_SHARE + WIDTH_TOLERANCE_PX && width < screen - WIDTH_TOLERANCE_PX);
      expect(new Set(gliding.map(Math.round)).size, "the panel glides through in-between widths").toBeGreaterThan(1);
    });

    test("with reduced motion letting go jumps straight to the end state, both ways", async ({ page, baseURL }, testInfo) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await openReady(page, baseURL, testInfo);
      const screen = page.viewportSize().width;
      const pointer = await pointerFor(page, testInfo);
      const tab = await rectOf(page, EDGE_TAB);
      const y = tab.top + tab.height / 2;
      await pointer.move(tab.left + tab.width / 2, y);
      await pointer.down();
      await pointer.move(screen * SPRING_BACK_RELEASE_SHARE, y, 10);
      await pointer.up();
      expect(Math.abs((await rectOf(page, PANEL)).width - screen * SIDEBAR_MAX_WIDTH_SHARE), "springs back at once").toBeLessThanOrEqual(1);
      await dragToFarLeft(page, testInfo, (far) => far.up());
      expect(await readGlobal(page, "mapIsVisible"), "the full table at once").toBe(false);
      expect(Math.abs((await rectOf(page, PANEL)).width - screen)).toBeLessThanOrEqual(1);
    });

    test("in the full table the tab sits on the table's left edge, vertically centred", async ({ page, baseURL }, testInfo) => {
      await openReady(page, baseURL, testInfo);
      await enterFullTable(page, testInfo);
      const tab = await rectOf(page, EDGE_TAB);
      const panel = await rectOf(page, PANEL);
      expect(Math.abs(tab.left - panel.left)).toBeLessThanOrEqual(EDGE_TOLERANCE_PX);
      expect(Math.abs((tab.top + tab.bottom) / 2 - (panel.top + panel.bottom) / 2)).toBeLessThanOrEqual(CENTRE_TOLERANCE_PX);
      await expect(page.locator(EDGE_BUTTON)).not.toHaveClass(/show_sidebar/);
    });

    test("in the full table, tapping the tab slides back to the map at the width it had before", async ({ page, baseURL }, testInfo) => {
      await openReady(page, baseURL, testInfo);
      const before = (await rectOf(page, PANEL)).width;
      await enterFullTable(page, testInfo);
      const screen = page.viewportSize().width;
      const widths = await sampleWidthsAround(page, () => tapTab(page, testInfo));
      await expect(page.locator(MAP)).toBeVisible();
      expect(await readGlobal(page, "mapIsVisible")).toBe(true);
      expect(await readGlobal(page, "toggles['sidebar_visible'].state")).toBe(true);
      await expect.poll(async () => Math.abs((await rectOf(page, PANEL)).width - before)).toBeLessThanOrEqual(WIDTH_TOLERANCE_PX);
      const sliding = widths.filter((width) => width > before + WIDTH_TOLERANCE_PX && width < screen - WIDTH_TOLERANCE_PX);
      expect(new Set(sliding.map(Math.round)).size, "the panel slides through in-between widths").toBeGreaterThan(1);
      await expect(page.locator("#splitter")).toBeVisible();
    });

    test("pressing Enter on the tab while it springs back stores 80% and hides the panel", async ({ page, baseURL }, testInfo) => {
      test.skip(testInfo.project.name !== "desktop", KEYBOARD_ONLY_REASON);
      await openReady(page, baseURL, testInfo);
      const screen = page.viewportSize().width;
      await recordGlidingAtKeydown(page);
      await dragTabTo(page, testInfo, SPRING_BACK_RELEASE_SHARE, (pointer) => releaseThenPressEnter(page, pointer));
      expect(await readGlobal(page, "window.__glidingAtKeydown"), "Enter landed mid-glide").toBe(true);
      await expect(page.locator(PANEL)).toBeHidden();
      expect(await readGlobal(page, "toggles['sidebar_visible'].state")).toBe(false);
      expect(Math.abs((await readGlobal(page, "loStore['sidebar_width']")) - screen * SIDEBAR_MAX_WIDTH_SHARE), "the stored width is 80%, not the stretch").toBeLessThanOrEqual(WIDTH_TOLERANCE_PX);
    });

    test("pressing Enter on the tab while it glides to the full table finishes the glide, then returns to the map", async ({ page, baseURL }, testInfo) => {
      test.skip(testInfo.project.name !== "desktop", KEYBOARD_ONLY_REASON);
      await openReady(page, baseURL, testInfo);
      const before = (await rectOf(page, PANEL)).width;
      await recordGlidingAtKeydown(page);
      await dragToFarLeft(page, testInfo, (pointer) => releaseThenPressEnter(page, pointer));
      expect(await readGlobal(page, "window.__glidingAtKeydown"), "Enter landed mid-glide").toBe(true);
      await expect(page.locator(PANEL)).toBeVisible();
      await expect(page.locator(MAP)).toBeVisible();
      expect(await readGlobal(page, "mapIsVisible")).toBe(true);
      expect(await readGlobal(page, "toggles['sidebar_visible'].state")).toBe(true);
      await expect(page.locator("#layout_container")).not.toHaveClass(/sidebar-full/);
      await expect.poll(async () => Math.abs((await rectOf(page, PANEL)).width - before)).toBeLessThanOrEqual(WIDTH_TOLERANCE_PX);
    });

    test("in the full table with the buttons hidden, the tab stays and returns to the map, which keeps its buttons hidden", async ({ page, baseURL }, testInfo) => {
      await openReady(page, baseURL, testInfo);
      await enterFullTable(page, testInfo);
      await page.keyboard.press(HIDE_BUTTONS_KEY);
      expect(await readGlobal(page, "hideButtons")).toBe(true);
      await expect(page.locator(EDGE_TAB)).toBeVisible();
      await tapTab(page, testInfo);
      await expect(page.locator(MAP)).toBeVisible();
      expect(await readGlobal(page, "mapIsVisible")).toBe(true);
      await expect(page.locator(EDGE_TAB)).toBeHidden();
    });

    test("in the full table with an aircraft selected, the tab sits just right of the details panel", async ({ page, baseURL }, testInfo) => {
      await openMap(page, baseURL, { aircraft: [SELECTED_AIRCRAFT] });
      await page.waitForFunction((hex) => typeof g !== "undefined" && g.planes && !!g.planes[hex], SELECTED_AIRCRAFT.hex, { timeout: 30_000 });
      if (testInfo.project.name === "mobile") await page.locator(EDGE_BUTTON).tap();
      await expect(page.locator(PANEL)).toBeVisible();
      await expect(page.locator(PANEL)).not.toHaveClass(/sidebar-sliding/);
      await page.evaluate((hex) => selectPlaneByHex(hex, { follow: false }), SELECTED_AIRCRAFT.hex);
      await expect(page.locator("#selected_infoblock")).toBeVisible();
      await dragToFarLeft(page, testInfo, (pointer) => pointer.up());
      await expectFullTable(page);
      await expect(page.locator(PANEL)).not.toHaveClass(/sidebar-gliding/);
      const tab = await rectOf(page, EDGE_TAB);
      const panel = await rectOf(page, PANEL);
      const details = await rectOf(page, "#selected_infoblock");
      expect(Math.abs(tab.left - panel.left)).toBeLessThanOrEqual(EDGE_TOLERANCE_PX);
      expect(tab.left).toBeGreaterThanOrEqual(details.right - EDGE_TOLERANCE_PX);
      expect(await tabIsTopmostAtItsCentre(page), "nothing covers the tab").toBe(true);
    });

    test("in the full table, dragging the tab right brings the map back with the panel edge on the pointer", async ({ page, baseURL }, testInfo) => {
      await openReady(page, baseURL, testInfo);
      await enterFullTable(page, testInfo);
      const screen = page.viewportSize().width;
      const pointer = await pointerFor(page, testInfo);
      const tab = await rectOf(page, EDGE_TAB);
      const panel = await rectOf(page, PANEL);
      const x = tab.left + tab.width / 2;
      const y = tab.top + tab.height / 2;
      const grabOffset = panel.left - x;
      const target = screen * HALF_SCREEN_SHARE;
      await pointer.move(x, y);
      await pointer.down();
      await pointer.move(target, y, 10);
      await expect(page.locator(MAP)).toBeVisible();
      expect(Math.abs((await rectOf(page, PANEL)).width - (screen - (target + grabOffset)))).toBeLessThanOrEqual(WIDTH_TOLERANCE_PX);
      await pointer.up();
      await expect(page.locator(MAP)).toBeVisible();
      expect(await readGlobal(page, "mapIsVisible")).toBe(true);
      expect(Math.abs((await rectOf(page, PANEL)).width - (screen - (target + grabOffset)))).toBeLessThanOrEqual(WIDTH_TOLERANCE_PX);
    });

    test("dragging the tab to 60% keeps the panel at that width", async ({ page, baseURL }, testInfo) => {
      await openReady(page, baseURL, testInfo);
      const screen = page.viewportSize().width;
      const panel = await rectOf(page, PANEL);
      await dragTab(page, testInfo, screen * 0.4 - panel.left);
      await expect.poll(async () => Math.abs((await rectOf(page, PANEL)).width - screen * 0.6)).toBeLessThanOrEqual(6);
    });

    test("with reduced motion the panel just hides", async ({ page, baseURL }, testInfo) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await openReady(page, baseURL, testInfo);
      const { frames } = await sampleAfterPress(page);
      expect(frames[0].visible).toBe(false);
    });
  });

  test("on a phone, dragging the tab out opens the panel at that width", async ({ page, baseURL }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "phone layout");
    await openGlobe(page, baseURL);
    await expect(page.locator(PANEL)).toBeHidden();
    const tab = await rectOf(page, EDGE_TAB);
    const x = tab.left + tab.width / 2;
    const y = tab.top + tab.height / 2;
    const send = await touchSender(page);
    await send("touchStart", [{ x, y }]);
    for (let i = 1; i <= 8; i++) await send("touchMove", [{ x: x - 200 * i / 8, y }]);
    await send("touchEnd", []);
    await expect(page.locator(PANEL)).toBeVisible();
    expect(Math.abs((await rectOf(page, PANEL)).width - 200)).toBeLessThanOrEqual(6);
  });

  test("on a phone the panel starts hidden and the tab opens it", async ({ page, baseURL }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "phone only");
    await openGlobe(page, baseURL);
    await expect(page.locator(PANEL)).toBeHidden();
    await expect(page.locator(EDGE_TAB)).toBeVisible();
    const tab = await rectOf(page, EDGE_TAB);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(Math.abs(tab.right - viewportWidth)).toBeLessThanOrEqual(EDGE_TOLERANCE_PX);
    await page.locator(EDGE_BUTTON).click();
    await expect(page.locator(PANEL)).toBeVisible();
  });

  test("the edge tab is a plain white caret", async ({ page, baseURL }) => {
    await openGlobe(page, baseURL);
    await expect(page.locator(EDGE_BUTTON)).toHaveCSS("background-image", "none");
    expect(await page.locator(EDGE_BUTTON).evaluate((el) => getComputedStyle(el, "::before").backgroundImage)).toContain("stroke='white'");
  });

  test("the panel edge is a plain line with no grip beside the tab", async ({ page, baseURL }) => {
    await openGlobe(page, baseURL);
    expect(await page.locator("#splitter").evaluate((el) => getComputedStyle(el).backgroundImage)).not.toContain("154, 154, 154");
  });

  test("the caret fits inside the tab and sits centred", async ({ page, baseURL }) => {
    await openGlobe(page, baseURL);
    const fit = await page.locator(EDGE_BUTTON).evaluate((el) => {
      const computed = getComputedStyle(el);
      const room = el.getBoundingClientRect().width - parseFloat(computed.paddingLeft) - parseFloat(computed.paddingRight);
      return { room, caret: parseFloat(getComputedStyle(el, "::before").width), left: parseFloat(computed.paddingLeft), right: parseFloat(computed.paddingRight) };
    });
    expect(fit.caret).toBeLessThanOrEqual(fit.room);
    expect(fit.left).toBe(fit.right);
  });

  test("hideButtons hides the edge tab", async ({ page, baseURL }) => {
    await openMap(page, baseURL, { query: "&hideButtons" });
    await expect(page.locator(EDGE_TAB)).toBeHidden();
  });

  test.describe("panel edge", () => {
    const SPLITTER = "#splitter";
    const HEADER_CONTROLS = "#header_side";
    const DRAG_PX = 120;
    const EDGE_GRIP_SHARE = 0.9;
    const DRAG_TOLERANCE_PX = 4;
    const MIN_EDGE_WIDTH_PX = 6;
    const MAX_EDGE_WIDTH_PX = 8;
    const MIN_GAP_PX = 6;
    const PRE_EXISTING_PANEL_BODY_OVERLAPS = [
      "li.ui-tabs-tab",
      "a#ui-id-1",
      "a#ui-id-2",
      "a#ui-id-3",
      "input#search_input",
      "input#jump_input",
      'button.formButton "Search"',
      'button.formButton "Jump"',
      "button#search_clear_button",
      "button#jump_clear_button",
      'a "Privacy Policy"',
      'a "Terms of Service"',
      'a.largeText "FAQ"',
      'a.largeText "Map Help"',
      'a.largeText "Join Discord"'
    ];
    const NEW_CONTROLS = [EDGE_TAB];

    async function openPanel(page, baseURL, testInfo) {
      await openGlobe(page, baseURL);
      if (testInfo.project.name === "mobile") await page.locator(EDGE_BUTTON).click();
      await expect(page.locator(PANEL)).toBeVisible();
      await expect(page.locator(PANEL)).not.toHaveClass(/sidebar-sliding/);
    }

    async function dragEdge(page, y, deltaX) {
      const handle = await rectOf(page, SPLITTER);
      const x = handle.left + handle.width / 2;
      if (test.info().project.name === "mobile") {
        const send = await touchSender(page);
        await send("touchStart", [{ x, y }]);
        for (let i = 1; i <= 8; i++) await send("touchMove", [{ x: x + deltaX * i / 8, y }]);
        await send("touchEnd", []);
        return;
      }
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + deltaX, y, { steps: 8 });
      await page.mouse.up();
    }

    test("the whole left edge of the panel is the resize handle", async ({ page, baseURL }, testInfo) => {
      await openPanel(page, baseURL, testInfo);
      const panel = await rectOf(page, PANEL);
      const handle = await rectOf(page, SPLITTER);
      expect(Math.abs(handle.height - panel.height)).toBeLessThanOrEqual(1);
      expect(handle.width).toBeGreaterThanOrEqual(MIN_EDGE_WIDTH_PX);
      expect(handle.width).toBeLessThanOrEqual(MAX_EDGE_WIDTH_PX);
      const style = await page.evaluate((sel) => {
        const computed = getComputedStyle(document.querySelector(sel));
        return { cursor: computed.cursor, image: computed.backgroundImage };
      }, SPLITTER);
      expect(style.cursor).toBe("ew-resize");
      expect(style.image).not.toMatch(/url\(/);
    });

    test("the edge drags exactly like the tab: past tar1090's 80% limit and let go short of the far left, it springs back to 80%", async ({ page, baseURL }, testInfo) => {
      await openPanel(page, baseURL, testInfo);
      const screen = page.viewportSize().width;
      const handle = await rectOf(page, SPLITTER);
      await dragEdge(page, handle.top + handle.height * EDGE_GRIP_SHARE, screen * SPRING_BACK_RELEASE_SHARE - (handle.left + handle.width / 2));
      await expect.poll(async () => Math.abs((await rectOf(page, PANEL)).width - screen * 0.8)).toBeLessThanOrEqual(2);
      await expect(page.locator(MAP)).toBeVisible();
    });

    test("the edge drags exactly like the tab: 60% stays at 60%", async ({ page, baseURL }, testInfo) => {
      await openPanel(page, baseURL, testInfo);
      const screen = page.viewportSize().width;
      const panel = await rectOf(page, PANEL);
      await dragEdge(page, panel.top + panel.height * EDGE_GRIP_SHARE, screen * 0.4 - panel.left);
      await expect.poll(async () => Math.abs((await rectOf(page, PANEL)).width - screen * 0.6)).toBeLessThanOrEqual(6);
    });

    test("dragging the edge 120 px left widens the panel by 120 px", async ({ page, baseURL }, testInfo) => {
      await openPanel(page, baseURL, testInfo);
      const before = await rectOf(page, PANEL);
      await dragEdge(page, before.top + before.height * EDGE_GRIP_SHARE, -DRAG_PX);
      const after = await rectOf(page, PANEL);
      expect(Math.abs(after.width - before.width - DRAG_PX)).toBeLessThanOrEqual(DRAG_TOLERANCE_PX);
    });

    test("dragging the edge above the tab still resizes", async ({ page, baseURL }, testInfo) => {
      test.skip(testInfo.project.name === "mobile", "on a phone a touch on the edge beside the rail lands on the rail buttons; the tab is the phone handle");
      await openPanel(page, baseURL, testInfo);
      const before = await rectOf(page, PANEL);
      await dragEdge(page, before.top + before.height * 0.2, -DRAG_PX);
      const after = await rectOf(page, PANEL);
      expect(Math.abs(after.width - before.width - DRAG_PX)).toBeLessThanOrEqual(DRAG_TOLERANCE_PX);
    });

    test("the edge tab stays clickable above the edge", async ({ page, baseURL }, testInfo) => {
      test.skip(testInfo.project.name === "mobile", "edge overlap is desktop only");
      await openPanel(page, baseURL, testInfo);
      await page.locator(EDGE_BUTTON).click({ timeout: 3000 });
      await expect(page.locator(PANEL)).toBeHidden();
    });

    test("the edge drags exactly like the tab: let go at the far left, it becomes the full table", async ({ page, baseURL }, testInfo) => {
      await openPanel(page, baseURL, testInfo);
      const screen = page.viewportSize().width;
      const handle = await rectOf(page, SPLITTER);
      await dragEdge(page, handle.top + handle.height * EDGE_GRIP_SHARE, screen * FULL_TABLE_RELEASE_SHARE - (handle.left + handle.width / 2));
      await expect.poll(() => readGlobal(page, "mapIsVisible")).toBe(false);
      await expect(page.locator(MAP)).toBeHidden();
      await expect(page.locator(EDGE_TAB)).toBeVisible();
    });

    test("double-clicking the edge still resets the width", async ({ page, baseURL }, testInfo) => {
      test.skip(testInfo.project.name === "mobile", "on a phone the reset (auto) width is the whole screen");
      await openPanel(page, baseURL, testInfo);
      const opened = await rectOf(page, PANEL);
      await page.locator(SPLITTER).dblclick({ position: { x: 3, y: opened.height * 0.8 } });
      const reset = await rectOf(page, PANEL);
      await dragEdge(page, reset.top + reset.height * 0.8, -DRAG_PX);
      const dragged = await rectOf(page, PANEL);
      expect(dragged.width).toBeGreaterThan(reset.width + DRAG_PX / 2);
      await page.locator(SPLITTER).dblclick({ position: { x: 3, y: dragged.height * 0.8 } });
      const after = await rectOf(page, PANEL);
      expect(Math.abs(after.width - reset.width)).toBeLessThanOrEqual(WIDTH_TOLERANCE_PX);
    });

    test("the edge tab sits below page-level overlays", async ({ page, baseURL }, testInfo) => {
      await openPanel(page, baseURL, testInfo);
      const zIndex = await page.evaluate((sel) => Number(getComputedStyle(document.querySelector(sel)).zIndex), EDGE_TAB);
      expect(zIndex).toBeLessThan(1000);
    });

    test("the panel has no overlapping or crowded controls apart from the pre-existing panel-body ones", async ({ page, baseURL }, testInfo) => {
      await openPanel(page, baseURL, testInfo);
      await expectNoUiOverlap(page, { within: PANEL, minGapPx: MIN_GAP_PX, ignore: PRE_EXISTING_PANEL_BODY_OVERLAPS });
      await expectNoUiOverlap(page, { within: HEADER_CONTROLS, minGapPx: MIN_GAP_PX, ignore: PRE_EXISTING_PANEL_BODY_OVERLAPS });
    });

    test("the edge tab does not intersect the header controls", async ({ page, baseURL }, testInfo) => {
      await openPanel(page, baseURL, testInfo);
      const header = await page.evaluate((sel) => {
        return Array.from(document.querySelectorAll(`${sel} button, ${sel} a[href], ${sel} input, ${sel} select, ${sel} > div > *, ${sel} [onclick]`))
          .filter((el) => { const rect = el.getBoundingClientRect(); return rect.width > 0 && rect.height > 0 && getComputedStyle(el).visibility !== "hidden"; })
          .map((el) => { const rect = el.getBoundingClientRect(); return { name: el.id || el.className || el.tagName, left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }; });
      }, HEADER_CONTROLS);
      const boxes = [];
      for (const selector of NEW_CONTROLS) boxes.push(Object.assign({ name: selector }, await rectOf(page, selector)));
      const intersects = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
      const contains = (a, b) => a.left <= b.left && a.top <= b.top && a.right >= b.right && a.bottom >= b.bottom;
      const problems = [];
      for (let i = 0; i < boxes.length; i++) {
        for (const other of boxes.slice(i + 1).concat(header)) {
          if (contains(boxes[i], other) || contains(other, boxes[i])) continue;
          if (intersects(boxes[i], other)) problems.push(`${boxes[i].name} intersects ${other.name}`);
        }
      }
      expect(problems).toEqual([]);
    });
  });
});
