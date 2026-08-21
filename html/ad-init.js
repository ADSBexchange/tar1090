"use strict";

// Composition root for panel-driven ads: wire the ad controller, then start a watcher on each
// ad-bearing container. Runs on jQuery ready so tar1090's own init (sidebar toggle, onMobile hide,
// etc.) has already settled each panel's initial visibility before the watchers capture it.
jQuery(function () {
  if (!window.watchPanel || !window.wireAdController || typeof AdSlots === "undefined") return;

  var bus = document; // jQuery custom-event bus for panel:open / panel:close

  // Subscribe first, so the watchers' initial (deferred) emits are heard.
  wireAdController(
    {
      fullDetails: [AdSlots.FULL_DETAILS_LEADERBOARD, AdSlots.FULL_DETAILS_FOOTER],
      selectedInfoblock: [AdSlots.LEFT_RAIL],
      sidebar: [AdSlots.MEDREC_ATF, AdSlots.RIGHT_RAIL_2],
      mapOverlay: [AdSlots.TRACKING_LEADERBOARD],
    },
    { request: window.requestAdSlots, destroy: window.destroyAdSlots },
    bus
  );

  watchPanel("full_details_window", "fullDetails", bus);
  watchPanel("selected_infoblock", "selectedInfoblock", bus);
  watchPanel("sidebar_container", "sidebar", bus);
  watchPanel("tracking_leaderboard_container", "mapOverlay", bus);
});
