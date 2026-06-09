"use strict";

// Unit tests for the ActivityHistory high-water-mark logic (AX-913).
// Pure logic only — no fetch/DOM — so it runs under Node's built-in runner:
//   node --test test/
// `test/` is never deployed (install.sh copies only html/), so these stay out of prod.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const ah = require('../html/activityHistory.js');

// The module is a singleton object; reset its two maps before each scenario.
function reset(historical, recent) {
    ah.historicalDatesByIcao = {};
    ah.recentDatesByIcao = {};
    if (historical) ah.historicalDatesByIcao['abc123'] = historical;
    if (recent) ah.recentDatesByIcao['abc123'] = recent;
}

// Build a trace whose points sit at the given UTC date-times (ISO strings), encoded the way the
// globe serves it: traceData.timestamp = the run's base epoch (seconds), each point[0] = seconds
// offset from that base.
function traceFrom(baseIso, offsetSeconds) {
    const base = Math.floor(Date.parse(baseIso) / 1000);
    return { timestamp: base, trace: offsetSeconds.map((o) => [o, 51.0, -0.1]) };
}

// ---------------------------------------------------------------------------
// datesFromTrace — extracting the "high-water" date(s) from a live trace
// ---------------------------------------------------------------------------

test('datesFromTrace: raw trace (relative offsets) -> the single UTC day', () => {
    const data = traceFrom('2026-06-04T12:00:00Z', [0, 60, 3600]);
    assert.deepEqual(ah.datesFromTrace(data), ['2026-06-04']);
});

test('datesFromTrace: dedupes thousands of same-day points to one date', () => {
    const offsets = Array.from({ length: 5000 }, (_, i) => i); // 0..4999s, all same UTC day
    const data = traceFrom('2026-06-04T00:00:00Z', offsets);
    assert.deepEqual(ah.datesFromTrace(data), ['2026-06-04']);
});

test('datesFromTrace: crossing 00:00 UTC yields both days (in encounter order)', () => {
    // base just after midnight; one point -120s lands in the previous day.
    const data = traceFrom('2026-06-04T00:01:00Z', [-120, 0, 120]);
    assert.deepEqual(ah.datesFromTrace(data), ['2026-06-03', '2026-06-04']);
});

test('datesFromTrace: already-normalized data (timestamp 0, absolute point[0])', () => {
    const abs = Math.floor(Date.parse('2026-06-04T09:00:00Z') / 1000);
    const data = { timestamp: 0, trace: [[abs, 51, -0.1], [abs + 30, 51, -0.1]] };
    assert.deepEqual(ah.datesFromTrace(data), ['2026-06-04']);
});

test('datesFromTrace: skips NaN / malformed offsets', () => {
    const base = Math.floor(Date.parse('2026-06-04T12:00:00Z') / 1000);
    const data = { timestamp: base, trace: [[NaN, 0, 0], null, [undefined, 0, 0], [0, 51, -0.1]] };
    assert.deepEqual(ah.datesFromTrace(data), ['2026-06-04']);
});

test('datesFromTrace: empty / missing trace -> []', () => {
    assert.deepEqual(ah.datesFromTrace({ timestamp: 1, trace: [] }), []);
    assert.deepEqual(ah.datesFromTrace({ timestamp: 1 }), []);
    assert.deepEqual(ah.datesFromTrace(null), []);
});

// ---------------------------------------------------------------------------
// mergeTraceDates — folding the trace edge into recentDatesByIcao
// ---------------------------------------------------------------------------

test('mergeTraceDates: stores deduped + descending', () => {
    reset();
    ah.mergeTraceDates('abc123', ['2026-06-03', '2026-06-04', '2026-06-03']);
    assert.deepEqual(ah.recentDatesByIcao['abc123'], ['2026-06-04', '2026-06-03']);
});

test('mergeTraceDates: idempotent (re-merging same trace is a no-op)', () => {
    reset();
    ah.mergeTraceDates('abc123', ['2026-06-04']);
    ah.mergeTraceDates('abc123', ['2026-06-04']);
    assert.deepEqual(ah.recentDatesByIcao['abc123'], ['2026-06-04']);
});

test('mergeTraceDates: empty dates -> no entry created', () => {
    reset();
    ah.mergeTraceDates('abc123', []);
    assert.equal(ah.recentDatesByIcao['abc123'], undefined);
});

// ---------------------------------------------------------------------------
// The high-water mark itself: the recent edge overlaying the historical list
// ---------------------------------------------------------------------------

test('hasActivity: true from historical, from recent, or both; false when neither', () => {
    reset(['2026-06-02']);          assert.equal(ah.hasActivity('abc123'), true);
    reset(null, ['2026-06-05']);    assert.equal(ah.hasActivity('abc123'), true);
    reset(['2026-06-02'], ['2026-06-05']); assert.equal(ah.hasActivity('abc123'), true);
    reset();                        assert.equal(ah.hasActivity('abc123'), false);
});

