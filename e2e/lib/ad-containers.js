// @ts-check
const { expect } = require("./globe");

const FAKE_AD_CLASS = "e2e-ad";
const FAKE_AD_FILL = "repeating-linear-gradient(45deg,#c33,#c33 8px,#e66 8px,#e66 16px)";
const DEFAULT_AD_SIZE = { width: 300, height: 250 };
const VENDOR_HOST_Z_INDEX = 2147483600;

async function fillAdContainers(page, vendorHosts) {
  const result = await page.evaluate(({ hosts, adClass, fill, defaultSize, zIndex }) => {
    const selector = AdContainers.join(", ");
    const sizeOf = (node) => {
      const match = /__(\d+)x(\d+)/.exec(node.getAttribute("data-freestar-ad") || "");
      return match ? { width: Number(match[1]), height: Number(match[2]) } : defaultSize;
    };
    const fakeAd = (size) => {
      const box = document.createElement("div");
      box.className = adClass;
      box.style.cssText = `width:${size.width}px;height:${size.height}px;background:${fill}`;
      return box;
    };
    const innermost = Array.from(document.querySelectorAll(selector)).filter((node) => !node.querySelector(selector));
    const mapContainer = document.getElementById("map_container");
    for (const node of innermost) node.appendChild(fakeAd(sizeOf(node)));
    const map = mapContainer.getBoundingClientRect();
    const unmatchedHosts = [];
    for (const host of hosts) {
      const node = document.createElement("div");
      node.id = host.id;
      node.style.cssText = `position:fixed;z-index:${zIndex}`;
      if (host.place === "video") { node.style.left = `${map.left + 50}px`; node.style.top = `${map.top}px`; }
      else { node.style.left = "50%"; node.style.bottom = "0"; node.style.transform = "translateX(-50%)"; }
      node.appendChild(fakeAd(host));
      document.body.appendChild(node);
      if (!node.matches(selector)) unmatchedHosts.push(host.id);
    }
    return {
      filled: innermost.map((node) => node.id),
      inMap: innermost.filter((node) => mapContainer.contains(node)).map((node) => node.id),
      unmatchedHosts,
    };
  }, { hosts: vendorHosts, adClass: FAKE_AD_CLASS, fill: FAKE_AD_FILL, defaultSize: DEFAULT_AD_SIZE, zIndex: VENDOR_HOST_Z_INDEX });
  expect(result.inMap, `ad containers inside the map, of ${result.filled.join(", ")}`).not.toEqual([]);
  expect(result.unmatchedHosts, "vendor ad hosts not matched by AdContainers").toEqual([]);
  return result;
}

module.exports = { FAKE_AD_CLASS, fillAdContainers };
