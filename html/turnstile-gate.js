// Historical-data access gate (client half).
//
// On the ADSBx globe, historical trace/heatmap files under /globe_history/ are
// protected by the globe-turnstile Cloudflare Worker: a request needs a
// short-lived signed cookie that is only issued after a Cloudflare Turnstile
// challenge. This module obtains that cookie on page load and refreshes it
// before it expires, so a real browser transparently keeps access while bulk
// scrapers (which never run the challenge) do not.
//
// It is inert unless `turnstileSiteKey` is a real key: on upstream tar1090
// installs and non-globe deployments the whole module is a no-op, and the
// exported helpers behave as pass-throughs. Enabled-state is resolved lazily at
// startup (DOMContentLoaded), after all config-*.js globals have loaded, so this
// file's position in the script order does not matter.
//
// Exports (globals, since tar1090 has no module system):
//   ghTokenReady          - Promise, resolves once an initial token attempt
//                           settles (or immediately when disabled)
//   ghEnsureToken(force)  - Promise, mint a token now (called on a 403)
//   ghGateActive()        - bool, whether the gate is active on this page
//   ghEnforcing()         - bool, whether access should block on a token

"use strict";

var ghTokenReady;

(function () {
    var TOKEN_ENDPOINT = '/gh-token';
    var TURNSTILE_API = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    var REFRESH_MARGIN_MS = 5 * 60 * 1000; // re-mint 5 min before expiry
    var RETRY_DELAY_MS = 60 * 1000;        // back off after a failed attempt

    var enabled = false;
    var enforce = false;
    var apiLoading = null;
    var widgetId = null;
    var executedOnce = false;
    var attempt = null;      // { settle, timer } for the challenge currently running
    var inFlight = null;
    var refreshTimer = null;
    var readyResolvedOnce = false;
    var resolveReady;

    ghTokenReady = new Promise(function (res) { resolveReady = res; });

    function settleReadyOnce() {
        if (!readyResolvedOnce) { readyResolvedOnce = true; resolveReady(); }
    }

    function computeEnabled() {
        var k = (typeof turnstileSiteKey !== 'undefined') ? turnstileSiteKey : '';
        // Guard against an unrendered template placeholder ("__TURNSTILE_SITE_KEY__").
        enabled = !!k && k.indexOf('__') !== 0;
        enforce = enabled && (typeof turnstileEnforce !== 'undefined') && turnstileEnforce === true;
    }

    // Settles the challenge currently in flight, exactly once.
    function settleAttempt(err, token) {
        if (!attempt) return;
        var a = attempt;
        attempt = null;
        if (a.timer) clearTimeout(a.timer);
        if (err) a.reject(err); else a.resolve(token);
    }

    function loadTurnstileApi() {
        if (apiLoading) return apiLoading;
        apiLoading = new Promise(function (resolve, reject) {
            // interaction-only + execution:execute keeps the widget hidden until a
            // challenge genuinely needs interaction, so keep the container in the
            // layout (not display:none) in case that rare fallback UI appears.
            var container = document.getElementById('turnstile-gate-container');
            if (!container) {
                container = document.createElement('div');
                container.id = 'turnstile-gate-container';
                container.style.position = 'fixed';
                container.style.bottom = '0';
                container.style.right = '0';
                container.style.zIndex = '2000';
                document.body.appendChild(container);
            }
            window.ghOnTurnstileLoad = function () {
                try {
                    widgetId = window.turnstile.render('#turnstile-gate-container', {
                        sitekey: turnstileSiteKey,
                        execution: 'execute',
                        appearance: 'interaction-only',
                        callback: function (token) { settleAttempt(null, token); },
                        'error-callback': function () { settleAttempt(new Error('turnstile error')); return true; },
                        'timeout-callback': function () { settleAttempt(new Error('turnstile timeout')); }
                    });
                    resolve(widgetId);
                } catch (e) {
                    reject(e);
                }
            };
            var s = document.createElement('script');
            s.src = TURNSTILE_API + '&onload=ghOnTurnstileLoad';
            s.async = true;
            s.defer = true;
            s.onerror = function () { reject(new Error('turnstile api load failed')); };
            document.head.appendChild(s);
        });
        return apiLoading;
    }

    // Runs the (deferred) Turnstile challenge and resolves with a fresh response
    // token delivered to the render-level callback.
    function getTurnstileToken() {
        return loadTurnstileApi().then(function () {
            return new Promise(function (resolve, reject) {
                // Only one challenge at a time; abandon any prior wait.
                settleAttempt(new Error('superseded'));
                attempt = {
                    resolve: resolve,
                    reject: reject,
                    timer: setTimeout(function () { settleAttempt(new Error('turnstile timeout')); }, 30000)
                };
                try {
                    if (executedOnce) window.turnstile.reset(widgetId);
                    window.turnstile.execute(widgetId);
                    executedOnce = true;
                } catch (e) {
                    settleAttempt(e);
                }
            });
        });
    }

    function scheduleRefresh(expEpochSec) {
        if (refreshTimer) clearTimeout(refreshTimer);
        var msUntil = (expEpochSec * 1000) - Date.now() - REFRESH_MARGIN_MS;
        if (msUntil < 0) msUntil = RETRY_DELAY_MS;
        refreshTimer = setTimeout(function () { doMint(); }, msUntil);
    }

    function backoff() {
        if (refreshTimer) clearTimeout(refreshTimer);
        refreshTimer = setTimeout(function () { doMint(); }, RETRY_DELAY_MS);
    }

    function doMint() {
        if (!enabled) { settleReadyOnce(); return Promise.resolve(); }
        if (inFlight) return inFlight;
        inFlight = getTurnstileToken().then(function (token) {
            return fetch(TOKEN_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: token }),
                credentials: 'same-origin'
            });
        }).then(function (resp) {
            return resp.json().catch(function () { return {}; }).then(function (data) {
                if (resp.ok && data && data.ok && data.exp) {
                    scheduleRefresh(data.exp);
                } else {
                    // Config/verification problem: retry later without wedging the
                    // page. In log-only mode this has no user impact; in enforce
                    // mode the fetch path surfaces a 403 and re-triggers a mint.
                    backoff();
                }
                return data;
            });
        }).catch(function () {
            backoff();
        }).then(function (v) {
            inFlight = null;
            settleReadyOnce();
            return v;
        });
        return inFlight;
    }

    window.ghGateActive = function () { return enabled; };
    window.ghEnforcing = function () { return enforce; };

    window.ghEnsureToken = function (force) {
        if (!enabled) return Promise.resolve();
        if (force && !inFlight && refreshTimer) clearTimeout(refreshTimer);
        return doMint();
    };

    function start() {
        computeEnabled();
        if (!enabled) { settleReadyOnce(); return; }
        doMint();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
})();
