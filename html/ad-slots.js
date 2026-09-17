"use strict";

// Swing-out panel ads (Full Details drawer, selected-aircraft rail) live in containers that are shown
// and hidden without a page reload. Freestar event-based tagging requires such ads to be requested on
// show and destroyed on hide, not statically declared at page load into a hidden div (which serves an
// unviewable impression). Tracking active slots means request/destroy only act on real transitions, so
// callers on hot paths (e.g. adjustInfoBlock) can call freely without double-requesting.

var AdSlots = {
  FULL_DETAILS_LEADERBOARD: "adsbexchange_full_details_leaderboard",
  FULL_DETAILS_FOOTER: "adsbexchange_full_details_footer",
  LEFT_RAIL: "adsbexchange_left_rail",
  MEDREC_ATF: "adsbexchange_medrec_atf",
  RIGHT_RAIL_2: "adsbexchange_right_rail_2",
  TRACKING_LEADERBOARD: "adsbexchange_tracking_leaderboard",
};

function createAdSlotManager(freestar, isSubscriber) {
  var active = {};

  function request(ids) {
    if (isSubscriber()) return [];
    var toAdd = ids.filter(function (id) { return !active[id]; });
    if (toAdd.length === 0) return [];
    toAdd.forEach(function (id) { active[id] = true; });
    freestar.queue.push(function () {
      freestar.newAdSlots(toAdd.map(function (id) {
        return { placementName: id, slotId: id };
      }));
    });
    return toAdd;
  }

  function destroy(ids) {
    var toRemove = ids.filter(function (id) { return active[id]; });
    if (toRemove.length === 0) return [];
    toRemove.forEach(function (id) { delete active[id]; });
    freestar.queue.push(function () {
      freestar.deleteAdSlots(toRemove);
    });
    return toRemove;
  }

  return { request: request, destroy: destroy, active: active };
}

// Browser: wire a singleton over the global freestar object, reading the subscriber flag lazily
// (is_subscriber is set during page load, before any panel is opened).
if (typeof window !== "undefined") {
  window.AdSlots = AdSlots;
  var adSlotManager = createAdSlotManager(window.freestar, function () {
    return typeof is_subscriber !== "undefined" && is_subscriber;
  });
  window.requestAdSlots = function (ids) { return adSlotManager.request(ids); };
  window.destroyAdSlots = function (ids) { return adSlotManager.destroy(ids); };
}

// Node: exported for unit testing (inert in the browser).
if (typeof module !== "undefined" && module.exports) {
  module.exports = { AdSlots: AdSlots, createAdSlotManager: createAdSlotManager };
}
