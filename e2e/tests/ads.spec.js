// @ts-check
const { test, expect } = require("@playwright/test");
const {
  SLOTS,
  PANELS,
  waitForAdStack,
  requestedSlots,
  setPanel,
  instrument,
  newCount,
  waitCount,
} = require("../lib/ads");

// Serial: ad slots are page-global state; keep one page/flow per file section.
test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ page }) => {
  await page.goto("/"); // no ?icao — nothing selected, so tar1090's update loop never re-shows a panel
  await waitForAdStack(page);
  await instrument(page);
});

test("at load, no ad is requested into a closed panel", async ({ page }) => {
  // Drawer + left panel start closed on every device -> their slots are not in GPT's registry.
  const requested = await requestedSlots(page);
  expect(requested).not.toContain(SLOTS.fullDetailsLeaderboard);
  expect(requested).not.toContain(SLOTS.fullDetailsFooter);
  expect(requested).not.toContain(SLOTS.leftRail);
});

// Every panel: opening requests its slot(s); closing tears them down (deleteAdSlots).
// Asserted against append-only newAdSlots/deleteAdSlots counts (our lifecycle), so it holds on mobile
// too (Freestar device-gates GPT slot creation for desktop-only sizes) AND is robust to tar1090's
// update loop, which may re-hide a panel and fire extra churn — counts only ever go up.
for (const [containerId, slots] of Object.entries(PANELS)) {
  test(`panel ${containerId}: open requests its slots, close destroys them`, async ({ page }) => {
    await setPanel(page, containerId, false); // baseline (some panels default open on desktop)
    await page.waitForTimeout(250); // let the close settle so the next open is a real none->block edge

    await setPanel(page, containerId, true);
    for (const slot of slots) await waitCount(page, slot, "new", 1); // requested on open

    await setPanel(page, containerId, false);
    for (const slot of slots) await waitCount(page, slot, "del", 1); // destroyed on close
  });
}

test("switching aircraft while the info panel stays open does NOT re-request its ad", async ({ page }) => {
  await setPanel(page, "selected_infoblock", true);
  await waitCount(page, SLOTS.leftRail, "new", 1);
  const before = await newCount(page, SLOTS.leftRail);

  // Mirror an aircraft switch: deselect+select in ONE synchronous tick. The watcher coalesces the
  // hidden->shown pair into no net change, so no teardown + re-request fires (the Freestar ask we avoid).
  await page.evaluate(() => {
    const el = document.getElementById("selected_infoblock");
    el.style.display = "none";
    el.style.display = "block";
  });
  await page.waitForTimeout(300); // let the watcher's setTimeout(0) settle

  expect(await newCount(page, SLOTS.leftRail)).toBe(before); // no new request
});

test("re-opening the info panel after a real close requests a fresh ad", async ({ page }) => {
  await setPanel(page, "selected_infoblock", true);
  await waitCount(page, SLOTS.leftRail, "new", 1);
  const afterOpen = await newCount(page, SLOTS.leftRail);

  await setPanel(page, "selected_infoblock", false);
  await waitCount(page, SLOTS.leftRail, "del", 1);

  await setPanel(page, "selected_infoblock", true);
  await waitCount(page, SLOTS.leftRail, "new", afterOpen + 1); // fresh request on re-open
});

test("the static mobile-footer unit is not requested on desktop (no hidden impression)", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "desktop-only guard");
  expect(await requestedSlots(page)).not.toContain(SLOTS.mobileFooter);
});

test("subscribers get no ad stack at all", async ({ browser }) => {
  const baseURL = process.env.BASE_URL || "http://localhost:8080";
  const host = new URL(baseURL).hostname;
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  await context.addCookies([{ name: "adsbx_subscriber", value: "1", domain: host, path: "/" }]);
  const page = await context.newPage();
  await page.goto(baseURL);
  await page.waitForTimeout(3000); // give the (subscriber) init path time to run
  const noStack = await page.evaluate(
    () => typeof window.googletag === "undefined" || !window.googletag.pubads || window.googletag.pubads().getSlots().length === 0
  );
  expect(noStack).toBe(true);
  await context.close();
});
