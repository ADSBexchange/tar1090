"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { STICKY_FOOTER_MAX_WIDTH, isStickyFooterForced, viewportAllowsStickyFooter, shouldDisableStickyFooter } = require("../html/sticky-footer-policy.js");

test("force parameter is recognised only at its exact value", () => {
  assert.strictEqual(isStickyFooterForced("?stickyfooter=force"), true);
  assert.strictEqual(isStickyFooterForced("?stickyfooter=off"), false);
  assert.strictEqual(isStickyFooterForced("?other=force"), false);
  assert.strictEqual(isStickyFooterForced(""), false);
});

test("width at or below the breakpoint is sticky footer width", () => {
  assert.strictEqual(viewportAllowsStickyFooter(STICKY_FOOTER_MAX_WIDTH, ""), true);
  assert.strictEqual(viewportAllowsStickyFooter(STICKY_FOOTER_MAX_WIDTH - 1, ""), true);
  assert.strictEqual(viewportAllowsStickyFooter(STICKY_FOOTER_MAX_WIDTH + 1, ""), false);
});

test("force overrides a desktop width", () => {
  assert.strictEqual(viewportAllowsStickyFooter(1400, "?stickyfooter=force"), true);
});

test("desktop width disables the sticky footer", () => {
  assert.strictEqual(shouldDisableStickyFooter(false, 1400, ""), true);
});

test("mobile width enables the sticky footer", () => {
  assert.strictEqual(shouldDisableStickyFooter(false, 400, ""), false);
});

test("premium disables the sticky footer at every width", () => {
  assert.strictEqual(shouldDisableStickyFooter(true, 400, ""), true);
  assert.strictEqual(shouldDisableStickyFooter(true, 1400, ""), true);
});

test("premium beats the force parameter", () => {
  assert.strictEqual(shouldDisableStickyFooter(true, 1400, "?stickyfooter=force"), true);
});
