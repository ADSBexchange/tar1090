// ActivityHistory module for smart history navigation
// Fetches active dates in 6-month windows from the API. The client accumulates
// dates as the user navigates backwards, avoiding large upfront payloads.
"use strict";

const ActivityHistory = {
    cache: {},              // { icao: { dates: [...], oldestFetched: epoch, fetchedAt: timestamp, prevExhausted: bool } }
    cacheTTL: 300000,       // 5 minutes
    maxCacheSize: 50,       // LRU eviction threshold
    windowMonths: 6,        // Each API request covers 6 months
    apiBaseUrl: '/api/aircraft/v2',
    inFlightRequests: {},   // Dedup concurrent requests per ICAO

    hasActivity: function(icao) {
        var entry = this.cache[icao];
        return !!(entry && entry.dates && entry.dates.length > 0);
    },

    // Prune cache when it exceeds maxCacheSize (LRU eviction)
    pruneCache: function() {
        var entries = Object.entries(this.cache);
        if (entries.length <= this.maxCacheSize) return;
        entries.sort(function(a, b) { return a[1].fetchedAt - b[1].fetchedAt; });
        var toRemove = entries.length - this.maxCacheSize;
        for (var i = 0; i < toRemove; i++) {
            delete this.cache[entries[i][0]];
        }
    },

    getCookie: function(name) {
        var value = '; ' + document.cookie;
        var parts = value.split('; ' + name + '=');
        if (parts.length === 2) return parts.pop().split(';').shift();
        return null;
    },

    // Safe month subtraction — avoids overflow by clamping to 1st of month
    subtractMonths: function(date, months) {
        var d = new Date(date);
        d.setDate(1);
        d.setMonth(d.getMonth() - months);
        return d;
    },

    // Convert a date to YYYY-MM-DD in UTC
    toDateStr: function(date) {
        if (typeof date === 'string') return date;
        return date.getUTCFullYear() + '-' +
            String(date.getUTCMonth() + 1).padStart(2, '0') + '-' +
            String(date.getUTCDate()).padStart(2, '0');
    },

    // Fetch a single time window from the API
    requestWindow: async function(icao, startDate, endDate) {
        var cookie = this.getCookie('adsbx_api');

        try {
            var response = await fetch(this.apiBaseUrl + '/operations/icao/active-dates', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    user_token: cookie,
                    payload: {
                        icao: icao,
                        time_from: Math.floor(startDate.getTime() / 1000),
                        time_to: Math.floor(endDate.getTime() / 1000)
                    }
                })
            });

            if (!response.ok) {
                console.warn('ActivityHistory: API returned ' + response.status + ' ' + response.statusText);
                return null;
            }

            var data = await response.json();
            return data.active_dates || [];
        } catch (error) {
            console.error('ActivityHistory: Request failed', error.message);
            return null;
        }
    },

    // Initial fetch — walks back in 6-month windows until data is found
    fetchActiveDates: async function(icao) {
        var cached = this.cache[icao];
        if (cached && (Date.now() - cached.fetchedAt) < this.cacheTTL) {
            return cached.dates;
        }

        // Dedup concurrent requests
        var key = 'init-' + icao;
        if (this.inFlightRequests[key]) {
            return await this.inFlightRequests[key];
        }

        var self = this;
        var promise = (async function() {
            try {
                var maxWindows = 20; // 20 * 6 months = 10 years
                var endDate = new Date();

                for (var i = 0; i < maxWindows; i++) {
                    var startDate = self.subtractMonths(endDate, self.windowMonths);

                    var dates = await self.requestWindow(icao, startDate, endDate);
                    if (dates === null) return []; // API error — don't cache

                    if (dates.length > 0) {
                        self.cache[icao] = {
                            dates: dates,
                            oldestFetched: startDate,
                            fetchedAt: Date.now(),
                            prevExhausted: false
                        };
                        self.pruneCache();
                        return dates;
                    }

                    // Empty window — walk back further
                    endDate = startDate;
                }

                // Exhausted all windows — no data found
                self.cache[icao] = {
                    dates: [],
                    oldestFetched: endDate,
                    fetchedAt: Date.now(),
                    prevExhausted: true
                };
                self.pruneCache();
                return [];
            } finally {
                delete self.inFlightRequests[key];
            }
        })();

        this.inFlightRequests[key] = promise;
        return await promise;
    },

    // Fetch older windows and merge into cache. Walks back multiple windows
    // to handle gaps > 6 months (e.g. aircraft inactive for years then active again).
    fetchOlderDates: async function(icao) {
        var cached = this.cache[icao];
        if (!cached || cached.prevExhausted) return cached ? cached.dates : [];

        var key = 'older-' + icao;
        if (this.inFlightRequests[key]) {
            return await this.inFlightRequests[key];
        }

        var self = this;
        var promise = (async function() {
            try {
                var maxWindows = 20;
                var windowEnd = new Date(cached.oldestFetched);

                for (var i = 0; i < maxWindows; i++) {
                    var windowStart = self.subtractMonths(windowEnd, self.windowMonths);

                    var dates = await self.requestWindow(icao, windowStart, windowEnd);
                    if (dates === null) return cached.dates; // API error — return what we have

                    cached.oldestFetched = windowStart;
                    cached.fetchedAt = Date.now();

                    if (dates.length > 0) {
                        // Merge and deduplicate, keep descending order
                        var allDates = cached.dates.concat(dates).filter(function(d, i, arr) {
                            return arr.indexOf(d) === i;
                        });
                        allDates.sort().reverse();
                        cached.dates = allDates;
                        return allDates;
                    }

                    // Empty window — keep walking back
                    windowEnd = windowStart;
                }

                // Exhausted all windows
                cached.prevExhausted = true;
                return cached.dates;
            } finally {
                delete self.inFlightRequests[key];
            }
        })();

        this.inFlightRequests[key] = promise;
        return await promise;
    },

    // Returns true if there are known dates before currentDate, or if we haven't exhausted the search yet
    hasPrevDate: function(icao, currentDate) {
        var cached = this.cache[icao];
        if (!cached || !cached.dates || !cached.dates.length) return false;
        var current = this.toDateStr(currentDate);
        for (var i = 0; i < cached.dates.length; i++) {
            if (cached.dates[i] < current) return true;
        }
        return !cached.prevExhausted;
    },

    getNextDate: function(icao, currentDate) {
        var cached = this.cache[icao];
        if (!cached || !cached.dates || !cached.dates.length) return null;

        var current = this.toDateStr(currentDate);
        // dates are stored descending — walk from the end to find first > current
        var dates = cached.dates;
        for (var i = dates.length - 1; i >= 0; i--) {
            if (dates[i] > current) return dates[i];
        }
        return null;
    },

    // Returns the previous date, or fetches older windows if at the boundary
    getPrevDate: async function(icao, currentDate) {
        var cached = this.cache[icao];
        if (!cached || !cached.dates || !cached.dates.length) return null;

        var current = this.toDateStr(currentDate);
        // dates are stored descending — find first < current
        for (var i = 0; i < cached.dates.length; i++) {
            if (cached.dates[i] < current) return cached.dates[i];
        }

        // At the boundary — try fetching older data
        if (cached.prevExhausted) return null;
        await this.fetchOlderDates(icao);

        var updated = this.cache[icao];
        if (!updated || !updated.dates || !updated.dates.length) return null;
        for (var i = 0; i < updated.dates.length; i++) {
            if (updated.dates[i] < current) return updated.dates[i];
        }
        return null;
    },

    clear: function(icao) {
        if (icao) {
            delete this.cache[icao];
        } else {
            this.cache = {};
        }
    }
};
