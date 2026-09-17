// @ts-check
const { defineConfig, devices } = require("@playwright/test");

// BASE_URL: where to run (default local recipe). TARGET: "local" or "dev" (derived from BASE_URL).
const BASE_URL = process.env.BASE_URL || "http://localhost:8080";
const TARGET = process.env.TARGET || (BASE_URL.includes("localhost") ? "local" : "dev");

module.exports = defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  workers: 1, // sequential — tests share one local backend (readsb)
  reporter: [["list"], ["html", { open: "never" }]],
  globalSetup: require.resolve("./global-setup.js"),
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ignoreHTTPSErrors: true,
  },
  metadata: { target: TARGET, baseURL: BASE_URL },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1400, height: 900 } } },
    { name: "mobile", use: { ...devices["Pixel 5"] } },
  ],
});
