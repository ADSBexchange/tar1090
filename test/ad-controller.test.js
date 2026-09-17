"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { createAdController } = require("../html/ad-controller.js");

function fakeBus() {
  const handlers = {};
  return {
    on: (evt, h) => { handlers[evt] = h; },
    fire: (evt, name) => { if (handlers[evt]) handlers[evt](name); },
  };
}

function fakeAdSlots() {
  const calls = { request: [], destroy: [] };
  return {
    calls,
    request: (ids) => calls.request.push(ids),
    destroy: (ids) => calls.destroy.push(ids),
  };
}

test("panel:open requests the panel's configured slots", () => {
  const bus = fakeBus();
  const adSlots = fakeAdSlots();
  createAdController({ fullDetails: ["leaderboard", "footer"] }, adSlots, bus.on);

  bus.fire("panel:open", "fullDetails");

  assert.deepStrictEqual(adSlots.calls.request, [["leaderboard", "footer"]]);
  assert.deepStrictEqual(adSlots.calls.destroy, []);
});

test("panel:close destroys the panel's configured slots", () => {
  const bus = fakeBus();
  const adSlots = fakeAdSlots();
  createAdController({ sidebar: ["medrec", "rightRail"] }, adSlots, bus.on);

  bus.fire("panel:close", "sidebar");

  assert.deepStrictEqual(adSlots.calls.destroy, [["medrec", "rightRail"]]);
  assert.deepStrictEqual(adSlots.calls.request, []);
});

test("events for an unknown panel are ignored", () => {
  const bus = fakeBus();
  const adSlots = fakeAdSlots();
  createAdController({ known: ["s1"] }, adSlots, bus.on);

  bus.fire("panel:open", "unknown");
  bus.fire("panel:close", "unknown");

  assert.deepStrictEqual(adSlots.calls.request, []);
  assert.deepStrictEqual(adSlots.calls.destroy, []);
});
