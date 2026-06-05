"use strict";

// Unit tests for ActivityHistory (AX-913). Pure logic only — no DOM — under Node's built-in runner:
//   ./test.sh   (or: node --test  from the repo root)
// `test/` is never deployed (install.sh copies only html/).
//
// AX-913 change vs dev: the active-dates dataset now covers full trace history, so nav jumps strictly
// between active dates — the old "free-step into pre-dataset days" crutch is gone (those days are
// disabled in the calendar). These tests pin that behaviour.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const ah = require('../html/activityHistory.js');

function reset(dates) {
    ah.datesByIcao = {};
    if (dates) ah.datesByIcao['abc123'] = dates;   // descending, as the API returns
}

const DATES = ['2026-06-04', '2026-06-02', '2026-05-29']; // newest -> oldest

// --- state predicates ---

test('hasFetched: true once a (possibly empty) result is cached, false otherwise', () => {
    reset();                 assert.equal(ah.hasFetched('abc123'), false); // never fetched
    reset([]);               assert.equal(ah.hasFetched('abc123'), true);  // fetched, empty
    reset(DATES);            assert.equal(ah.hasFetched('abc123'), true);
});

test('hasActivity: true only when there are dates', () => {
    reset(DATES);            assert.equal(ah.hasActivity('abc123'), true);
    reset([]);               assert.equal(ah.hasActivity('abc123'), false);
    reset();                 assert.equal(ah.hasActivity('abc123'), false);
});

test('getActiveDatesSet: membership set of the dates (empty when none)', () => {
    reset(DATES);
    assert.deepEqual(ah.getActiveDatesSet('abc123'), {
        '2026-06-04': true, '2026-06-02': true, '2026-05-29': true,
    });
    reset();
    assert.deepEqual(ah.getActiveDatesSet('abc123'), {});
});

// --- navigation: jumps strictly between active dates, no free-step (AX-913) ---

test('getNextDate: next active date after current; null at the newest', () => {
    reset(DATES);
    assert.equal(ah.getNextDate('abc123', '2026-05-29'), '2026-06-02');
    assert.equal(ah.getNextDate('abc123', '2026-06-02'), '2026-06-04');
    assert.equal(ah.getNextDate('abc123', '2026-06-04'), null); // already newest
});

test('getPrevDate: previous active date before current; null at the oldest', () => {
    reset(DATES);
    assert.equal(ah.getPrevDate('abc123', '2026-06-04'), '2026-06-02');
    assert.equal(ah.getPrevDate('abc123', '2026-06-02'), '2026-05-29');
    assert.equal(ah.getPrevDate('abc123', '2026-05-29'), null); // already oldest
});

test('nav: jumps OVER gaps and does NOT free-step before the oldest (AX-913)', () => {
    reset(DATES);
    assert.equal(ah.getNextDate('abc123', '2020-01-01'), '2026-05-29'); // jumps to first active date
    assert.equal(ah.getPrevDate('abc123', '2026-05-29'), null);         // no free-step into pre-dataset past
    assert.equal(ah.getNextDate('abc123', '2026-05-30'), '2026-06-02'); // skips the 05-30..06-01 gap
    assert.equal(ah.getPrevDate('abc123', '2026-06-04'), '2026-06-02'); // skips the gap going back
});

test('nav: no dates -> null both directions (old view handles roaming elsewhere)', () => {
    reset();
    assert.equal(ah.getNextDate('abc123', '2026-06-01'), null);
    assert.equal(ah.getPrevDate('abc123', '2026-06-01'), null);
});

// --- toDateStr (UTC key formatter) ---

test('toDateStr: Date -> UTC YYYY-MM-DD with zero-padding; passes strings through', () => {
    assert.equal(ah.toDateStr(new Date('2026-06-04T23:00:00Z')), '2026-06-04');
    assert.equal(ah.toDateStr(new Date('2026-01-05T00:00:00Z')), '2026-01-05'); // padding
    assert.equal(ah.toDateStr('2026-06-04'), '2026-06-04');
});

// --- fetchActiveDates (I/O shell), with fetch stubbed. Module reads globals `globeDataBaseUrl`+`fetch`. ---

globalThis.globeDataBaseUrl = 'https://test.invalid';

function stubFetch(impl) {
    const orig = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = async (...args) => { calls++; return impl(...args); };
    return { restore: () => { globalThis.fetch = orig; }, get calls() { return calls; } };
}
const jsonResponse = (body, ok = true) => ({ ok, json: async () => body });

test('fetchActiveDates: 2xx with dates -> returns AND caches', async () => {
    reset();
    const f = stubFetch(() => jsonResponse({ dates: DATES }));
    try {
        assert.deepEqual(await ah.fetchActiveDates('abc123'), DATES);
        assert.deepEqual(ah.datesByIcao['abc123'], DATES);
    } finally { f.restore(); }
});

test('fetchActiveDates: 2xx with no dates -> caches [] (genuine empty)', async () => {
    reset();
    const f = stubFetch(() => jsonResponse({}));
    try {
        assert.deepEqual(await ah.fetchActiveDates('abc123'), []);
        assert.deepEqual(ah.datesByIcao['abc123'], []);
    } finally { f.restore(); }
});

test('fetchActiveDates: non-2xx -> [] and NOT cached (retries next time)', async () => {
    reset();
    const f = stubFetch(() => jsonResponse(null, false));
    try {
        assert.deepEqual(await ah.fetchActiveDates('abc123'), []);
        assert.equal('abc123' in ah.datesByIcao, false);
    } finally { f.restore(); }
});

test('fetchActiveDates: fetch throws -> [] and NOT cached', async () => {
    reset();
    const f = stubFetch(() => { throw new Error('network down'); });
    try {
        assert.deepEqual(await ah.fetchActiveDates('abc123'), []);
        assert.equal('abc123' in ah.datesByIcao, false);
    } finally { f.restore(); }
});

test('fetchActiveDates: short-circuits on an already-fetched icao (no network call)', async () => {
    reset(DATES);
    const f = stubFetch(() => { throw new Error('should not be called'); });
    try {
        assert.deepEqual(await ah.fetchActiveDates('abc123'), DATES);
        assert.equal(f.calls, 0);
    } finally { f.restore(); }
});
