// ActivityHistory module for smart history navigation
// Fetches active dates in 6-month windows from the API. The client accumulates
// dates as the user navigates backwards, avoiding large upfront payloads.
const ActivityHistory = {
    cache: {},              // { icao: { dates: [...], oldestFetched: Date, fetchedAt: timestamp } }
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

    // Initial fetch — gets the most recent 6 months of active dates
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
                let allDates = [];

                for (let i = 0; i < maxWindows; i++) {
                    const startDate = new Date(endDate);
                    startDate.setMonth(startDate.getMonth() - this.windowMonths);

                    const dates = await this.requestWindow(icao, startDate, endDate);
                    if (dates === null) return []; // API error — don't cache

                    if (dates.length > 0) {
                        allDates = dates;
                        this.cache[icao] = {
                            dates: allDates,
                            oldestFetched: startDate,
                            fetchedAt: Date.now()
                        };
                        this.pruneCache();
                        return allDates;
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

    // Fetch an older 6-month window and merge into cache
    async fetchOlderDates(icao) {
        const cached = this.cache[icao];
        if (!cached) return [];

        const key = `older-${icao}`;
        if (this.inFlightRequests[key]) {
            return await this.inFlightRequests[key];
        }

        const promise = (async () => {
            try {
                const windowEnd = new Date(cached.oldestFetched);
                const windowStart = new Date(windowEnd);
                windowStart.setMonth(windowStart.getMonth() - this.windowMonths);

                const dates = await this.requestWindow(icao, windowStart, windowEnd);
                if (dates === null) return cached.dates; // API error — return what we have

                // Merge and deduplicate
                const allDates = [...new Set([...cached.dates, ...dates])];
                allDates.sort().reverse(); // Descending

                cached.dates = allDates;
                cached.oldestFetched = windowStart;
                cached.fetchedAt = Date.now();

                // If this window returned nothing, mark backwards as exhausted
                if (dates.length === 0) cached.prevExhausted = true;

                return allDates;
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
        const current = currentDate instanceof Date ? currentDate.toISOString().split('T')[0] : currentDate;
        const hasInCache = cached.dates.some(d => d < current);
        if (hasInCache) return true;
        return !cached.prevExhausted; // May still have older data on server
    },

    getNextDate(icao, currentDate) {
        const cached = this.cache[icao];
        if (!cached?.dates?.length) return null;

        const current = currentDate instanceof Date ? currentDate.toISOString().split('T')[0] : currentDate;
        const dates = [...cached.dates].sort(); // Ascending
        const idx = dates.findIndex(d => d > current);
        return idx >= 0 ? dates[idx] : null;
    },

    // Returns the previous date, or fetches an older window if at the boundary
    async getPrevDate(icao, currentDate) {
        const cached = this.cache[icao];
        if (!cached?.dates?.length) return null;

        const current = currentDate instanceof Date ? currentDate.toISOString().split('T')[0] : currentDate;
        const dates = [...cached.dates].sort().reverse(); // Descending
        const idx = dates.findIndex(d => d < current);

        if (idx >= 0) return dates[idx];

        // At the boundary — try fetching older data
        await this.fetchOlderDates(icao);
        const updated = this.cache[icao];
        if (!updated?.dates?.length) return null;

        const updatedDates = [...updated.dates].sort().reverse();
        const newIdx = updatedDates.findIndex(d => d < current);
        return newIdx >= 0 ? updatedDates[newIdx] : null;
    },

    clear(icao) {
        if (icao) {
            delete this.cache[icao];
        } else {
            this.cache = {};
        }
    }
};
