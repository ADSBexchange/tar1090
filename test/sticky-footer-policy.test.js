"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { STICKY_FOOTER_MAX_WIDTH, viewportAllowsStickyFooter, shouldDisableStickyFooter } = require("../html/sticky-footer-policy.js");

test("width at or below the breakpoint is sticky footer width", () => {
  assert.strictEqual(viewportAllowsStickyFooter(STICKY_FOOTER_MAX_WIDTH), true);
  assert.strictEqual(viewportAllowsStickyFooter(STICKY_FOOTER_MAX_WIDTH - 1), true);
  assert.strictEqual(viewportAllowsStickyFooter(STICKY_FOOTER_MAX_WIDTH + 1), false);
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
