"use strict";

// Maps panels to their ad slots and reacts to panel:open / panel:close events by requesting or
// destroying those slots via the ad-slots manager. Knows nothing about the DOM or Freestar internals —
// just the panel->slots mapping and the two event names.
//
// Pure core: createAdController(config, adSlots, on). `config` is { panelName: [slotId, ...] };
// `on(eventType, handler)` subscribes to the bus; `adSlots` is the Freestar adapter (request/destroy).

function createAdController(config, adSlots, on) {
  on("panel:open", function (name) {
    var slots = config[name];
    if (slots && slots.length) adSlots.request(slots);
  });
  on("panel:close", function (name) {
    var slots = config[name];
    if (slots && slots.length) adSlots.destroy(slots);
  });
}

// Browser wiring: subscribe to the jQuery event bus, unwrapping the (event, name) signature.
if (typeof window !== "undefined") {
  window.createAdController = createAdController;
  window.wireAdController = function (config, adSlots, bus) {
    createAdController(config, adSlots, function (evt, handler) {
      jQuery(bus).on(evt + ".ads", function (e, name) { handler(name); });
    });
  };
}

// Node: exported for unit testing (inert in the browser).
if (typeof module !== "undefined" && module.exports) {
  module.exports = { createAdController: createAdController };
}