test('fetchedEmpty: only when historical fetched-empty AND not flying today', () => {
    reset([]);                      assert.equal(ah.fetchedEmpty('abc123'), true);  // [] cached, no recent
    reset([], ['2026-06-05']);      assert.equal(ah.fetchedEmpty('abc123'), false); // flying today
    reset(['2026-06-02']);          assert.equal(ah.fetchedEmpty('abc123'), false); // has history
    reset();                        assert.equal(ah.fetchedEmpty('abc123'), false); // never fetched (undefined)
});

test('getActiveDatesSet: union of historical + recent edge', () => {
    reset(['2026-06-02', '2026-05-29'], ['2026-06-05']);
    assert.deepEqual(ah.getActiveDatesSet('abc123'), {
        '2026-06-02': true, '2026-05-29': true, '2026-06-05': true,
    });
});

test('mostRecentActiveDate: newest day across both lists (where history opens)', () => {
    reset(['2026-06-02', '2026-05-29'], ['2026-06-05']);
    assert.equal(ah.mostRecentActiveDate('abc123'), '2026-06-05');   // recent edge is newest
    reset(['2026-06-08', '2026-05-29'], ['2026-06-05']);
    assert.equal(ah.mostRecentActiveDate('abc123'), '2026-06-08');   // historical head is newer than the edge
    reset(['2026-06-02', '2026-05-29']);
    assert.equal(ah.mostRecentActiveDate('abc123'), '2026-06-02');   // historical only
    reset(null, ['2026-06-05']);
    assert.equal(ah.mostRecentActiveDate('abc123'), '2026-06-05');   // recent only
    reset();
    assert.equal(ah.mostRecentActiveDate('abc123'), null);           // no activity -> caller falls back to today
});

test('getNextDate: the recent edge is reachable as the next date past the newest historical day', () => {
    reset(['2026-06-02', '2026-05-29'], ['2026-06-05']); // today = high-water beyond history
    assert.equal(ah.getNextDate('abc123', '2026-06-02'), '2026-06-05');
    assert.equal(ah.getNextDate('abc123', '2026-05-29'), '2026-06-02');
    assert.equal(ah.getNextDate('abc123', '2026-06-05'), null); // already at newest
});

test('getPrevDate: steps back from the recent edge into historical', () => {
    reset(['2026-06-02', '2026-05-29'], ['2026-06-05']);
    assert.equal(ah.getPrevDate('abc123', '2026-06-05'), '2026-06-02');
    assert.equal(ah.getPrevDate('abc123', '2026-06-02'), '2026-05-29');
});

test('getNextDate: jumps straight to the next active day from anywhere (no free-step)', () => {
    reset(['2026-06-02'], null);
    assert.equal(ah.getNextDate('abc123', '2020-01-01'), '2026-06-02'); // way before -> the active day itself
    assert.equal(ah.getNextDate('abc123', '2026-06-02'), null);          // at newest -> null
});

test('getPrevDate: null at the oldest active day (no free-step into the pre-dataset era)', () => {
    reset(['2026-06-02'], null);
    assert.equal(ah.getPrevDate('abc123', '2026-06-02'), null); // nothing older -> stay put
});

test('recent-only aircraft (flew today, no history): single active day, null at both ends', () => {
    reset(null, ['2026-06-05']);
    assert.equal(ah.getPrevDate('abc123', '2026-06-05'), null);          // nothing older
    assert.equal(ah.getNextDate('abc123', '2026-06-04'), '2026-06-05');  // up to the edge
    assert.equal(ah.getNextDate('abc123', '2026-06-05'), null);          // at the edge -> null
});

// ---------------------------------------------------------------------------
// "What gets shown" — the only behavioural decision is selectable vs blocked.
// isNoActivityDay(icao, dateStr) === true  -> cell is disabled ("No activity").
//                                === false -> cell is selectable (green is orthogonal: in the active
//                                             set or not, asserted via getActiveDatesSet).
// Today is NOT special-cased: once we have data (hasActivity), every non-active day is blocked —
// no pre-dataset floor to roam below. Asserted across the 4 data-presence quadrants (historical x recent).
// ---------------------------------------------------------------------------

const TODAY = '2026-06-05';
const blocked = (dateStr) => ah.isNoActivityDay('abc123', dateStr);
const green = (dateStr) => !!ah.getActiveDatesSet('abc123')[dateStr];

test('NEITHER: nothing blocked, nothing green (legacy roam)', () => {
    reset();
    assert.equal(blocked(TODAY), false);
    assert.equal(blocked('2026-06-01'), false);
    assert.equal(blocked('2010-01-01'), false);
    assert.equal(green('2026-06-01'), false);
});

test('HISTORICAL only (not flying today)', () => {
    reset(['2026-06-02', '2026-05-29']);
    assert.equal(blocked('2026-06-02'), false); assert.equal(green('2026-06-02'), true);  // flown -> selectable + green
    assert.equal(blocked('2026-06-01'), true);                                            // idle gap -> blocked
    assert.equal(blocked('2026-05-01'), true);                                            // before oldest -> blocked (no roam)
    assert.equal(blocked(TODAY), true); assert.equal(green(TODAY), false);                // today idle -> blocked, not green
});

