// ActivityHistory module for smart history navigation
const ActivityHistory = {
    cache: {},              // { icao: { dates: [...], fetchedAt: timestamp, exhausted: bool } }
    cacheTTL: 300000,       // 5 minutes
    maxCacheSize: 50,       // Limit cache entries
    windowMonths: 6,        // Each API request covers 6 months
    maxSearchYears: 10,     // Give up after searching 10 years back
    maxRequests: 20,        // 10 years ÷ 6 months = 20 requests max
    apiBaseUrl: (typeof apiBaseUrl !== 'undefined' && apiBaseUrl) ? apiBaseUrl : 'http://localhost:8090/api/aircraft/v2',
    inFlightRequests: {},   // Track in-flight requests to prevent duplicates

    hasValidCache(icao) {
        const cached = this.cache[icao];
        if (!cached) return false;
        const age = Date.now() - cached.fetchedAt;
        return age < this.cacheTTL && !cached.exhausted;
    },

    isExhausted(icao) {
        return this.cache[icao]?.exhausted === true;
    },

    // Check if activity was found for an ICAO
    // Returns: true if activity dates found, false if exhausted or not checked yet
    hasActivity(icao) {
        const cached = this.cache[icao];
        if (!cached) return false;
        return cached.dates && cached.dates.length > 0;
    },

    // Prune cache when it exceeds maxCacheSize (LRU eviction)
    pruneCache() {
        const entries = Object.entries(this.cache);
        if (entries.length <= this.maxCacheSize) return;

        // Sort by fetchedAt (oldest first) and remove excess
        entries.sort((a, b) => a[1].fetchedAt - b[1].fetchedAt);
        const toRemove = entries.length - this.maxCacheSize;
        for (let i = 0; i < toRemove; i++) {
            delete this.cache[entries[i][0]];
        }
    },

    async requestActiveDates(icao, startDate, endDate) {
        const timeFrom = Math.floor(startDate.getTime() / 1000);
        const timeTo = Math.floor(endDate.getTime() / 1000);
        
        const startDateStr = startDate.toISOString().split('T')[0];
        const endDateStr = endDate.toISOString().split('T')[0];

        // Get cookie for authentication
        let cookie = this.getCookie('adsbx_api');
        if (!cookie) {
            // For development: set a test cookie if missing
            const futureTimestamp = Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60); // 1 year from now
            const testCookie = `${futureTimestamp}_dev_test_token`;
            document.cookie = `adsbx_api=${testCookie}; path=/; max-age=${365 * 24 * 60 * 60}`;
            cookie = testCookie;
            console.log('ActivityHistory: Set test cookie for development');
        }

        const payload = {
            user_token: cookie,
            payload: {
                icao: icao,
                time_from: timeFrom,
                time_to: timeTo
            }
        };

        try {
            const response = await fetch(`${this.apiBaseUrl}/operations/icao/active-dates`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'include',  // Required for cross-origin requests to send cookies
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                console.warn(`ActivityHistory: API returned ${response.status} ${response.statusText}`);
                return [];
            }

            const data = await response.json();
            return data.active_dates || [];
        } catch (error) {
            console.error('ActivityHistory: Request failed', error);
            console.error('ActivityHistory: Error details:', error.message, error.stack);
            return [];
        }
    },

    getCookie(name) {
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        if (parts.length === 2) return parts.pop().split(';').shift();
        return null;
    },

    async fetchActiveDates(icao) {
        // Check cache first
        if (this.hasValidCache(icao)) {
            return this.cache[icao].dates;
        }

        // Check if exhausted
        if (this.isExhausted(icao)) {
            return [];
        }

        // Prevent duplicate concurrent requests for the same ICAO
        if (this.inFlightRequests[icao]) {
            return await this.inFlightRequests[icao];
        }

        // Create a promise for this request
        const requestPromise = (async () => {
            try {
                let attempts = 0;
                let endDate = new Date();
                let allDates = [];

                while (attempts < this.maxRequests) {
                    const startDate = new Date(endDate);
                    startDate.setMonth(startDate.getMonth() - this.windowMonths);
                    
                    const dates = await this.requestActiveDates(icao, startDate, endDate);

                    if (dates.length > 0) {
                        allDates = allDates.concat(dates);
                        // Found activity - cache and return
                        this.cache[icao] = { dates: allDates, fetchedAt: Date.now(), exhausted: false };
                        this.pruneCache();
                        delete this.inFlightRequests[icao];
                        return allDates;
                    }

                    // Shift window back 6 months and try again
                    endDate = new Date(startDate); // Create new Date object to avoid reference issues
                    attempts++;
                }

                // Gave up after 10 years - mark as exhausted
                this.cache[icao] = { dates: [], fetchedAt: Date.now(), exhausted: true };
                this.pruneCache();
                delete this.inFlightRequests[icao];
                return [];
            } catch (error) {
                console.error('ActivityHistory: Error in fetchActiveDates loop:', error);
                delete this.inFlightRequests[icao];
                throw error;
            }
        })();

        // Store the promise BEFORE awaiting, so concurrent calls can wait for it
        this.inFlightRequests[icao] = requestPromise;
        
        try {
            const result = await requestPromise;
            return result;
        } catch (error) {
            // If the promise was deleted, it means it completed (success or exhausted)
            // Only delete if it's still our promise
            if (this.inFlightRequests[icao] === requestPromise) {
                delete this.inFlightRequests[icao];
            }
            throw error;
        }
    },

    getNextDate(icao, currentDate) {
        const cached = this.cache[icao];
        if (!cached || !cached.dates || cached.dates.length === 0) return null;

        // Find the next date after currentDate
        const current = currentDate instanceof Date ? currentDate.toISOString().split('T')[0] : currentDate;
        const dates = cached.dates.sort(); // Ensure sorted ascending
        const idx = dates.findIndex(d => d > current);
        return idx >= 0 ? dates[idx] : null;
    },

    getPrevDate(icao, currentDate) {
        const cached = this.cache[icao];
        if (!cached || !cached.dates || cached.dates.length === 0) return null;

        // Find the previous date before currentDate
        const current = currentDate instanceof Date ? currentDate.toISOString().split('T')[0] : currentDate;
        const dates = cached.dates.sort().reverse(); // Ensure sorted descending
        const idx = dates.findIndex(d => d < current);
        return idx >= 0 ? dates[idx] : null;
    },

    clear(icao) {
        if (icao) {
            delete this.cache[icao];
        } else {
            this.cache = {};
        }
    }
};
