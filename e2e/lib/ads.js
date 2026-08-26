// Helpers for the panel-driven ad E2E. "Is this ad requested/torn down" is asserted against our own
// lifecycle — append-only counts of newAdSlots/deleteAdSlots calls (see instrument) — NOT the GPT
// registry, because Freestar device-gates GPT slot creation for desktop-only sizes (a 728x90 unit is
// never registered at mobile width even when our code correctly requested it). Panels are opened/closed
// by toggling their container's display, which is exactly the transition the PanelWatcher observes.
// No aircraft or fills needed.

const SLOTS = {
  fullDetailsLeaderboard: "adsbexchange_full_details_leaderboard",
  fullDetailsFooter: "adsbexchange_full_details_footer",
  leftRail: "adsbexchange_left_rail",
  medrec: "adsbexchange_medrec_atf",
  rightRail2: "adsbexchange_right_rail_2",
  trackingLeaderboard: "adsbexchange_tracking_leaderboard",
  mobileFooter: "adsbexchange_mobile_tracking_leaderboard",
};

// container id (no #) -> the ad slots that live in that panel
const PANELS = {
  full_details_window: [SLOTS.fullDetailsLeaderboard, SLOTS.fullDetailsFooter],
  selected_infoblock: [SLOTS.leftRail],
  sidebar_container: [SLOTS.medrec, SLOTS.rightRail2],
  tracking_leaderboard_container: [SLOTS.trackingLeaderboard],
};

async function waitForAdStack(page) {
  // Wait for the ad stack AND the panel watchers to be attached (ad-init.js runs on jQuery-ready,
  // after requestAdSlots exists). Without __adPanelsReady we can toggle a panel before its
  // MutationObserver is wired, and the open/close is silently missed.
  await page.waitForFunction(
    () =>
      window.googletag &&
      window.googletag.pubads &&
      typeof window.requestAdSlots === "function" &&
      window.freestar &&
      typeof window.freestar.newAdSlots === "function" && // pubfig has installed the real fn (not the queue stub)
      window.__adPanelsReady === true,
    null,
    { timeout: 30_000 }
  );
}

async function requestedSlots(page) {
  return page.evaluate(() => window.googletag.pubads().getSlots().map((s) => s.getSlotElementId()));
}

// Show/hide a panel by toggling its container display — this is exactly the transition PanelWatcher observes.
async function setPanel(page, containerId, visible) {
  await page.evaluate(
    ({ id, v }) => {
      const el = document.getElementById(id);
      if (el) el.style.display = v ? "block" : "none";
    },
    { id: containerId, v: visible }
  );
}

// Instrument OUR lifecycle: wrap newAdSlots/deleteAdSlots so we track what our code requested/destroyed.
// This is device-independent — unlike googletag.getSlots(), which Freestar device-gates (e.g. a 728x90
// desktop-only unit is never registered at mobile width even though our code correctly requested it).
// __live[id] = our code has it live; __new[id] = how many times we asked Freestar to fetch it.
async function instrument(page) {
  await page.evaluate(() => {
    if (window.__adInst) return;
    window.__adInst = true;
    window.__new = {}; // slotId -> # of newAdSlots calls (append-only; robust to loop churn)
    window.__del = {}; // slotId -> # of deleteAdSlots calls (append-only)
    // Trap the function via a getter/setter so pubfig re-assigning newAdSlots/deleteAdSlots (which it
    // does during its async bootstrap) can never clobber our counter — the getter always returns our
    // wrapper, wrapping whatever "real" fn was last assigned.
    function trap(obj, name, counter) {
      var real = obj[name];
      Object.defineProperty(obj, name, {
        configurable: true,
        get: function () {
          return function (arg) {
            try {
              (Array.isArray(arg) ? arg : [arg]).forEach(function (x) {
                var id = x && x.slotId ? x.slotId : x; // newAdSlots -> {slotId}, deleteAdSlots -> "id"
                if (id && typeof id === "string") counter[id] = (counter[id] || 0) + 1;
              });
            } catch (e) {}
            return real && real.apply(this, arguments);
          };
        },
        set: function (v) { real = v; },
      });
    }
    trap(window.freestar, "newAdSlots", window.__new);
    trap(window.freestar, "deleteAdSlots", window.__del);
  });
}

async function newCount(page, slotId) {
  return page.evaluate((i) => (window.__new && window.__new[i]) || 0, slotId);
}
async function delCount(page, slotId) {
  return page.evaluate((i) => (window.__del && window.__del[i]) || 0, slotId);
}

// Wait until our code has requested (kind="new") or destroyed (kind="del") a slot at least `min` times.
async function waitCount(page, slotId, kind, min) {
  await page.waitForFunction(
    ({ i, k, m }) => (((k === "new" ? window.__new : window.__del) || {})[i] || 0) >= m,
    { i: slotId, k: kind, m: min },
    { timeout: 15_000 }
  );
}

module.exports = { SLOTS, PANELS, waitForAdStack, requestedSlots, setPanel, instrument, newCount, delCount, waitCount };
