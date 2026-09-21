"use strict";

const PREMIUM_COOKIE_PREFIX = "adsbx_subscriber=";

function isPremium(cookieString) {
  try {
    const pairs = (cookieString || "").split(";");
    for (let i = 0; i < pairs.length; i++) {
      let pair = pairs[i];
      while (pair.charAt(0) === " ") { pair = pair.substring(1); }
      let decoded;
      try {
        decoded = decodeURIComponent(pair);
      } catch (e) {
        decoded = pair;
      }
      if (decoded.indexOf(PREMIUM_COOKIE_PREFIX) === 0) { return true; }
    }
    return false;
  } catch (e) {
    return false;
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { isPremium, PREMIUM_COOKIE_PREFIX };
}
