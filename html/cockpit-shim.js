// cockpit-shim.js - opens the cockpit view in an iframe and feeds it the
// selected aircraft.
//
// SPDX-License-Identifier: GPL-2.0-or-later
// Part of the ADS-B Exchange tar1090 fork and licensed with it. The cockpit it
// opens is a separate program served from its own URL; this file and its
// stylesheet are the whole of what tar1090 carries for it.
//
// What it does, and all it does:
//   * adds a "Cockpit view" button to the selected-aircraft panel
//   * adds a "Cockpit view (beta)" switch to Settings, unless optIn is 'none'
//   * on click, overlays an iframe and sends it the selected aircraft over
//     window.postMessage (protocol "adsbx-cockpit", version 1), plus nearby
//     altitude pairs for the cockpit's altitude correction
//   * for a viewer who is not entitled, shows the feeder preview instead - a
//     recorded simulated flight and "You need to be an ADS-B Exchange feeder
//     to use this feature" - with Become a feeder / Sign in / Close
//   * closes the overlay when the cockpit says "exit", or on Escape
//   * stays away from replay, historical-trace and heatmap views: the cockpit
//     flies live fixes only, so the button is disabled there and an open
//     cockpit closes if the page switches into one of them
//
// It never reads the cockpit's code or configuration, and the cockpit never
// reads tar1090's internals: the messages below are the entire interface.
//
// Three switches, all of which must be on, each failing CLOSED:
//   enableCockpitView           deploy-time flag in config-feature-flags.js
//   <cockpit url>flag.json      server-side kill switch; no redeploy needed
//   Settings > Cockpit view     the viewer's own opt-in, when optIn != 'none'
//
// Sign-in is checked here for the user experience only. isLoggedIn() reads a
// cookie the page can see, so it is trivially forged; the real check is the
// server's, in front of the cockpit's files (see deploy/nginx-cockpit.conf in
// the cockpit repository). What that check needs from this page is a proof of
// the account: before the cockpit opens, the shim exchanges the browser's
// account-service session for a short-lived token (flag.json's entitlementUrl)
// and parks it as a cookie on this origin, scoped to the cockpit's path, where
// the server forwards it to the account service on every gated request.
//
// Optional overrides, in config.js:
//   cockpitViewConfig = { url: 'https://cockpit.adsbexchange.com/', optIn: 'default-off',
//                         feederUrl: 'https://www.adsbexchange.com/become-a-feeder/' };

"use strict";

