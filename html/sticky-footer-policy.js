"use strict";

const STICKY_FOOTER_MAX_WIDTH = 768;

function viewportAllowsStickyFooter(width) {
  return width <= STICKY_FOOTER_MAX_WIDTH;
}

function shouldDisableStickyFooter(isPremium, width) {
  return Boolean(isPremium) || !viewportAllowsStickyFooter(width);
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    STICKY_FOOTER_MAX_WIDTH,
    viewportAllowsStickyFooter,
    shouldDisableStickyFooter,
  };
}
