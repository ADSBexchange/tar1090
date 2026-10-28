// Historical-data access gate (client half).
//
// Requests for historical trace/heatmap files under /globe_history/ can require
// a short-lived signed cookie, issued after a Cloudflare Turnstile challenge.
// This module obtains that cookie on page load and refreshes it before it
// expires.
//
// The cookie is HttpOnly, so the page cannot read it. Each successful mint
// stores the cookie's expiry in localStorage instead, shared by every tab on
// the origin. A page load, or a due refresh, that finds a stored expiry more
// than REFRESH_MARGIN_MS away adopts it and runs no challenge, so reloads,
// extra tabs and a tab refreshed by another tab do not each solve one. If the
// cookie is gone despite the stored expiry (cleared cookies, a key rotation),
// the first gated request is refused and its 403 handler re-mints through
// globeEnsureToken, which ignores the stored value.
//
// A page that sets `turnstileGateLazy = true` before this script skips the
// load-time mint and sends its requests with whatever cookie the browser
// already holds, minting only when one of them is refused (a 403 handler calls
// globeEnsureToken). That suits a document whose cookie is normally minted by
// a parent page, such as details.html inside the globe.
//
// It is inert unless `turnstileSiteKey` is a real key: on upstream tar1090
// installs and non-globe deployments the whole module is a no-op, and the
// exported helpers behave as pass-throughs. Enabled-state is resolved lazily at
// startup (DOMContentLoaded), after all config-*.js globals have loaded, so this
// file's position in the script order does not matter.
//
// Exports (globals, since tar1090 has no module system):
//   globeTokenReady          - Promise, resolves once an initial token attempt
//                           settles (or immediately when disabled)
//   globeEnsureToken(force)  - Promise, mint a token now (called on a 403)
//   globeGateActive()        - bool, whether the gate is active on this page
//   globeEnforcing()         - bool, whether access should block on a token

"use strict";

var globeTokenReady;

