"use strict";

// Per-ICAO active dates for the history calendar, from two sources (kept separate, never merged):
//   historicalDatesByIcao — <= yesterday, one-shot fetch from GlobeData. Single source of truth, 3 states:
//                            undefined = unfetched/failed (retries), [] = no history, [d,...] = days (desc).
//   recentDatesByIcao     — today's edge, derived from the live trace_full (GlobeData lags ~25h). AX-913.
// Calendar has two modes, picked by hasActivity: none -> free-step everywhere; >=1 day -> activity-driven.
var ActivityHistory = {
    historicalDatesByIcao: {},  // { icao: ["YYYY-MM-DD", ...] } descending
    recentDatesByIcao: {},      // { icao: ["YYYY-MM-DD", ...] } descending

    toDateStr: function(date) {
        if (typeof date === 'string') return date;
        return date.getUTCFullYear() + '-' +
            String(date.getUTCMonth() + 1).padStart(2, '0') + '-' +
            String(date.getUTCDate()).padStart(2, '0');
    },

    // The view-mode signal: any known activity, past or today.
    hasActivity: function(icao) {
        var historical = this.historicalDatesByIcao[icao];
        var recent = this.recentDatesByIcao[icao];
        return !!((historical && historical.length) || (recent && recent.length));
    },

    // GlobeData answered empty (fetched-OK, no history, not flying today). Drives only the "no data"
    // message; a failed/pending fetch is undefined -> false -> stay silent.
    fetchedEmpty: function(icao) {
        var historical = this.historicalDatesByIcao[icao];
        return Array.isArray(historical) && historical.length === 0 && !this.hasActivity(icao);
    },

    // null = fetch failed (not cached, retries), [] = no history, [...] = days. Cached array = fetched-OK.
    fetchHistoricalDates: async function(icao) {
        if (Array.isArray(this.historicalDatesByIcao[icao])) return this.historicalDatesByIcao[icao];
        try {
            var response = await fetch(globeDataBaseUrl + '/active-dates/' + icao);
            if (!response.ok) return null;
            var data = await response.json();
            return (this.historicalDatesByIcao[icao] = data.dates || []);
        } catch (e) {
            return null;
        }
    },

    // Live edge: current-UTC-day trace (<=24h) the globe already serves. Relative URL = same host (no WAF
    // concern), browser-cache-deduped against the trail load. Error/non-2xx -> null (FAILED — distinct
    // from a 200 with no points, which is []). null means "couldn't tell"; mergeTraceDates ignores it, so
    // a failed trace never poisons the recent edge or masks a real fetch (matches the historical contract).
    fetchTraceDates: async function(icao) {
        try {
            var response = await fetch('data/traces/' + icao.slice(-2) + '/trace_full_' + icao + '.json');
            if (!response.ok) return null;
            var data = await response.json();
            return this.datesFromTrace(data);
        } catch (e) {
            return null;
        }
    },

    // Pure: distinct UTC dates in a trace. abs epoch = (timestamp||0) + point[0]s; works on raw or
    // normalized data, skips NaN. Normally [today] (or +yesterday across 00:00 UTC).
    datesFromTrace: function(traceData) {
        var trace = traceData && traceData.trace;
        if (!trace || !trace.length) return [];
        var base = traceData.timestamp || 0;
        var seen = {}, out = [];
        for (var i = 0; i < trace.length; i++) {
            var p = trace[i];
            if (!p || !Number.isFinite(p[0])) continue;
            var ds = this.toDateStr(new Date((base + p[0]) * 1000));
            if (!seen[ds]) { seen[ds] = true; out.push(ds); }
        }
        return out;
    },

    // Union dates into the recent edge (deduped, descending). Idempotent. Normally [today].
    mergeTraceDates: function(icao, dates) {
        if (!icao || !dates || !dates.length) return;
        var existing = this.recentDatesByIcao[icao] || [];
        var set = {};
        for (var i = 0; i < existing.length; i++) set[existing[i]] = true;
        for (var j = 0; j < dates.length; j++) set[dates[j]] = true;
        this.recentDatesByIcao[icao] = Object.keys(set).sort().reverse();
    },

    // Active dates as one ascending list (historical ∪ recent edge, deduped) — what nav steps through.
    sortedActiveDates: function(icao) {
        return Object.keys(this.getActiveDatesSet(icao)).sort();
    },

    // Next/prev active date relative to current; null at the ends. Nav jumps strictly between active
    // days — no free-stepping into empty days (the trace-complete dataset has no gaps to roam into).
    getNextDate: function(icao, currentDate) {
        var dates = this.sortedActiveDates(icao);
        var current = this.toDateStr(currentDate);
        for (var i = 0; i < dates.length; i++) { if (dates[i] > current) return dates[i]; }
        return null;
    },

    getPrevDate: function(icao, currentDate) {
        var dates = this.sortedActiveDates(icao);
        var current = this.toDateStr(currentDate);
        for (var i = dates.length - 1; i >= 0; i--) { if (dates[i] < current) return dates[i]; }
        return null;
    },

    // Membership set for highlighting: historical + recent edge.
    getActiveDatesSet: function(icao) {
        var set = {};
        var hist = this.historicalDatesByIcao[icao];
        if (hist) for (var i = 0; i < hist.length; i++) set[hist[i]] = true;
        var rec = this.recentDatesByIcao[icao];
        if (rec) for (var j = 0; j < rec.length; j++) set[rec[j]] = true;
        return set;
    },

    // Newest known active day (high-water max) — where history opens on a fresh selection, so you
    // land on a day with a flight rather than a possibly-empty today. null when no activity (caller
    // falls back to today).
    mostRecentActiveDate: function(icao) {
        var dates = this.sortedActiveDates(icao);
        return dates.length ? dates[dates.length - 1] : null;
    },

    // The only non-clickable calendar cell: any day that isn't an active day, once we have data for
    // this aircraft (hasActivity). The dataset is trace-complete, so "not in the set" means "didn't
    // fly" — no pre-dataset era to roam into. Today is NOT special-cased: it greys when idle, greens
    // when the live trace shows a flight. No data at all (hasActivity false — both sources empty or
    // failed) → nothing blocked → old view (roam). Green highlight is orthogonal (getActiveDatesSet).
    isNoActivityDay: function(icao, dateStr) {
        return this.hasActivity(icao) && !this.getActiveDatesSet(icao)[dateStr];
    }
};

// Node-only export for unit tests; inert in the browser.
if (typeof module !== 'undefined' && module.exports) { module.exports = ActivityHistory; }
