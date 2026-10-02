"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { isPremium } = require("../html/premium.js");

test("returns true when the subscriber cookie is present", () => {
  assert.strictEqual(isPremium("adsbx_subscriber=1"), true);
});

test("returns true when the subscriber cookie is among other cookies", () => {
  assert.strictEqual(isPremium("foo=bar; adsbx_subscriber=1; baz=qux"), true);
});

test("returns false when the subscriber cookie is absent", () => {
  assert.strictEqual(isPremium("foo=bar; baz=qux"), false);
});

test("returns false for an empty cookie string", () => {
  assert.strictEqual(isPremium(""), false);
});

test("returns true when a malformed cookie precedes the subscriber cookie", () => {
  assert.doesNotThrow(() => {
    assert.strictEqual(isPremium("promo=50%off; adsbx_subscriber=1"), true);
  });
});

test("returns false when a malformed cookie is present with no subscriber cookie", () => {
  assert.doesNotThrow(() => {
    assert.strictEqual(isPremium("promo=50%off; foo=bar"), false);
  });
});

test("returns false for a lookalike prefix that is not an exact match", () => {
  assert.strictEqual(isPremium("x_adsbx_subscriber=1"), false);
});

test("does not throw on a truncated escape sequence", () => {
  assert.doesNotThrow(() => {
    assert.strictEqual(isPremium("bad=%E2; adsbx_subscriber=1"), true);
  });
});
