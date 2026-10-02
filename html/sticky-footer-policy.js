"use strict";

const FREESTAR_DESKTOP_MIN_WIDTH = 768;

function viewportAllowsStickyFooter(width) {
  return width < FREESTAR_DESKTOP_MIN_WIDTH;
}

function shouldDisableStickyFooter(isPremium, width) {
  return Boolean(isPremium) || !viewportAllowsStickyFooter(width);
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    FREESTAR_DESKTOP_MIN_WIDTH,
    viewportAllowsStickyFooter,
    shouldDisableStickyFooter,
  };
}
