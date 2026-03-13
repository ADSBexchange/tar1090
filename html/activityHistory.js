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

    hasActivity(icao) {
        return this.cache[icao]?.dates?.length > 0;
    },

    // Prune cache when it exceeds maxCacheSize (LRU eviction)
    pruneCache() {
        const entries = Object.entries(this.cache);
        if (entries.length <= this.maxCacheSize) return;
        entries.sort((a, b) => a[1].fetchedAt - b[1].fetchedAt);
        const toRemove = entries.length - this.maxCacheSize;
        for (let i = 0; i < toRemove; i++) {
            delete this.cache[entries[i][0]];
        }
    },

    getCookie(name) {
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        if (parts.length === 2) return parts.pop().split(';').shift();
        return null;
    },

    // Safe month subtraction — avoids overflow by clamping to 1st of month
    subtractMonths(date, months) {
        const d = new Date(date);
        d.setDate(1);
        d.setMonth(d.getMonth() - months);
        return d;
    },

    // Convert a date to YYYY-MM-DD in UTC
    toDateStr(date) {
        if (typeof date === 'string') return date;
        return date.getUTCFullYear() + '-' +
            String(date.getUTCMonth() + 1).padStart(2, '0') + '-' +
            String(date.getUTCDate()).padStart(2, '0');
    },

    // Fetch a single time window from the API
    async requestWindow(icao, startDate, endDate) {
        const cookie = this.getCookie('adsbx_api');

        try {
            const response = await fetch(`${this.apiBaseUrl}/operations/icao/active-dates`, {
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
                console.warn(`ActivityHistory: API returned ${response.status} ${response.statusText}`);
                return null;
            }

            const data = await response.json();
            return data.active_dates || [];
        } catch (error) {
            console.error('ActivityHistory: Request failed', error.message);
            return null;
        }
    },

    // Initial fetch — walks back in 6-month windows until data is found
    async fetchActiveDates(icao) {
        const cached = this.cache[icao];
        if (cached && (Date.now() - cached.fetchedAt) < this.cacheTTL) {
            return cached.dates;
        }

        // Dedup concurrent requests
        const key = `init-${icao}`;
        if (this.inFlightRequests[key]) {
            return await this.inFlightRequests[key];
        }

        const promise = (async () => {
            try {
                const maxWindows = 20; // 20 * 6 months = 10 years
                let endDate = new Date();

                for (let i = 0; i < maxWindows; i++) {
                    const startDate = this.subtractMonths(endDate, this.windowMonths);

                    const dates = await this.requestWindow(icao, startDate, endDate);
                    if (dates === null) return []; // API error — don't cache

                    if (dates.length > 0) {
                        this.cache[icao] = {
                            dates: dates,
                            oldestFetched: startDate,
                            fetchedAt: Date.now(),
                            prevExhausted: false
                        };
                        this.pruneCache();
                        return dates;
                    }

                    // Empty window — walk back further
                    endDate = startDate;
                }

                // Exhausted all windows — no data found
                this.cache[icao] = {
                    dates: [],
                    oldestFetched: endDate,
                    fetchedAt: Date.now(),
                    prevExhausted: true
                };
                this.pruneCache();
                return [];
            } finally {
                delete this.inFlightRequests[key];
            }
        })();

        this.inFlightRequests[key] = promise;
        return await promise;
    },

    // Fetch older windows and merge into cache. Walks back multiple windows
    // to handle gaps > 6 months (e.g. aircraft inactive for years then active again).
    async fetchOlderDates(icao) {
        const cached = this.cache[icao];
        if (!cached || cached.prevExhausted) return cached?.dates || [];

        const key = `older-${icao}`;
        if (this.inFlightRequests[key]) {
            return await this.inFlightRequests[key];
        }

        const promise = (async () => {
            try {
                const maxWindows = 20;
                let windowEnd = new Date(cached.oldestFetched);

                for (let i = 0; i < maxWindows; i++) {
                    const windowStart = this.subtractMonths(windowEnd, this.windowMonths);

                    const dates = await this.requestWindow(icao, windowStart, windowEnd);
                    if (dates === null) return cached.dates; // API error — return what we have

                    cached.oldestFetched = windowStart;
                    cached.fetchedAt = Date.now();

                    if (dates.length > 0) {
                        // Merge and deduplicate, keep descending order
                        const allDates = [...new Set([...cached.dates, ...dates])];
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
                delete this.inFlightRequests[key];
            }
        })();

        this.inFlightRequests[key] = promise;
        return await promise;
    },

    // Returns true if there are known dates before currentDate, or if we haven't exhausted the search yet
    hasPrevDate(icao, currentDate) {
        const cached = this.cache[icao];
        if (!cached?.dates?.length) return false;
        const current = this.toDateStr(currentDate);
        const hasInCache = cached.dates.some(d => d < current);
        if (hasInCache) return true;
        return !cached.prevExhausted;
    },

    getNextDate(icao, currentDate) {
        const cached = this.cache[icao];
        if (!cached?.dates?.length) return null;

        const current = this.toDateStr(currentDate);
        // dates are stored descending — walk from the end to find first > current
        const dates = cached.dates;
        for (let i = dates.length - 1; i >= 0; i--) {
            if (dates[i] > current) return dates[i];
        }
        return null;
    },

    // Returns the previous date, or fetches older windows if at the boundary
    async getPrevDate(icao, currentDate) {
        const cached = this.cache[icao];
        if (!cached?.dates?.length) return null;

        const current = this.toDateStr(currentDate);
        // dates are stored descending — find first < current
        const prevInCache = cached.dates.find(d => d < current);
        if (prevInCache) return prevInCache;

        // At the boundary — try fetching older data
        if (cached.prevExhausted) return null;
        await this.fetchOlderDates(icao);

        const updated = this.cache[icao];
        if (!updated?.dates?.length) return null;
        return updated.dates.find(d => d < current) || null;
    },

    clear(icao) {
        if (icao) {
            delete this.cache[icao];
        } else {
            this.cache = {};
        }
    }
};
