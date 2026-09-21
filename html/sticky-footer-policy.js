"use strict";

const STICKY_FOOTER_MAX_WIDTH = 768;
const STICKY_FOOTER_FORCE_PARAM = "stickyfooter";
const STICKY_FOOTER_FORCE_VALUE = "force";

function isStickyFooterForced(search) {
  return new URLSearchParams(search || "").get(STICKY_FOOTER_FORCE_PARAM) === STICKY_FOOTER_FORCE_VALUE;
}

function viewportAllowsStickyFooter(width, search) {
  return isStickyFooterForced(search) || width <= STICKY_FOOTER_MAX_WIDTH;
}

function shouldDisableStickyFooter(isPremium, width, search) {
  return Boolean(isPremium) || !viewportAllowsStickyFooter(width, search);
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    STICKY_FOOTER_MAX_WIDTH,
    STICKY_FOOTER_FORCE_PARAM,
    STICKY_FOOTER_FORCE_VALUE,
    isStickyFooterForced,
    viewportAllowsStickyFooter,
    shouldDisableStickyFooter,
  };
}
