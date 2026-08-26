"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { AdSlots, createAdSlotManager } = require("../html/ad-slots.js");

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
