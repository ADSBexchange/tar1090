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
// the cockpit repository).
//
// Optional overrides, in config.js:
//   cockpitViewConfig = { url: 'https://cockpit.adsbexchange.com/', optIn: 'default-off',
//                         feederUrl: 'https://www.adsbexchange.com/become-a-feeder/' };

"use strict";

(function () {
    const PROTO = 'adsbx-cockpit';
    const VERSION = 1;

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

    function isMsg(d) {
        return !!d && typeof d === 'object' && d.proto === PROTO && d.v === VERSION && typeof d.kind === 'string';
    }
    function msg(kind, body) { return Object.assign({ proto: PROTO, v: VERSION, kind: kind }, body || {}); }

    // Node (tests) gets the pure parts and nothing else; inert in the browser.
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { PROTO, VERSION, DEFAULTS, snapshot, fieldFrom, flyable, isMsg, msg };
        return;
    }

    // ------------------------------------------------------------ browser only

    const cfg = Object.assign({}, DEFAULTS,
        (typeof cockpitViewConfig === 'object' && cockpitViewConfig) ? cockpitViewConfig : {});
    const cockpitUrl = new URL(cfg.url, window.location.href);
    const cockpitOrigin = cockpitUrl.origin;

    let serverFlag = null;       // null until flag.json has answered
    let toggle = null;
    let button = null;
    let open = null;             // the one open cockpit, or null

    function deployFlag() { return typeof enableCockpitView !== 'undefined' && enableCockpitView === true; }
    function optedIn() { return cfg.optIn === 'none' || !!(toggle && toggle.state); }
    function available() { return deployFlag() && serverFlag === true && optedIn(); }
    function selected() { return (typeof SelectedPlane !== 'undefined') ? SelectedPlane : null; }
    function dataNow() { return (typeof now !== 'undefined') ? now : null; }
    function planeNow() {
        return (open && typeof g !== 'undefined' && g.planes) ? g.planes[open.hex] || null : null;
    }

    function fetchFlag() {
        return fetch(new URL('flag.json', cockpitUrl).href, { cache: 'no-store', credentials: 'include' })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (j) { serverFlag = !!(j && j.enabled === true); })
            .catch(function () { serverFlag = false; })
            .then(sync);
    }

    function sync() {
        if (!button) return;
        button.style.display = (available() && flyable(selected()) && !open) ? '' : 'none';
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
            button.disabled = false;
            if (open) return;
            if (!available()) { toast('Cockpit view is unavailable right now.'); return; }
            // Signed out: the preview straight away, rather than loading the
            // cockpit only for the server to refuse it. A viewer who IS signed
            // in but not a feeder is refused by the server gate, which serves
            // the same preview in the cockpit's place.
            const preview = cfg.requireLogin && !signedIn();

            const overlay = document.createElement('div');
            overlay.id = 'cockpit_overlay';
            const iframe = document.createElement('iframe');
            iframe.title = 'Cockpit view';
            // Defence in depth when the cockpit is on its own origin; on the
            // same origin allow-same-origin makes this advisory only.
            iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');
            // The Cesium ion allowed-URL restriction reads the Referer header,
            // so the cockpit's origin has to be sent.
            iframe.referrerPolicy = 'strict-origin-when-cross-origin';

            open = { hex: preview ? null : hex, overlay: overlay, iframe: iframe, timer: null,
                     lastSig: '', lastSent: 0, lastField: 0, lostSent: false,
                     followWas: (!preview && typeof FollowSelected !== 'undefined') ? FollowSelected : null };
            // Listen BEFORE the frame loads, so its first message is heard.
            window.addEventListener('message', onMessage);
            // Give the cockpit the keyboard as soon as it loads, so C and
            // Escape work without a click into it first.
            iframe.addEventListener('load', function () { try { iframe.focus(); } catch (err) { /* ignore */ } });
            iframe.src = preview ? new URL('preview.html', cockpitUrl).href : cockpitUrl.href;
            overlay.appendChild(iframe);
            document.body.appendChild(overlay);
            if (!preview && cfg.follow && typeof toggleFollow === 'function') toggleFollow(true);
            sync();
        });
    }

    function onMessage(e) {
        if (!open || e.origin !== cockpitOrigin || e.source !== open.iframe.contentWindow) return;
        const d = e.data;
        if (!isMsg(d)) return;
        if (d.kind === 'ready') { if (open.hex) sendInit(); }
        else if (d.kind === 'preview') {
            // Not entitled: whether the shim chose the preview or the server
            // did, stop feeding - there is no aircraft to fly - and say whether
            // to offer sign-in.
            clearInterval(open.timer);
            open.timer = null;
            post('context', { signedIn: signedIn() });
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

    function close() {
        if (!open) return;
        const o = open;
        open = null;
        clearInterval(o.timer);
        window.removeEventListener('message', onMessage);
        // Unloading the frame releases its WebGL context and terrain cache.
        o.iframe.src = 'about:blank';
        if (o.overlay.parentNode) o.overlay.parentNode.removeChild(o.overlay);
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
        if ((!sp || sp.icao !== o.hex) && typeof selectPlaneByHex === 'function'
            && typeof g !== 'undefined' && g.planes && g.planes[o.hex]) {
            selectPlaneByHex(o.hex, { noDeselect: true, follow: false });
        }
        if (cfg.follow && o.followWas !== null && typeof toggleFollow === 'function') toggleFollow(o.followWas);
        sync();
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
        setInterval(sync, 500);                    // follows selection changes; cheap
        fetchFlag();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
