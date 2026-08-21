// Global setup. The suite is DOM-driven (panels toggled in-page), so it needs no aircraft, no
// Docker orchestration, and no seeding — it runs against whatever BASE_URL points at. This hook just
// logs the resolved target so the run is self-documenting. (An optional real-aircraft fixture lives in
// fixtures/aircraft.json for anyone doing a manual "real selection" run; the CI suite does not use it.)
module.exports = async () => {
  const baseURL = process.env.BASE_URL || "http://localhost:8080";
  const target = process.env.TARGET || (baseURL.includes("localhost") ? "local" : "dev");
  console.log(`[e2e] target=${target}  baseURL=${baseURL}`);
  if (target === "dev") {
    console.log("[e2e] dev target: requires network access to globe.dev (VPN). Asserts wiring; fills are live/non-deterministic.");
  }
};