(function () {
    var TOKEN_ENDPOINT = '/turnstile-token';
    var TURNSTILE_API = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    var REFRESH_MARGIN_MS = 5 * 60 * 1000; // re-mint 5 min before expiry
    var RETRY_DELAY_MS = 60 * 1000;        // back off after a failed attempt
    const ATTEMPT_TIMEOUT_MS = 30 * 1000;  // limit on a silent challenge
    const EXP_STORAGE_KEY = 'globeTurnstileExp';

    var enabled = false;
    var enforce = false;
    var lazy = false;        // mint only on demand, never at load
    var apiLoading = null;
    var widgetId = null;
    var executedOnce = false;
    var attempt = null;      // { settle, timer } for the challenge currently running
    var inFlight = null;
    var refreshTimer = null;
    var tokenExp = 0;
    var readyResolvedOnce = false;
    var resolveReady;

    globeTokenReady = new Promise(function (res) { resolveReady = res; });

    function settleReadyOnce() {
        if (!readyResolvedOnce) { readyResolvedOnce = true; resolveReady(); }
    }

    function computeEnabled() {
        var k = (typeof turnstileSiteKey !== 'undefined') ? turnstileSiteKey : '';
        // Guard against an unrendered template placeholder ("__TURNSTILE_SITE_KEY__").
        enabled = !!k && k.indexOf('__') !== 0;
        enforce = enabled && (typeof turnstileEnforce !== 'undefined') && turnstileEnforce === true;
        lazy = enabled && (typeof turnstileGateLazy !== 'undefined') && turnstileGateLazy === true;
    }

    // The widget renders into a centered card on a dimmed overlay. The overlay
    // stays in the layout but invisible (visibility, not display:none, so the
    // widget can run) and only shows while Turnstile asks the visitor to
    // interact, between the before- and after-interactive callbacks. It has no
    // dismiss control: gated data cannot load until the check passes. If the
    // check fails while the overlay is up, the card says so and offers a reload.
    // Each card carries a short hint on why the check appears and what helps.
    //
    // On the globe the overlay covers only the map, below the in-map ad
    // (#tracking_leaderboard_container, z-index 99), so no ad slot is dimmed or
    // covered: the sidebar ads and the sticky footer are outside the map. Pages
    // without a map get a full-viewport overlay.
    const MAP_OVERLAY_Z = '98';
    const PAGE_OVERLAY_Z = '2147483002';
    let overlay = null;
    let cardTitle = null;
    let cardText = null;
    let cardContainer = null;
    let cardHint = null;
    let reloadButton = null;
    let awaitingTick = false;  // Turnstile is showing its checkbox

    function buildOverlay() {
        overlay = document.createElement('div');
        overlay.id = 'turnstile-gate-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-labelledby', 'turnstile-gate-title');
        const map = document.getElementById('map_container');
        Object.assign(overlay.style, {
            position: map ? 'absolute' : 'fixed', top: '0', right: '0', bottom: '0', left: '0',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0, 0, 0, 0.6)', zIndex: map ? MAP_OVERLAY_Z : PAGE_OVERLAY_Z,
            visibility: 'hidden', pointerEvents: 'none'
        });

        const card = document.createElement('div');
        Object.assign(card.style, {
            background: '#fff', color: '#222', borderRadius: '8px', padding: '20px 24px',
            maxWidth: 'calc(100vw - 32px)', boxSizing: 'border-box', textAlign: 'center',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)', fontFamily: 'sans-serif'
        });

        cardTitle = document.createElement('div');
        cardTitle.id = 'turnstile-gate-title';
        Object.assign(cardTitle.style, { fontSize: '18px', fontWeight: 'bold', marginBottom: '6px' });

        cardText = document.createElement('div');
        Object.assign(cardText.style, { fontSize: '14px', marginBottom: '14px' });

        cardContainer = document.createElement('div');
        cardContainer.id = 'turnstile-gate-container';
        Object.assign(cardContainer.style, { display: 'flex', justifyContent: 'center', minHeight: '65px' });

        cardHint = document.createElement('div');
        Object.assign(cardHint.style, {
            fontSize: '12px', color: '#555', maxWidth: '320px', margin: '12px auto 0', lineHeight: '1.4'
        });

        reloadButton = document.createElement('button');
        reloadButton.type = 'button';
        reloadButton.textContent = 'Reload';
        Object.assign(reloadButton.style, {
            padding: '6px 16px', fontSize: '14px', cursor: 'pointer', display: 'none'
        });
        reloadButton.addEventListener('click', () => window.location.reload());

        showCheckCard();
        card.appendChild(cardTitle);
        card.appendChild(cardText);
        card.appendChild(cardContainer);
        card.appendChild(reloadButton);
        card.appendChild(cardHint);
        overlay.appendChild(card);
        (map || document.body).appendChild(overlay);
    }

    const CHECK_HINT = 'Cloudflare asks for this when it cannot confirm your browser ' +
        'automatically, which is common with VPNs, privacy extensions and automated browsers.';
    const FAILED_HINT = 'If this keeps happening, try turning off your VPN or switching servers, ' +
        'allowing challenges.cloudflare.com in your ad or script blocker, allowing cookies for ' +
        'this site, or updating your browser.';

    function showCheckCard() {
        cardTitle.textContent = 'Quick check before we load flight data';
        cardText.textContent = 'Tick the box to confirm you are human.';
        cardHint.textContent = CHECK_HINT;
        cardContainer.style.display = 'flex';
        reloadButton.style.display = 'none';
    }

    function showFailedCard() {
        cardTitle.textContent = 'Flight data could not be verified';
        cardText.textContent = 'Reload the page to try again.';
        cardHint.textContent = FAILED_HINT;
        cardContainer.style.display = 'none';
        reloadButton.style.display = 'inline-block';
    }

    function overlayVisible() {
        return !!overlay && overlay.style.visibility === 'visible';
    }

    function showOverlay() {
        if (!overlay) return;
        overlay.style.visibility = 'visible';
        overlay.style.pointerEvents = 'auto';
    }

    function onBeforeInteractive() {
        awaitingTick = true;
        if (overlay) showCheckCard();
        showOverlay();
    }

    function onAfterInteractive() {
        awaitingTick = false;
        hideOverlay();
    }

    // A check that fails while the visitor can see the card replaces the
    // checkbox with the failure message; a failure during a silent check stays
    // silent and the next attempt runs after RETRY_DELAY_MS.
    function failAttempt(err) {
        awaitingTick = false;
        if (overlayVisible()) showFailedCard();
        settleAttempt(err);
    }

    function hideOverlay() {
        if (!overlay) return;
        overlay.style.visibility = 'hidden';
        overlay.style.pointerEvents = 'none';
    }

    // Settles the challenge currently in flight, exactly once.
    function settleAttempt(err, token) {
        if (token) {
            awaitingTick = false;
            hideOverlay();
        }
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
            // challenge genuinely needs interaction.
            if (!overlay) buildOverlay();
            window.globeOnTurnstileLoad = function () {
                try {
                    widgetId = window.turnstile.render('#turnstile-gate-container', {
                        sitekey: turnstileSiteKey,
                        execution: 'execute',
                        appearance: 'interaction-only',
                        callback: function (token) { settleAttempt(null, token); },
                        'before-interactive-callback': onBeforeInteractive,
                        'after-interactive-callback': onAfterInteractive,
                        'error-callback': function () { failAttempt(new Error('turnstile error')); return true; },
                        'timeout-callback': function () { failAttempt(new Error('turnstile timeout')); }
                    });
                    resolve(widgetId);
                } catch (e) {
                    reject(e);
                }
            };
            var s = document.createElement('script');
            s.src = TURNSTILE_API + '&onload=globeOnTurnstileLoad';
            s.async = true;
            s.defer = true;
            s.onerror = function () { reject(new Error('turnstile api load failed')); };
            document.head.appendChild(s);
        });
        return apiLoading;
    }

    // Gives a silent challenge 30 s to settle. While the checkbox is on screen
    // the attempt stays open, so a slow tick still mints; Turnstile's own
    // timeout-callback ends an abandoned checkbox.
    function armAttemptTimeout(a) {
        a.timer = setTimeout(function () {
            if (attempt !== a) return;
            if (awaitingTick) { armAttemptTimeout(a); return; }
            settleAttempt(new Error('turnstile timeout'));
        }, ATTEMPT_TIMEOUT_MS);
    }

    // Runs the (deferred) Turnstile challenge and resolves with a fresh response
    // token delivered to the render-level callback.
    function getTurnstileToken() {
        return loadTurnstileApi().then(function () {
            return new Promise(function (resolve, reject) {
                // Only one challenge at a time; abandon any prior wait.
                settleAttempt(new Error('superseded'));
                attempt = { resolve: resolve, reject: reject, timer: null };
                armAttemptTimeout(attempt);
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

    // Storage can be unavailable (private windows, blocked site data); every
    // access falls back to minting as if nothing were stored.
    function readStoredExp() {
        try {
            const v = parseInt(localStorage.getItem(EXP_STORAGE_KEY), 10);
            return v > 0 ? v : 0;
        } catch (e) {
            return 0;
        }
    }

    function writeStoredExp(expEpochSec) {
        try {
            if (expEpochSec) localStorage.setItem(EXP_STORAGE_KEY, String(expEpochSec));
            else localStorage.removeItem(EXP_STORAGE_KEY);
        } catch (e) {
            // ignore
        }
    }

    function hasLifeLeft(expEpochSec) {
        return expEpochSec * 1000 - Date.now() > REFRESH_MARGIN_MS;
    }

    // Adopts an expiry stored by an earlier page load or another tab when it
    // still has life left. Returns whether it did, i.e. whether a mint can be
    // skipped.
    function adoptStoredExp() {
        const stored = readStoredExp();
        if (!stored || !hasLifeLeft(stored)) return false;
        scheduleRefresh(stored);
        return true;
    }

    function scheduleRefresh(expEpochSec) {
        tokenExp = expEpochSec;
        if (refreshTimer) clearTimeout(refreshTimer);
        var msUntil = (expEpochSec * 1000) - Date.now() - REFRESH_MARGIN_MS;
        if (msUntil < 0) msUntil = RETRY_DELAY_MS;
        refreshTimer = setTimeout(function () {
            // Another tab may have refreshed the shared cookie in the meantime.
            if (!adoptStoredExp()) doMint();
        }, msUntil);
    }

    // The refresh timer does not fire while the device is asleep or the tab is
    // frozen, so re-check the remaining lifetime when the page comes back.
    function refreshIfDue() {
        if (!enabled) return;
        if (lazy && !tokenExp) return;
        if (tokenExp && hasLifeLeft(tokenExp)) return;
        if (adoptStoredExp()) return;
        doMint();
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
                    writeStoredExp(data.exp);
                    scheduleRefresh(data.exp);
                } else {
                    // Config/verification problem: retry later without wedging the
                    // page. A request that needs a cookie surfaces a 403, which
                    // re-triggers a mint.
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

    window.globeGateActive = function () { return enabled; };
    window.globeEnforcing = function () { return enforce; };

    window.globeEnsureToken = function (force) {
        if (!enabled) return Promise.resolve();
        if (force) {
            // The caller was refused, so the stored expiry describes a cookie
            // the server no longer accepts.
            writeStoredExp(0);
            if (!inFlight && refreshTimer) clearTimeout(refreshTimer);
        }
        return doMint();
    };

    function start() {
        computeEnabled();
        if (!enabled) { settleReadyOnce(); return; }
        document.addEventListener('visibilitychange', function () {
            if (!document.hidden) refreshIfDue();
        });
        window.addEventListener('focus', refreshIfDue);
        if (lazy) { settleReadyOnce(); return; }
        if (adoptStoredExp()) { settleReadyOnce(); return; }
        doMint();
    }

    // Safety net: nothing should wait on the gate indefinitely if start() never
    // runs or a mint never settles.
    setTimeout(settleReadyOnce, 10000);

    // Start at once rather than at DOMContentLoaded: the config-*.js globals this
    // reads are loaded immediately before this file, and the remaining scripts
    // would otherwise be parsed before the challenge even begins. document.body
    // exists here because this script sits at the end of the body; the listener
    // is the fallback for any placement where it does not.
    if (document.body) {
        start();
    } else {
        document.addEventListener('DOMContentLoaded', start);
    }
})();