test('RECENT only (flew today, no history)', () => {
    reset(null, ['2026-06-05']);
    assert.equal(blocked(TODAY), false); assert.equal(green(TODAY), true);  // today lit from the trace
    assert.equal(blocked('2026-06-04'), true);                             // any other day -> blocked
    assert.equal(blocked('2020-01-01'), true);
});

test('BOTH historical and recent', () => {
    reset(['2026-06-02', '2026-05-29'], ['2026-06-05']);
    assert.equal(blocked(TODAY), false); assert.equal(green(TODAY), true);        // today via recent edge
    assert.equal(blocked('2026-06-02'), false); assert.equal(green('2026-06-02'), true); // historical active
    assert.equal(blocked('2026-06-03'), true);                                    // idle gap -> blocked
    assert.equal(blocked('2026-05-01'), true);                                    // before oldest -> blocked (no roam)
});

// ---------------------------------------------------------------------------
// The I/O shell — fetchHistoricalDates / fetchTraceDates, with fetch stubbed.
// The module reads two globals: `globeDataBaseUrl` and `fetch`. We provide both.
// ---------------------------------------------------------------------------

globalThis.globeDataBaseUrl = 'https://test.invalid'; // module reads this bare global

// Swap globalThis.fetch for `impl`; returns a handle to restore it and inspect call count.
function stubFetch(impl) {
    const orig = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = async (...args) => { calls++; return impl(...args); };
    return { restore: () => { globalThis.fetch = orig; }, get calls() { return calls; } };
}
const jsonResponse = (body, ok = true) => ({ ok, json: async () => body });

test('fetchHistoricalDates: 2xx with dates -> returns AND caches them', async () => {
    reset();
    const f = stubFetch(() => jsonResponse({ dates: ['2026-06-02', '2026-05-29'] }));
    try {
        assert.deepEqual(await ah.fetchHistoricalDates('abc123'), ['2026-06-02', '2026-05-29']);
        assert.deepEqual(ah.historicalDatesByIcao['abc123'], ['2026-06-02', '2026-05-29']);
    } finally { f.restore(); }
});

test('fetchHistoricalDates: 2xx with no dates -> caches [] (genuine empty)', async () => {
    reset();
    const f = stubFetch(() => jsonResponse({})); // no `dates` field
    try {
        assert.deepEqual(await ah.fetchHistoricalDates('abc123'), []);
        assert.deepEqual(ah.historicalDatesByIcao['abc123'], []); // cached -> won't retry
    } finally { f.restore(); }
});

test('fetchHistoricalDates: non-2xx -> null, NOT cached (will retry)', async () => {
    reset();
    const f = stubFetch(() => jsonResponse(null, false));
    try {
        assert.equal(await ah.fetchHistoricalDates('abc123'), null);
        assert.equal('abc123' in ah.historicalDatesByIcao, false);
    } finally { f.restore(); }
});

test('fetchHistoricalDates: fetch throws -> null, NOT cached', async () => {
    reset();
    const f = stubFetch(() => { throw new Error('network down'); });
    try {
        assert.equal(await ah.fetchHistoricalDates('abc123'), null);
        assert.equal('abc123' in ah.historicalDatesByIcao, false);
    } finally { f.restore(); }
});

test('fetchHistoricalDates: short-circuits on a cached array (no network call)', async () => {
    reset(['2026-06-02']);
    const f = stubFetch(() => { throw new Error('should not be called'); });
    try {
        assert.deepEqual(await ah.fetchHistoricalDates('abc123'), ['2026-06-02']);
        assert.equal(f.calls, 0);
    } finally { f.restore(); }
});

test('fetchTraceDates: 2xx -> delegates to datesFromTrace', async () => {
    reset();
    const base = Math.floor(Date.parse('2026-06-04T12:00:00Z') / 1000);
    const f = stubFetch(() => jsonResponse({ timestamp: base, trace: [[0, 51, -0.1]] }));
    try {
        assert.deepEqual(await ah.fetchTraceDates('abc123'), ['2026-06-04']);
    } finally { f.restore(); }
});

test('fetchTraceDates: builds the trace_full URL from the last two hex chars', async () => {
    reset();
    let url;
    const f = stubFetch((u) => { url = u; return jsonResponse({ timestamp: 0, trace: [] }); });
    try {
        await ah.fetchTraceDates('a835af');
        assert.equal(url, 'data/traces/af/trace_full_a835af.json');
    } finally { f.restore(); }
});

test('fetchTraceDates: non-2xx -> null (FAILED, not empty)', async () => {
    reset();
    const f = stubFetch(() => jsonResponse(null, false));
    try { assert.equal(await ah.fetchTraceDates('abc123'), null); }
    finally { f.restore(); }
});

test('fetchTraceDates: fetch throws -> null (FAILED, not empty)', async () => {
    reset();
    const f = stubFetch(() => { throw new Error('network down'); });
    try { assert.equal(await ah.fetchTraceDates('abc123'), null); }
    finally { f.restore(); }
});
