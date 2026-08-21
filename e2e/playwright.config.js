// @ts-check
const { defineConfig, devices } = require("@playwright/test");

// Target selection:
//   BASE_URL  — where to run (default local Docker recipe). e.g. https://globe.dev.adsbexchange.com
//   TARGET    — "local" (default) or "dev". Controls global-setup: local seeds a static aircraft
//               fixture (deterministic, offline); dev uses the live site (needs VPN + live aircraft).
const BASE_URL = process.env.BASE_URL || "http://localhost:8080";
const TARGET = process.env.TARGET || (BASE_URL.includes("localhost") ? "local" : "dev");

module.exports = defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false, // ad slots are page-global; keep runs isolated/serial
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  globalSetup: require.resolve("./global-setup.js"),
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ignoreHTTPSErrors: true,
  },
  // TARGET is surfaced to specs/global-setup via env; keep it explicit for readability.
  metadata: { target: TARGET, baseURL: BASE_URL },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1400, height: 900 } } },
    { name: "mobile", use: { ...devices["Pixel 5"] } }, // ~393px wide, <768px → mobile layout
  ],
});