(function () {
    const PROTO = 'adsbx-cockpit';
    const VERSION = 1;

    const MAP_ID = 'map_container';
    const OVERLAY_ID = 'cockpit_overlay';
    const PANEL_ID = 'selected_infoblock';
    const RAIL_ID = 'header_side';
    const OPEN_CLASS = 'is-open';
    const MAP_OPEN_CLASS = 'cockpit-open';
    const EXIT_CLASS = 'cockpit-exit';
    const EXIT_LABEL = 'Exit cockpit';
    const INNER_CLASS = 'cockpit-inner';
    const TRANSITION = 'map-dive';
    const EDGE_PX = 2;
    const EXIT_GAP_PX = 10;
    const EXIT_MS = 260;
    const REDUCED_EXIT_MS = 150;
    const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
    const EXIT_STEP_PX = 8;
    const MAP_ORIGIN_X_VAR = '--cockpit-map-origin-x';
    const MAP_ORIGIN_Y_VAR = '--cockpit-map-origin-y';
    const KEEP_OPEN = ['#cockpit_view', '.cockpit-toast', '#toggle_sidebar_control', '#splitter'];
    const SELECTOR_SEPARATOR = ', ';
    const VIEW_UNAVAILABLE_TITLE = 'Not available in this view';
    const AIRCRAFT_UNAVAILABLE_TITLE = 'Not available for this aircraft';

    const DEFAULTS = {
        url: '/cockpit/',        // where the cockpit is served; may be another origin
        optIn: 'default-on',     // 'none' | 'default-on' | 'default-off'
        requireLogin: true,      // UX only - see above
        // Where "Become a feeder" goes. Set HERE, on the parent: the preview can
        // only ask for it to be opened, never supply a URL of its own.
        feederUrl: 'https://www.adsbexchange.com/become-a-feeder/',
        follow: true,            // keep the map on the aircraft while the cockpit is open
        stateMs: 250,            // how often to look for a new fix
        heartbeatMs: 2000,       // resend an unchanged fix this often
        fieldMs: 5000,           // neighbourhood altitude pairs
        fieldDeg: 4.5,           // half-width of that neighbourhood, degrees
    };

    function num(v) { return (typeof v === 'number' && isFinite(v)) ? v : null; }
    function str(v) { return (typeof v === 'string' && v.trim()) ? v.trim() : null; }

    // One PlaneObject as the cockpit wants it. An absent field stays absent -
    // null, never 0 - and the ground state stays the string "ground".
    function snapshot(p, dataNow) {
        if (!p) return null;
        const pos = Array.isArray(p.position) ? p.position : null;
        const altBaro = (p.altitude === 'ground' || p.alt_baro === 'ground') ? 'ground' : num(p.alt_baro);
        const pt = num(p.position_time), dn = num(dataNow);
        return {
            hex: str(p.icao),
            flight: str(p.flight),
            registration: str(p.registration),
            icaoType: str(p.icaoType),
            typeDescription: str(p.typeDescription),
            wtc: str(p.wtc),
            category: str(p.category),
            lat: pos ? num(pos[1]) : null,
            lon: pos ? num(pos[0]) : null,
            alt_baro: altBaro,
            alt_geom: num(p.alt_geom),
            gs: num(p.gs),
            track: num(p.track),
            true_heading: num(p.true_heading),
            roll: num(p.roll),
            baro_rate: num(p.baro_rate),
            geom_rate: num(p.geom_rate),
            // Age of the position on tar1090's OWN data clock (`now` and
            // `position_time` both come from the server), so the cockpit never
            // depends on this machine's clock agreeing with the server's.
            pos_age: (pt !== null && dn !== null && dn >= pt) ? dn - pt : num(p.seen_pos),
        };
    }

    // Nearby aircraft reporting BOTH altitudes. Four numbers each, so the
    // message stays small even over a busy sky.
    function fieldFrom(planes, lat, lon, halfDeg) {
        const out = [];
        if (!Array.isArray(planes) || num(lat) === null || num(lon) === null) return out;
        for (let i = 0; i < planes.length && out.length < 5000; i++) {
            const q = planes[i];
            if (!q || !Array.isArray(q.position) || q.altitude === 'ground') continue;
            const b = num(q.alt_baro), g2 = num(q.alt_geom);
            if (b === null || g2 === null) continue;
            if (num(q.seen_pos) !== null && q.seen_pos > 60) continue;
            const qa = num(q.position[1]), qo = num(q.position[0]);
            if (qa === null || qo === null) continue;
            let dlon = Math.abs(qo - lon);
            if (dlon > 180) dlon = 360 - dlon;
            if (Math.abs(qa - lat) > halfDeg || dlon > halfDeg) continue;
            out.push([qa, qo, b, g2]);
        }
        return out;
    }

    // Whether a cockpit makes sense for this object at all.
    function flyable(p) {
        if (!p || !Array.isArray(p.position)) return false;
        if (typeof p.category === 'string' && p.category.charAt(0) === 'C') return false; // vehicles, obstacles
        if (p.icaoType === 'TWR' || p.icaoType === 'GND') return false;
        return true;
    }

    // tar1090 views that show something other than live aircraft: a replay
    // (?replay=), a historical trace (?showTrace= or the trace toggle) or the
    // heatmap. `modes` carries tar1090's own globals, truthy when that view is
    // on; absent globals count as off.
    function liveMode(modes) {
        return !modes || !(modes.replay || modes.showTrace || modes.heatmap || modes.tableOnly);
    }

    function isMsg(d) {
        return !!d && typeof d === 'object' && d.proto === PROTO && d.v === VERSION && typeof d.kind === 'string';
    }
    function msg(kind, body) { return Object.assign({ proto: PROTO, v: VERSION, kind: kind }, body || {}); }
    function contextFor(signedIn) { return { signedIn: signedIn, embedded: true }; }

    function shown(r) { return !!r && r.width > 0 && r.height > 0; }

    function frameInsets(map, panel, rail) {
        const insets = { left: 0, right: 0 };
        if (!shown(map)) return insets;
        if (shown(panel) && panel.top <= map.top + EDGE_PX && panel.bottom >= map.bottom - EDGE_PX
            && panel.left <= map.left + EDGE_PX && panel.right > map.left) {
            insets.left = Math.round(Math.min(panel.right - map.left, map.width));
        }
        if (shown(rail) && rail.left < map.right && rail.right >= map.right - EDGE_PX) {
            insets.right = Math.round(Math.min(map.right - rail.left, map.width - insets.left));
        }
        return insets;
    }

    function closesOn(target, overlay, ads) {
        if (!target || typeof target.closest !== 'function') return false;
        if (overlay && typeof overlay.contains === 'function' && overlay.contains(target)) return false;
        return !target.closest(KEEP_OPEN.concat(ads || []).join(SELECTOR_SEPARATOR));
    }

    function switchedAway(openedHex, selectedHex) {
        return !!openedHex && !!selectedHex && openedHex !== selectedHex;
    }

    function revealOrigin(pixel, insets, width, height) {
        const centre = { x: Math.round(width / 2), y: Math.round(height / 2) };
        if (!Array.isArray(pixel) || num(pixel[0]) === null || num(pixel[1]) === null) return centre;
        const left = pixel[0] - insets.left, top = pixel[1];
        if (left < 0 || left > width || top < 0 || top > height) return centre;
        return { x: Math.round(left), y: Math.round(top) };
    }

    function intersects(a, b) {
        return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    }

    function exitSpot(area, size, obstacles) {
        const blocking = (obstacles || []).filter(shown);
        const sides = ['right', 'left'];
        for (let s = 0; s < sides.length; s++) {
            const left = sides[s] === 'right' ? area.width - EXIT_GAP_PX - size.width : EXIT_GAP_PX;
            for (let top = EXIT_GAP_PX; top + size.height + EXIT_GAP_PX <= area.height; top += EXIT_STEP_PX) {
                const box = { left: area.left + left, top: area.top + top,
                              right: area.left + left + size.width, bottom: area.top + top + size.height };
                if (!blocking.some(function (obstacle) { return intersects(box, obstacle); })) return { side: sides[s], top: top };
            }
        }
        return { side: 'right', top: EXIT_GAP_PX };
    }

    function exitMs(reducedMotion) { return reducedMotion ? REDUCED_EXIT_MS : EXIT_MS; }

    function ownsEntry(state, token) {
        return !!state && typeof state === 'object' && state.cockpit === token;
    }

    function onOwnEntry(entry, state, historyLength) {
        if (!entry || !entry.token) return false;
        return ownsEntry(state, entry.token) || historyLength === entry.historyLength;
    }

    // Node (tests) gets the pure parts and nothing else; inert in the browser.
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { PROTO, VERSION, DEFAULTS, snapshot, fieldFrom, flyable, liveMode, isMsg, msg,
                           frameInsets, closesOn, switchedAway, revealOrigin, exitSpot, exitMs, ownsEntry, onOwnEntry,
                           TRANSITION, contextFor };
        return;
    }

    // ------------------------------------------------------------ browser only

    const cfg = Object.assign({}, DEFAULTS,
        (typeof cockpitViewConfig === 'object' && cockpitViewConfig) ? cockpitViewConfig : {});
    const cockpitUrl = new URL(cfg.url, window.location.href);
    const cockpitOrigin = cockpitUrl.origin;

    const TOKEN_COOKIE = 'adsbx_entitlement';

    let flag = null;             // flag.json as last read; null until it has answered
    let serverFlag = null;       // null until flag.json has answered
    let toggle = null;
    let button = null;
    let open = null;             // the one open cockpit, or null
    let historySeq = 0;
    let ignoredPops = 0;

    function deployFlag() { return typeof enableCockpitView !== 'undefined' && enableCockpitView === true; }
    function optedIn() { return cfg.optIn === 'none' || !!(toggle && toggle.state); }
    function live() {
        return liveMode({
            replay: typeof replay !== 'undefined' && replay,
            showTrace: typeof showTrace !== 'undefined' && showTrace,
            heatmap: typeof heatmap !== 'undefined' && heatmap,
            tableOnly: typeof mapIsVisible !== 'undefined' && mapIsVisible === false,
        });
    }
    function available() { return deployFlag() && serverFlag === true && optedIn() && live(); }
    function selected() { return (typeof SelectedPlane !== 'undefined') ? SelectedPlane : null; }
    function dataNow() { return (typeof now !== 'undefined') ? now : null; }
    function planeOf(hex) {
        return (hex && typeof g !== 'undefined' && g.planes) ? g.planes[hex] || null : null;
    }
    function planeNow() { return open ? planeOf(open.hex) : null; }

    function fetchFlag() {
        return fetch(new URL('flag.json', cockpitUrl).href, { cache: 'no-store', credentials: 'include' })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (j) { flag = (j && typeof j === 'object') ? j : null; })
            .catch(function () { flag = null; })
            .then(function () { serverFlag = !!(flag && flag.enabled === true); sync(); });
    }

    // The account service's own session cookie is HttpOnly and scoped to its
    // host, so nothing on this origin can present it to the server gate.
    // Instead the signed-in browser exchanges it there for a token naming the
    // account, good for minutes, and that token travels to the gate as a
    // cookie of this origin. Same-origin cockpit only: a page cannot set a
    // cookie for another host.
    //
    // Resolves to 'ok' (cookie set, or no exchange configured - the server
    // gate then decides alone), 'signed-out' (the account service has no
    // session for this browser) or 'failed' (anything else).
    function fetchToken() {
        const url = (flag && typeof flag.entitlementUrl === 'string') ? flag.entitlementUrl : '';
        if (!url) return Promise.resolve('ok');
        return fetch(new URL(url, cockpitUrl).href, { credentials: 'include', cache: 'no-store' })
            .then(function (r) {
                if (r.status === 401) return 'signed-out';
                if (!r.ok) return 'failed';
                return r.json().then(function (j) {
                    const a = (j && j.data && j.data.attributes) || {};
                    if (typeof a.token !== 'string' || !a.token) return 'failed';
                    setTokenCookie(a.token, a.expires_in);
                    return 'ok';
                });
            })
            .catch(function () { return 'failed'; });
    }

    // Max-Age 0 removes it. The token is base64url, so it needs no encoding
    // and reaches the account service byte for byte.
    function setTokenCookie(token, expiresIn) {
        const ttl = (typeof expiresIn === 'number' && expiresIn > 0) ? Math.floor(expiresIn) : 0;
        document.cookie = TOKEN_COOKIE + '=' + token + '; Path=' + cockpitUrl.pathname
            + '; Max-Age=' + ttl + '; SameSite=Strict'
            + (window.location.protocol === 'https:' ? '; Secure' : '');
    }

    function sync() {
        if (!button) return;
        if (open && !live()) { close(); return; }   // the view left live data under it
        const sp = selected();
        if (open && switchedAway(open.origin, sp && sp.icao)) { close({ switched: true }); return; }
        if (open) { layout(open); markEntry(open); }
        const unavailable = !live() ? VIEW_UNAVAILABLE_TITLE : (!flyable(sp) ? AIRCRAFT_UNAVAILABLE_TITLE : '');
        button.style.display = (deployFlag() && serverFlag === true && optedIn()) ? '' : 'none';
        button.disabled = !!open || !!unavailable;
        button.title = open ? '' : unavailable;
    }

    function reducedMotion() {
        return typeof window.matchMedia === 'function' && window.matchMedia(REDUCED_MOTION_QUERY).matches;
    }

    function rectOf(id) {
        const node = document.getElementById(id);
        return node ? node.getBoundingClientRect() : null;
    }

    function layout(cockpit) {
        if (!cockpit.map) return;
        const map = cockpit.map.getBoundingClientRect();
        const insets = frameInsets(map, rectOf(PANEL_ID), rectOf(RAIL_ID));
        const style = cockpit.overlay.style;
        style.left = insets.left + 'px';
        style.right = insets.right + 'px';
        cockpit.insets = insets;
        placeExit(cockpit, adSlotRects());
        setOrigin(cockpit);
    }

    function adContainers() {
        return (typeof AdContainers !== 'undefined' && Array.isArray(AdContainers)) ? AdContainers : [];
    }

    function adSlotRects() {
        const ads = adContainers();
        if (ads.length === 0) return [];
        return Array.prototype.map.call(document.querySelectorAll(ads.join(SELECTOR_SEPARATOR)), function (node) {
            return node.getBoundingClientRect();
        });
    }

    function watchLayout(cockpit) {
        if (!cockpit.map || typeof ResizeObserver !== 'function') return;
        cockpit.observer = new ResizeObserver(function () { if (open === cockpit) layout(cockpit); });
        [cockpit.map, cockpit.overlay, document.getElementById(PANEL_ID), document.getElementById(RAIL_ID)].forEach(function (node) {
            if (node) cockpit.observer.observe(node);
        });
    }

    function exitOf(overlay) { return overlay.querySelector('.' + EXIT_CLASS); }

    function placeExit(cockpit, obstacles) {
        const exit = exitOf(cockpit.overlay);
        if (!exit) return;
        const spot = exitSpot(cockpit.overlay.getBoundingClientRect(),
                              { width: exit.offsetWidth, height: exit.offsetHeight }, obstacles);
        exit.style.top = spot.top + 'px';
        exit.style.left = spot.side === 'left' ? EXIT_GAP_PX + 'px' : 'auto';
        exit.style.right = spot.side === 'right' ? EXIT_GAP_PX + 'px' : 'auto';
    }

    function setOrigin(cockpit) {
        const width = cockpit.overlay.clientWidth, height = cockpit.overlay.clientHeight;
        const insets = cockpit.insets || { left: 0, right: 0 };
        const at = revealOrigin(aircraftPixel(cockpit), insets, width, height);
        if (cockpit.map) {
            cockpit.map.style.setProperty(MAP_ORIGIN_X_VAR, (at.x + insets.left) + 'px');
            cockpit.map.style.setProperty(MAP_ORIGIN_Y_VAR, at.y + 'px');
        }
    }

    function aircraftPixel(cockpit) {
        const plane = planeOf(cockpit.origin);
        if (!plane || !Array.isArray(plane.position) || typeof OLMap === 'undefined' || !OLMap || typeof ol === 'undefined') return null;
        try { return OLMap.getPixelFromCoordinate(ol.proj.fromLonLat(plane.position)); } catch (err) { return null; }
    }

    function pushEntry(cockpit) {
        cockpit.token = ++historySeq;
        try { history.pushState({ cockpit: cockpit.token }, '', window.location.href); } catch (err) { cockpit.token = 0; }
        cockpit.historyLength = history.length;
    }

    function dropEntry(cockpit) {
        if (!onOwnEntry(cockpit, history.state, history.length)) return;
        ignoredPops++;
        history.back();
    }

    function markEntry(cockpit) {
        if (!cockpit.token || ownsEntry(history.state, cockpit.token)) return;
        try { history.replaceState({ cockpit: cockpit.token }, '', window.location.href); } catch (err) { cockpit.token = 0; }
    }

    function cockpitFrame() {
        const iframe = document.createElement('iframe');
        iframe.title = 'Cockpit view';
        // Defence in depth when the cockpit is on its own origin; on the
        // same origin allow-same-origin makes this advisory only.
        iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');
        // The Cesium ion allowed-URL restriction reads the Referer header,
        // so the cockpit's origin has to be sent.
        iframe.referrerPolicy = 'strict-origin-when-cross-origin';
        // Give the cockpit the keyboard as soon as it loads, so C and
        // Escape work without a click into it first.
        iframe.addEventListener('load', function () { try { iframe.focus(); } catch (err) { /* ignore */ } });
        return iframe;
    }

    function buildOverlay(iframe) {
        const overlay = document.createElement('div');
        overlay.id = OVERLAY_ID;
        overlay.setAttribute('data-transition', TRANSITION);
        const inner = document.createElement('div');
        inner.className = INNER_CLASS;
        inner.appendChild(iframe);
        overlay.appendChild(inner);
        overlay.appendChild(exitButton());
        return overlay;
    }

    function focusQuietly(node) {
        try { node.focus({ preventScroll: true }); } catch (err) { node.focus(); }
    }

    function exitButton() {
        const exit = document.createElement('button');
        exit.type = 'button';
        exit.className = EXIT_CLASS;
        exit.title = EXIT_LABEL;
        exit.setAttribute('aria-label', EXIT_LABEL);
        exit.addEventListener('click', function () { close(); });
        return exit;
    }

    function onPress(e) {
        if (open && closesOn(e.target, open.overlay, adContainers())) close({ pressed: true });
    }

    function onPop() {
        if (ignoredPops > 0) { ignoredPops--; return; }
        if (open) close({ popped: true });
    }

    function toast(text) {
        const t = document.createElement('div');
        t.className = 'cockpit-toast';
        t.setAttribute('role', 'status');
        t.textContent = text;
        document.body.appendChild(t);
        setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 4500);
    }

    function signIn() {
        if (typeof openAxIdentity === 'function') openAxIdentity();
    }

    function openFeeder() {
        try { window.open(cfg.feederUrl, '_blank', 'noopener'); } catch (e) { /* popup blocked */ }
    }

    function post(kind, body) {
        if (open && open.iframe.contentWindow) {
            open.iframe.contentWindow.postMessage(msg(kind, body), cockpitOrigin);
        }
    }

    function sig(p) {
        return String(p.position_time) + '|' + (Array.isArray(p.position) ? p.position.join(',') : '');
    }

    function signedIn() { return typeof isLoggedIn === 'function' ? isLoggedIn() : false; }

    function start(hex) {
        if (open) return;
        // The kill switch is re-read on every open, so turning it off reaches
        // people who loaded the map before it was flipped.
        button.disabled = true;
        fetchFlag().then(function () {
            if (open || !available()) return 'unavailable';
            // Signed out: the preview straight away, rather than loading the
            // cockpit only for the server to refuse it.
            if (cfg.requireLogin && !signedIn()) return 'signed-out';
            return fetchToken();
        }).then(function (state) {
            sync();
            if (open) return;
            if (state !== 'ok' && state !== 'signed-out') { toast('Cockpit view is unavailable right now.'); return; }
            // 'signed-out' also covers a browser whose readable cookie says
            // signed in while the account service has no session for it
            // (ended there, or set by hand): the preview, with Sign in
            // offered. A viewer who IS signed in but not a feeder is refused
            // by the server gate, which serves the same preview in the
            // cockpit's place, and Sign in is not offered.
            const current = selected();
            if (!current || current.icao !== hex) return;
            const leaving = document.getElementById(OVERLAY_ID);
            if (leaving) finishExit(leaving);
            const preview = state === 'signed-out';
            if (preview) setTokenCookie('', 0);

            const map = document.getElementById(MAP_ID);
            const iframe = cockpitFrame();
            const overlay = buildOverlay(iframe);
            const cockpit = { hex: preview ? null : hex, origin: hex, signedIn: !preview, overlay: overlay, iframe: iframe,
                              map: map, insets: null, observer: null, token: 0, historyLength: 0, timer: null,
                              lastSig: '', lastSent: 0, lastField: 0, lostSent: false,
                              followWas: (!preview && typeof FollowSelected !== 'undefined') ? FollowSelected : null };
            open = cockpit;
            // Listen BEFORE the frame loads, so its first message is heard.
            window.addEventListener('message', onMessage);
            iframe.src = preview ? new URL('preview.html', cockpitUrl).href : cockpitUrl.href;
            (map || document.body).appendChild(overlay);
            if (map) map.classList.add(MAP_OPEN_CLASS);
            layout(cockpit);
            watchLayout(cockpit);
            beginEntry(cockpit);
            pushEntry(cockpit);
            focusQuietly(exitOf(overlay));
            if (!preview && cfg.follow && typeof toggleFollow === 'function') toggleFollow(true);
            sync();
        });
    }

    function onMessage(e) {
        if (!open || e.origin !== cockpitOrigin || e.source !== open.iframe.contentWindow) return;
        const d = e.data;
        if (!isMsg(d)) return;
        if (d.kind === 'ready') {
            post('context', contextFor(open.signedIn));
            if (open.hex) sendInit();
        }
        else if (d.kind === 'preview') {
            // Not entitled: whether the shim chose the preview or the server
            // did, stop feeding - there is no aircraft to fly - and say whether
            // to offer sign-in: only when the account service had no session.
            clearInterval(open.timer);
            open.timer = null;
            post('context', contextFor(open.signedIn));
        }
        else if (d.kind === 'sign-in') { close(); signIn(); }
        else if (d.kind === 'feeder') openFeeder();
        else if (d.kind === 'exit') close();
        else if (d.kind === 'unavailable') { serverFlag = false; close(); toast('Cockpit view is unavailable right now.'); }
        else if (d.kind === 'error') {
            close();
            toast(typeof d.message === 'string' ? d.message.slice(0, 200) : 'Cockpit view could not start.');
        }
    }

    // Answered on EVERY "ready": the cockpit retries until it has an aircraft,
    // and ignores a second init, so a lost first answer cannot strand it.
    function sendInit() {
        const p = planeNow();
        const s = snapshot(p, dataNow());
        if (!s || !s.hex) { close(); toast('This aircraft is no longer on the map.'); return; }
        post('init', { hex: s.hex, ac: s, field: fieldFrom(g.planesOrdered, s.lat, s.lon, cfg.fieldDeg) });
        open.lastSig = sig(p);
        open.lastSent = open.lastField = Date.now();
        if (!open.timer) open.timer = setInterval(feed, cfg.stateMs);
    }

    function feed() {
        if (!open) return;
        const p = planeNow();
        if (!p) {
            if (!open.lostSent) { post('lost', { hex: open.hex }); open.lostSent = true; }
            return;
        }
        open.lostSent = false;
        const t = Date.now(), s = sig(p);
        if (s !== open.lastSig || t - open.lastSent >= cfg.heartbeatMs) {
            post('state', { ac: snapshot(p, dataNow()) });
            open.lastSig = s;
            open.lastSent = t;
        }
        if (t - open.lastField >= cfg.fieldMs) {
            const pos = Array.isArray(p.position) ? p.position : [];
            post('field', { field: fieldFrom(g.planesOrdered, pos[1], pos[0], cfg.fieldDeg) });
            open.lastField = t;
        }
    }

    function close(how) {
        if (!open) return;
        how = how || {};
        const cockpit = open;
        open = null;
        clearInterval(cockpit.timer);
        window.removeEventListener('message', onMessage);
        if (cockpit.observer) cockpit.observer.disconnect();
        const focusWasInside = !document.activeElement || document.activeElement === document.body
            || cockpit.overlay.contains(document.activeElement);
        beginExit(cockpit);
        if (!how.popped) dropEntry(cockpit);
        if (!how.switched) restoreSelection(cockpit);
        if (cfg.follow && cockpit.followWas !== null && typeof toggleFollow === 'function') toggleFollow(cockpit.followWas);
        sync();
        if (focusWasInside && !how.switched && !how.pressed && button && button.style.display !== 'none' && !button.disabled) {
            focusQuietly(button);
        }
    }

    function beginEntry(cockpit) {
        cockpit.overlay.getBoundingClientRect();
        cockpit.overlay.classList.add(OPEN_CLASS);
    }

    function beginExit(cockpit) {
        cockpit.overlay.classList.remove(OPEN_CLASS);
        if (cockpit.map) cockpit.map.classList.remove(MAP_OPEN_CLASS);
        setTimeout(function () { finishExit(cockpit.overlay); }, exitMs(reducedMotion()));
    }

    function finishExit(overlay) {
        const parent = overlay.parentNode;
        if (!parent) return;
        const iframe = overlay.querySelector('iframe');
        // Unloading the frame releases its WebGL context and terrain cache.
        if (iframe) iframe.src = 'about:blank';
        parent.removeChild(overlay);
    }

    function restoreSelection(cockpit) {
        // Leave the viewer on the map with THIS aircraft selected.
        //
        // Normally it still is, and must not be reselected: selectPlaneByHex on
        // the already-selected plane DESELECTS it. But tar1090 deselects on
        // Escape and on C in its own key handler - registered on window in the
        // capture phase, before this shim loads, so it always runs first and
        // nothing here can pre-empt it. If the map had focus at any point
        // during the session, the selection may already be gone. So: only if
        // it is not this aircraft, put it back.
        const sp = selected();
        if ((!sp || sp.icao !== cockpit.origin) && typeof selectPlaneByHex === 'function' && planeOf(cockpit.origin)) {
            selectPlaneByHex(cockpit.origin, { noDeselect: true, follow: false });
        }
    }

    // Escape on the MAP closes the cockpit too. (Inside the cockpit, which has
    // focus from the moment it loads, Escape is the cockpit's own.) This cannot
    // stop tar1090 seeing the key - its handler is on window in the capture
    // phase and registered first - which is why close() restores the
    // selection rather than trying to protect it.
    function onKey(e) {
        if (open && e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            close();
        }
    }

    function init() {
        if (!deployFlag()) return;                 // flag off at deploy: add nothing at all
        const anchor = document.getElementById('show_trace');
        if (!anchor || !anchor.parentNode) return;
        button = document.createElement('button');
        button.id = 'cockpit_view';
        button.type = 'button';
        button.className = 'greyButton';
        button.textContent = 'Cockpit view';
        button.style.display = 'none';
        anchor.parentNode.insertBefore(button, anchor);
        button.addEventListener('click', function () {
            const sp = selected();
            if (sp && sp.icao) start(sp.icao);
        });
        if (cfg.optIn !== 'none' && typeof Toggle === 'function') {
            toggle = new Toggle({
                key: 'cockpitView',
                display: 'Cockpit view (beta)',
                container: '#settingsRight',
                init: cfg.optIn === 'default-on',
                setState: function () { setTimeout(sync, 0); },
            });
        }
        window.addEventListener('keydown', onKey, true);
        document.addEventListener('pointerdown', onPress, true);
        window.addEventListener('popstate', onPop);
        window.addEventListener('resize', function () { if (open) layout(open); });
        setInterval(sync, 500);                    // follows selection changes; cheap
        fetchFlag();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
