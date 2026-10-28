"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const SOURCE = fs.readFileSync(path.join(__dirname, "../html/turnstile-gate.js"), "utf8");
const STORAGE_KEY = "globeTurnstileExp";

function memoryStorage(initial) {
  const data = Object.assign({}, initial);
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
  };
}

// Loads turnstile-gate.js into a fresh context with a stub DOM, Turnstile API
// and token endpoint. Timers are recorded, and run only when a test calls one.
// `onExecute` replaces the default challenge, which passes at once.
function loadGate({ storage, mintExp = 2000000000, onExecute } = {}) {
  const calls = { scripts: 0, executes: 0, posts: 0 };
  const timers = [];
  const elements = [];
  let renderOptions = null;
  const ctx = {
    turnstileSiteKey: "0xSITEKEY",
    localStorage: storage,
    Date,
    JSON,
    Promise,
    parseInt,
    String,
    Error,
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearTimeout: () => {},
    fetch: () => {
      calls.posts++;
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, exp: mintExp }) });
    },
    turnstile: {
      render: (_el, opts) => { renderOptions = opts; return "w1"; },
      execute: () => {
        calls.executes++;
        if (onExecute) onExecute(renderOptions);
        else Promise.resolve().then(() => renderOptions.callback("tok"));
      },
      reset: () => {},
    },
  };
  ctx.document = {
    body: { appendChild: () => {} },
    head: {
      appendChild: () => {
        calls.scripts++;
        Promise.resolve().then(() => ctx.globeOnTurnstileLoad());
      },
    },
    getElementById: () => null,
    createElement: () => {
      const el = { style: {}, setAttribute: () => {}, appendChild: () => {}, addEventListener: () => {} };
      elements.push(el);
      return el;
    },
    addEventListener: () => {},
    hidden: false,
  };
  ctx.addEventListener = () => {};
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(SOURCE, ctx);
  return { ctx, calls, timers, elements };
}

const flush = () => new Promise((r) => setImmediate(r));
const overlayOf = (elements) => elements.find((el) => el.id === "turnstile-gate-overlay");
const titleOf = (elements) => elements.find((el) => el.id === "turnstile-gate-title");

const nowSec = () => Math.floor(Date.now() / 1000);

test("mints on load when nothing is stored, and stores the expiry", async () => {
  const storage = memoryStorage();
  const exp = nowSec() + 3600;
  const { ctx, calls } = loadGate({ storage, mintExp: exp });
  await ctx.globeTokenReady;
  assert.strictEqual(calls.executes, 1);
  assert.strictEqual(calls.posts, 1);
  assert.strictEqual(storage.data[STORAGE_KEY], String(exp));
});

test("skips the challenge when a stored expiry has life left", async () => {
  const storage = memoryStorage({ [STORAGE_KEY]: String(nowSec() + 1800) });
  const { ctx, calls } = loadGate({ storage });
  await ctx.globeTokenReady;
  assert.strictEqual(calls.scripts, 0);
  assert.strictEqual(calls.executes, 0);
  assert.strictEqual(calls.posts, 0);
});

test("mints when the stored expiry is inside the refresh margin", async () => {
  const storage = memoryStorage({ [STORAGE_KEY]: String(nowSec() + 120) });
  const { ctx, calls } = loadGate({ storage });
  await ctx.globeTokenReady;
  assert.strictEqual(calls.posts, 1);
});

test("a forced mint ignores and replaces the stored expiry", async () => {
  const storage = memoryStorage({ [STORAGE_KEY]: String(nowSec() + 1800) });
  const exp = nowSec() + 3600;
  const { ctx, calls } = loadGate({ storage, mintExp: exp });
  await ctx.globeTokenReady;
  await ctx.globeEnsureToken(true);
  assert.strictEqual(calls.posts, 1);
  assert.strictEqual(storage.data[STORAGE_KEY], String(exp));
});

test("mints when storage throws", async () => {
  const throwing = {
    getItem: () => { throw new Error("blocked"); },
    setItem: () => { throw new Error("blocked"); },
    removeItem: () => { throw new Error("blocked"); },
  };
  const { ctx, calls } = loadGate({ storage: throwing });
  await ctx.globeTokenReady;
  assert.strictEqual(calls.posts, 1);
});

test("the refresh timer adopts a fresher expiry stored by another tab", async () => {
  const storage = memoryStorage({ [STORAGE_KEY]: String(nowSec() + 1800) });
  const { ctx, calls, timers } = loadGate({ storage });
  await ctx.globeTokenReady;
  const refresh = timers.find((t) => t.ms > 60 * 1000);
  const fresher = nowSec() + 3600;
  storage.data[STORAGE_KEY] = String(fresher);
  refresh.fn();
  assert.strictEqual(calls.posts, 0);
  const rescheduled = timers[timers.length - 1];
  assert.ok(rescheduled.ms > 50 * 60 * 1000);
});

test("the refresh timer mints when no fresher expiry is stored", async () => {
  const storage = memoryStorage({ [STORAGE_KEY]: String(nowSec() + 1800) });
  const { ctx, calls, timers } = loadGate({ storage });
  await ctx.globeTokenReady;
  const refresh = timers.find((t) => t.ms > 60 * 1000);
  storage.data[STORAGE_KEY] = String(nowSec() + 60);
  refresh.fn();
  await ctx.globeEnsureToken(false);
  assert.strictEqual(calls.posts, 1);
});

test("a tick after the silent-challenge timeout still mints", async () => {
  const storage = memoryStorage();
  let opts = null;
  const { ctx, calls, timers, elements } = loadGate({
    storage,
    onExecute: (o) => { opts = o; o["before-interactive-callback"](); },
  });
  await flush();
  assert.strictEqual(overlayOf(elements).style.visibility, "visible");
  const timeout = timers.find((t) => t.ms === 30 * 1000);
  timeout.fn();
  timers[timers.length - 1].fn();
  assert.strictEqual(calls.posts, 0);
  opts["after-interactive-callback"]();
  opts.callback("tok");
  await ctx.globeTokenReady;
  assert.strictEqual(calls.posts, 1);
  assert.strictEqual(overlayOf(elements).style.visibility, "hidden");
});

test("a failure while the checkbox is shown replaces it with the reload message", async () => {
  const storage = memoryStorage();
  const { ctx, calls, elements } = loadGate({
    storage,
    onExecute: (o) => { o["before-interactive-callback"](); o["error-callback"](); },
  });
  await ctx.globeTokenReady;
  assert.strictEqual(calls.posts, 0);
  assert.strictEqual(overlayOf(elements).style.visibility, "visible");
  assert.strictEqual(titleOf(elements).textContent, "Flight data could not be verified");
  assert.ok(elements.some((el) => /challenges\.cloudflare\.com/.test(el.textContent || "")));
});

test("a failure during a silent challenge keeps the overlay hidden", async () => {
  const storage = memoryStorage();
  const { ctx, elements } = loadGate({
    storage,
    onExecute: (o) => { o["error-callback"](); },
  });
  await ctx.globeTokenReady;
  assert.strictEqual(overlayOf(elements).style.visibility, "hidden");
});
