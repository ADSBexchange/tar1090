// @ts-check
// Ads are revenue-generating and NOT automated (fills/rendering are non-deterministic and need the live
// Freestar stack). Verified MANUALLY on dev — this always-skipped test keeps that visible each run.
const { test } = require("@playwright/test");

test.skip("ADS (revenue) — verify MANUALLY on dev; not automated", async () => {
  // On dev, each browser, desktop + mobile:
  //   Non-premium (incognito): ads above the altitude bar (bottom-right; occasionally top-left),
  //     right menu top + bottom, occasional full-page takeover, and an ad atop Full Details.
  //   Premium: no ads at all.
});
