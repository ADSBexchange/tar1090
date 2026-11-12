// @ts-check
const { expect } = require("@playwright/test");

const DEFAULT_MIN_GAP_PX = 6;
const INTERACTIVE_SELECTOR = "button, a[href], input, select, textarea, [role=button], [role=link], [tabindex]:not([tabindex='-1'])";
const POSITIONED = new Set(["absolute", "fixed", "sticky"]);
const MAX_MEDIA_SHARE = 0.1;

async function collectBoxes(frame, offset, minSize, coveredBy = null) {
  const boxes = await frame.evaluate(
    ({ interactiveSelector, positioned, minSize, maxMediaShare, coveredBy }) => {
      const out = [];
      const describe = (el) => {
        const id = el.id ? `#${el.id}` : "";
        const cls = typeof el.className === "string" && el.className.trim() ? `.${el.className.trim().split(/\s+/).join(".")}` : "";
        const text = (el.innerText || el.getAttribute("aria-label") || "").trim().slice(0, 30);
        return `${el.tagName.toLowerCase()}${id}${cls}${text ? ` "${text}"` : ""}`;
      };
      const visible = (el, r) => {
        if (r.width < minSize || r.height < minSize) return false;
        const cs = getComputedStyle(el);
        if (cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) === 0) return false;
        return true;
      };
      const viewportArea = window.innerWidth * window.innerHeight;
      const isCandidate = (el) => {
        if (el.matches(interactiveSelector)) return true;
        const cs = getComputedStyle(el);
        if (!positioned.includes(cs.position)) return false;
        if (el.matches("img, svg, video, canvas")) {
          const r = el.getBoundingClientRect();
          return r.width * r.height < viewportArea * maxMediaShare;
        }
        return (el.innerText || "").trim().length > 0;
      };
      const candidates = Array.from(document.querySelectorAll("body *")).filter(isCandidate);
      const isComponent = (el) => el.matches(interactiveSelector) || !candidates.some((other) => other !== el && el.contains(other));
      for (const el of candidates) {
        if (!isComponent(el)) continue;
        const r = el.getBoundingClientRect();
        if (!visible(el, r)) continue;
        if (coveredBy) {
          const cover = document.querySelector(coveredBy);
          const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          if (cover && !cover.contains(el) && top && cover.contains(top)) continue;
        }
        out.push({ name: describe(el), x: r.left, y: r.top, w: r.width, h: r.height });
      }
      return out;
    },
    { interactiveSelector: INTERACTIVE_SELECTOR, positioned: Array.from(POSITIONED), minSize, maxMediaShare: MAX_MEDIA_SHARE, coveredBy }
  );
  const own = boxes.map((b) => ({ ...b, x: b.x + offset.x, y: b.y + offset.y }));
  let nested = [];
  for (const child of frame.childFrames()) {
    const el = await child.frameElement().catch(() => null);
    if (!el) continue;
    const r = await el.boundingBox();
    if (!r) continue;
    try {
      nested = nested.concat(await collectBoxes(child, { x: r.x, y: r.y }, minSize));
    } catch {
      continue;
    }
  }
  return own.concat(nested);
}

function intersects(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

function gap(a, b) {
  const dx = Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w));
  const dy = Math.max(0, Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h));
  return Math.hypot(dx, dy);
}

function contains(outer, inner) {
  return inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;
}

async function uiLayoutProblems(page, { within, minGapPx = DEFAULT_MIN_GAP_PX, minSize = 4, ignore = [], coveredBy = null } = {}) {
  let region = null;
  if (within) {
    region = await page.locator(within).first().boundingBox();
    if (!region) return [`region ${within} is not visible`];
    region = { x: region.x, y: region.y, w: region.width, h: region.height };
  }
  const all = await collectBoxes(page.mainFrame(), { x: 0, y: 0 }, minSize, coveredBy);
  const boxes = all.filter((b) => !region || intersects(b, region)).filter((b) => !ignore.some((pattern) => b.name.includes(pattern)));
  const problems = [];
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      if (contains(a, b) || contains(b, a)) continue;
      if (intersects(a, b)) problems.push(`overlap: ${a.name} and ${b.name}`);
      else if (gap(a, b) < minGapPx) problems.push(`too close (${gap(a, b).toFixed(1)}px < ${minGapPx}px): ${a.name} and ${b.name}`);
    }
  }
  return problems;
}

async function expectNoUiOverlap(page, options = {}) {
  const problems = await uiLayoutProblems(page, options);
  expect(problems, problems.join("\n")).toEqual([]);
}

module.exports = { expectNoUiOverlap, uiLayoutProblems, DEFAULT_MIN_GAP_PX };
