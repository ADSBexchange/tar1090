"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { AdSlots, AdContainers, createAdSlotManager } = require("../html/ad-slots.js");

const INDEX_HTML = fs.readFileSync(path.join(__dirname, "..", "html", "index.html"), "utf8");
const ID_SELECTOR = /^#([\w-]+)$/;
const FREESTAR_AD_ID = /<[^>]*\bdata-freestar-ad\b[^>]*\bid="([^"]+)"/g;
const DATA_FREESTAR_AD = "[data-freestar-ad]";
const VENDOR_INJECTED_IDS = ["fs-sticky-footer"];
const IN_MAP_CONTAINER_ID = "tracking_leaderboard_container";

function makeFreestar() {
  const calls = { newAdSlots: [], deleteAdSlots: [] };
  const freestar = {
    queue: { push: (fn) => fn() }, // run queued work immediately for the test
    newAdSlots: (slots) => calls.newAdSlots.push(slots),
    deleteAdSlots: (ids) => calls.deleteAdSlots.push(ids),
  };
  return { freestar, calls };
}

test("request creates a slot once and is idempotent while active", () => {
  const { freestar, calls } = makeFreestar();
  const manager = createAdSlotManager(freestar, () => false);

  const first = manager.request([AdSlots.LEFT_RAIL]);
  const second = manager.request([AdSlots.LEFT_RAIL]);

  assert.deepStrictEqual(first, [AdSlots.LEFT_RAIL]);
  assert.deepStrictEqual(second, []); // no re-request while already active
  assert.strictEqual(calls.newAdSlots.length, 1);
  assert.deepStrictEqual(calls.newAdSlots[0], [
    { placementName: AdSlots.LEFT_RAIL, slotId: AdSlots.LEFT_RAIL },
  ]);
});

test("destroy removes only active slots and is idempotent", () => {
  const { freestar, calls } = makeFreestar();
  const manager = createAdSlotManager(freestar, () => false);

  manager.request([AdSlots.FULL_DETAILS_LEADERBOARD, AdSlots.FULL_DETAILS_FOOTER]);
  const removed = manager.destroy([AdSlots.FULL_DETAILS_LEADERBOARD, AdSlots.FULL_DETAILS_FOOTER]);
  const removedAgain = manager.destroy([AdSlots.FULL_DETAILS_LEADERBOARD, AdSlots.FULL_DETAILS_FOOTER]);

  assert.deepStrictEqual(
    removed.slice().sort(),
    [AdSlots.FULL_DETAILS_FOOTER, AdSlots.FULL_DETAILS_LEADERBOARD].sort()
  );
  assert.deepStrictEqual(removedAgain, []); // nothing left to destroy
  assert.strictEqual(calls.deleteAdSlots.length, 1);
});

test("re-open after close requests a fresh ad", () => {
  const { freestar, calls } = makeFreestar();
  const manager = createAdSlotManager(freestar, () => false);

  manager.request([AdSlots.FULL_DETAILS_LEADERBOARD]);
  manager.destroy([AdSlots.FULL_DETAILS_LEADERBOARD]);
  manager.request([AdSlots.FULL_DETAILS_LEADERBOARD]);

  assert.strictEqual(calls.newAdSlots.length, 2); // fresh request on re-open
  assert.strictEqual(calls.deleteAdSlots.length, 1);
});

test("subscribers never request ads", () => {
  const { freestar, calls } = makeFreestar();
  const manager = createAdSlotManager(freestar, () => true);

  const result = manager.request([AdSlots.LEFT_RAIL]);

  assert.deepStrictEqual(result, []);
  assert.strictEqual(calls.newAdSlots.length, 0);
});

test("request only adds the currently-inactive slots", () => {
  const { freestar, calls } = makeFreestar();
  const manager = createAdSlotManager(freestar, () => false);

  manager.request([AdSlots.FULL_DETAILS_LEADERBOARD]);
  const added = manager.request([AdSlots.FULL_DETAILS_LEADERBOARD, AdSlots.FULL_DETAILS_FOOTER]);

  assert.deepStrictEqual(added, [AdSlots.FULL_DETAILS_FOOTER]);
  assert.strictEqual(calls.newAdSlots.length, 2);
  assert.deepStrictEqual(calls.newAdSlots[1], [
    { placementName: AdSlots.FULL_DETAILS_FOOTER, slotId: AdSlots.FULL_DETAILS_FOOTER },
  ]);
});

function markupIds(selectors) {
  return selectors.map((selector) => ID_SELECTOR.exec(selector))
    .filter(Boolean)
    .map((match) => match[1])
    .filter((id) => !VENDOR_INJECTED_IDS.includes(id));
}

function freestarAdIds(html) {
  return Array.from(html.matchAll(FREESTAR_AD_ID), (match) => match[1]);
}

function coversFreestarAd(selectors, id) {
  return selectors.includes(DATA_FREESTAR_AD) || selectors.includes(`#${id}`);
}

test("AdContainers is a non-empty list of selectors", () => {
  assert.ok(Array.isArray(AdContainers), "AdContainers is exported");
  assert.ok(AdContainers.length > 0);
  for (const selector of AdContainers) assert.strictEqual(typeof selector, "string");
});

test("every markup-owned id in AdContainers exists in index.html", () => {
  const ids = markupIds(AdContainers);
  assert.ok(ids.includes(IN_MAP_CONTAINER_ID), `${IN_MAP_CONTAINER_ID} is an ad container`);
  for (const id of ids) assert.ok(INDEX_HTML.includes(`id="${id}"`), `index.html has id="${id}"`);
});

test("every data-freestar-ad element in index.html is covered by AdContainers", () => {
  const ids = freestarAdIds(INDEX_HTML);
  assert.ok(ids.length > 0, "index.html declares freestar ad slots");
  for (const id of ids) assert.ok(coversFreestarAd(AdContainers, id), `${id} is covered`);
});
