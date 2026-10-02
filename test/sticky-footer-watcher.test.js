"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { createStickyFooterWatcher, STICKY_FOOTER_ZERO_HEIGHT, STICKY_FOOTER_BODY_CLASS } = require("../html/sticky-footer-watcher.js");

function harness() {
  let footer = null;
  let height = 0;
  const values = [];
  const watcher = createStickyFooterWatcher(
    () => footer,
    (el) => (el === footer ? height : 0),
    (value) => values.push(value)
  );
  return {
    watcher,
    values,
    setFooter: (el) => { footer = el; },
    setHeight: (h) => { height = h; },
  };
}

test("writes the measured height when the footer is present", () => {
  const h = harness();
  h.setFooter({});
  h.setHeight(90);
  h.watcher.sync();
  assert.deepStrictEqual(h.values, ["90px"]);
});

test("writes zero height when the footer is absent", () => {
  const h = harness();
  h.watcher.sync();
  assert.deepStrictEqual(h.values, [STICKY_FOOTER_ZERO_HEIGHT]);
});

test("a height change on the same footer updates the value", () => {
  const h = harness();
  h.setFooter({});
  h.setHeight(90);
  h.watcher.sync();
  h.setHeight(100);
  h.watcher.sync();
  assert.deepStrictEqual(h.values, ["90px", "100px"]);
});

test("footer disappearing after being present resets to zero", () => {
  const h = harness();
  h.setFooter({});
  h.setHeight(90);
  h.watcher.sync();
  h.setFooter(null);
  h.watcher.sync();
  assert.deepStrictEqual(h.values, ["90px", STICKY_FOOTER_ZERO_HEIGHT]);
});

test("body class is added only while a footer is present", () => {
  const classes = new Set();
  const doc = {
    body: { classList: { toggle: (name, on) => { on ? classes.add(name) : classes.delete(name); } } },
  };
  let footer = { height: 90 };
  const watcher = createStickyFooterWatcher(
    () => footer,
    (el) => el.height,
    (value) => doc.body.classList.toggle(STICKY_FOOTER_BODY_CLASS, value !== STICKY_FOOTER_ZERO_HEIGHT)
  );

  watcher.sync();
  assert.strictEqual(classes.has(STICKY_FOOTER_BODY_CLASS), true);

  footer = null;
  watcher.sync();
  assert.strictEqual(classes.has(STICKY_FOOTER_BODY_CLASS), false);
});
