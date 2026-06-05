"use strict";

// One-shot fetch of every active date for an ICAO. The Worker behind
// `globeDataBaseUrl` sets a daily-aligned `Cache-Control: max-age` so the
// browser's HTTP cache handles re-use across page loads — no client-side
// LRU/TTL bookkeeping needed.

// On fetch error nothing is cached — next selection of the same ICAO retries.
// Callers detect the errored state via `!hasFetched(icao)` and fall back to
// pre-AX-744 free-stepping nav (buttons + datepicker enabled, no day highlights).
var ActivityHistory = {
    datesByIcao: {},  // { icao: ["YYYY-MM-DD", ...] } — descending

    toDateStr: function(date) {
        if (typeof date === 'string') return date;
        return date.getUTCFullYear() + '-' +
            String(date.getUTCMonth() + 1).padStart(2, '0') + '-' +
            String(date.getUTCDate()).padStart(2, '0');
    },

    hasFetched: function(icao) {
        return Object.prototype.hasOwnProperty.call(this.datesByIcao, icao);
    },

    hasActivity: function(icao) {
        var dates = this.datesByIcao[icao];
        return !!(dates && dates.length > 0);
    },

    fetchActiveDates: async function(icao) {
        if (this.hasFetched(icao)) return this.datesByIcao[icao];
        try {
            var response = await fetch(globeDataBaseUrl + '/active-dates/' + icao);
            if (!response.ok) return [];
            var data = await response.json();
            var dates = data.dates || [];
            this.datesByIcao[icao] = dates;
            return dates;
        } catch (e) {
            return [];
        }
    },

    // AX-913: the dataset now covers full trace history, so nav jumps strictly between active dates —
    // no free-stepping into pre-dataset days (those are disabled in the calendar too).
    getNextDate: function(icao, currentDate) {
        var dates = this.datesByIcao[icao];
        if (!dates || !dates.length) return null;
        var current = this.toDateStr(currentDate);
        for (var i = dates.length - 1; i >= 0; i--) {
            if (dates[i] > current) return dates[i];
        }
        return null;
    },

    getPrevDate: function(icao, currentDate) {
        var dates = this.datesByIcao[icao];
        if (!dates || !dates.length) return null;
        var current = this.toDateStr(currentDate);
        for (var i = 0; i < dates.length; i++) {
            if (dates[i] < current) return dates[i];
        }
        return null;
    },

    getActiveDatesSet: function(icao) {
        var dates = this.datesByIcao[icao];
        if (!dates) return {};
        var set = {};
        for (var i = 0; i < dates.length; i++) set[dates[i]] = true;
        return set;
    }
};

// Node-only export for unit tests; inert in the browser.
if (typeof module !== 'undefined' && module.exports) { module.exports = ActivityHistory; }
