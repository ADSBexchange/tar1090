"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { viewportAllowsStickyFooter, shouldDisableStickyFooter } = require("../html/sticky-footer-policy.js");

test("width below the breakpoint is sticky footer width", () => {
  assert.strictEqual(viewportAllowsStickyFooter(767), true);
  assert.strictEqual(viewportAllowsStickyFooter(320), true);
});

test("the breakpoint itself is desktop width, matching Freestar's 768px viewport mapping", () => {
  assert.strictEqual(viewportAllowsStickyFooter(768), false);
  assert.strictEqual(shouldDisableStickyFooter(false, 768), true);
});

test("width above the breakpoint is not sticky footer width", () => {
  assert.strictEqual(viewportAllowsStickyFooter(769), false);
});

test("desktop width disables the sticky footer", () => {
  assert.strictEqual(shouldDisableStickyFooter(false, 1400), true);
});

test("mobile width enables the sticky footer", () => {
  assert.strictEqual(shouldDisableStickyFooter(false, 400), false);
});

test("premium disables the sticky footer at every width", () => {
  assert.strictEqual(shouldDisableStickyFooter(true, 400), true);
  assert.strictEqual(shouldDisableStickyFooter(true, 1400), true);
});
