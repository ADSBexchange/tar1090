"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { createPanelWatcher } = require("../html/panel-watcher.js");

// Harness: controllable visibility, captured emits, manual defer flush.
function harness(initialVisible) {
  let visible = initialVisible;
  const emits = [];
  const deferred = [];
  const watcher = createPanelWatcher(
    "panel",
    () => visible,
    (name, type) => emits.push(name + ":" + type),
    (cb) => deferred.push(cb)
  );
  return {
    watcher,
    emits,
    set: (v) => { visible = v; },
    flush: () => { deferred.splice(0).forEach((cb) => cb()); },
  };
}

test("emits open once when a hidden panel becomes visible", () => {
  const h = harness(false);
  h.set(true);
  h.watcher.notifyChanged();
  h.flush();
  assert.deepStrictEqual(h.emits, ["panel:open"]);
});

test("hidden panel at init emits nothing", () => {
  const h = harness(false);
  h.watcher.notifyChanged();
  h.flush();
  assert.deepStrictEqual(h.emits, []);
});

test("visible panel at init emits open", () => {
  const h = harness(true);
  h.watcher.notifyChanged();
  h.flush();
  assert.deepStrictEqual(h.emits, ["panel:open"]);
});

test("a hidden->shown->hidden flip in one tick (aircraft switch) emits nothing new", () => {
  const h = harness(true);
  h.watcher.notifyChanged();
  h.flush(); // baseline open
  assert.deepStrictEqual(h.emits, ["panel:open"]);

  // switch: deselect hides, select re-shows, all before the debounce settles
  h.set(false);
  h.watcher.notifyChanged();
  h.set(true);
  h.watcher.notifyChanged();
  h.flush();

  assert.deepStrictEqual(h.emits, ["panel:open"]); // no close, no second open
});

test("emits close when a visible panel is hidden", () => {
  const h = harness(true);
  h.watcher.notifyChanged();
  h.flush(); // open
  h.set(false);
  h.watcher.notifyChanged();
  h.flush();
  assert.deepStrictEqual(h.emits, ["panel:open", "panel:close"]);
});

test("multiple mutations coalesce into a single settle", () => {
  const h = harness(false);
  h.set(true);
  h.watcher.notifyChanged();
  h.watcher.notifyChanged();
  h.watcher.notifyChanged();
  h.flush();
  assert.deepStrictEqual(h.emits, ["panel:open"]); // one emit, not three
});
