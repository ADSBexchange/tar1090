let boardData = [];
let countries = []
let regions = [];
let cities = [];
let aircraftTypes = [];
let signalTypes = [];

function handleDataResponse(response) {
    boardData = response.data.rows;
    getGeoInfoList(boardData);
    renderboard();
    renderFilter();
    setLoaderViewState(false);
    handleGeolocationPermission();
}

function getGeoInfoList(feederlist) {
    let distinctCountries = new Set();
    let distinctCities = new Set();
    let distinctAircraftTypes = new Set();
    let distinctSignalTypes = new Set();

    feederlist.forEach((feeder) => {
        if (feeder.country && feeder.country.trim() !== "") {
            distinctCountries.add({ region: feeder.region, country: feeder.country });
        }
        if (feeder.city && feeder.city.trim() !== "") {
            distinctCities.add({ city: feeder.city, region: feeder.region, country: feeder.country, state: feeder.state });
        }
        feeder.all_positions_stats.forEach((stats) => {
            if (stats.make_type_name !== "Undefined" && stats.make_type_name !== "R - Piston") {
                distinctAircraftTypes.add(stats.make_type_name);
            }
            distinctSignalTypes.add(stats.signal_type);
        });
    });

    distinctCountries = Array.from(distinctCountries).reduce((acc, curr) => {
        const existingCountry = acc.find(country => country.region === curr.region && country.country === curr.country);
        if (!existingCountry) {
            acc.push(curr);
        }
        return acc;
    }, []);

    distinctCities = Array.from(distinctCities).reduce((acc, curr) => {
        const existingCity = acc.find(city => city.city === curr.city && city.region === curr.region && city.country === curr.country && city.state === curr.state);
        if (!existingCity) {
            acc.push(curr);
        }
        return acc;
    }, []);
    countries = Array.from(distinctCountries).sort((a, b) => a.country.localeCompare(b.country));
    cities = Array.from(distinctCities).sort((a, b) => a.city.localeCompare(b.city));
    aircraftTypes = Array.from(distinctAircraftTypes).sort();
    signalTypes = Array.from(distinctSignalTypes).sort();
}

function populateBoardStats(feederStats) {
    $("#feeder-count").text(formatNumber(feederStats.feeders_total));
    $("#feeders-added").text(formatNumber(feederStats.feeders_added_last_30_days));
    $("#monthly-positions").text(transformNumber(feederStats.positions_last_30_days, 1));
    $("#countries-count").text(transformNumber(feederStats.countries_total, 1));
    $("#daily-positions").text(transformNumber(feederStats.positions_captured_24h, 1));
    $("#aircraft-count").text(transformNumber(feederStats.aircrafts_seen_24h, 1));
}

function filterbyFeederName(data, filterState) {
    if (filterState.feeder_name) {
        let searchedFeeder = data.find(feeder => {
            return feeder.user.toLowerCase() === filterState.feeder_name.toLowerCase() ||
                feeder.sid.toLowerCase() === filterState.feeder_name.toLowerCase()
        });
        if (searchedFeeder) {
            filterState._filterContext = { foundFeeder: transformFeeder(searchedFeeder) };
        } else {
            $("#notification").getKendoNotification().show(`No feeder found matching ${filterState.feeder_name}`, "error");
        }
    }
    return data;
}

function filterByRegion(data, filterState) {
    if (filterState.region.length > 0) {
        data = data.filter(feeder => feeder.region && filterState.region.some(region => region.toLowerCase() === feeder.region.toLowerCase()));
    }
    return data;
}

function filterByCountry(data, filterState) {
    if (filterState.country.length > 0) {
        data = data.filter(feeder => feeder.country && filterState.country.some(country => country.toLowerCase() === feeder.country.toLowerCase()));
    }
    return data;
}

function filterByMunicipality(data, filterState) {
    if (filterState.city.length > 0) {
        data = data.filter(feeder => feeder.city && filterState.city.some(city => city.toLowerCase() === feeder.city.toLowerCase()));
    }
    return data;
}

function filterByAircraftType(data, filterState) {
    if (filterState.make_type_name.length > 0) {
        data = data.filter(feeder => feeder.all_positions_stats.some(stat => filterState.make_type_name.some(type => type.toLowerCase() === stat.make_type_name.toLowerCase())));
    }
    return data;
}

function filterBySignalType(data, filterState) {
    if (filterState.signal_type.length > 0) {
        data = data.filter(feeder => feeder.all_positions_stats.some(stat => filterState.signal_type.some(type => type.toLowerCase() === stat.signal_type.toLowerCase())));
    }
    return data;
}

function filterByDistance(data, filterState) {
    if (filterState.distance > 0) {
        data = data.filter(feeder => isWithinDistance(feeder.lat, feeder.lon, filterState.distance));
    }
    return data;
}

function transformFeeder(feeder) {
    const filterPositionStats = shouldFilterPositionStats();
    const feederUptime = feeder.uptime >= 100 ? 100 : feeder.uptime;
    const feederUniqueness = feeder.uniqueness_percentile >= 100 ? 100 : feeder.uniqueness_percentile;
    const position = filterPositionStats
        ? feeder.all_positions_stats.filter(stat => filterFeederStats(stat)).reduce((sum, stat) => sum + stat.positions, 0)
        : feeder.positions;
    const aircraftOnGround = filterPositionStats
        ? feeder.all_positions_stats.filter(stat => stat.on_ground && filterFeederStats(stat)).reduce((sum, stat) => sum + stat.aircrafts, 0)
        : feeder.aircraft_on_ground;
    const totalAircraft = filterPositionStats
        ? feeder.all_positions_stats.filter(stat => filterFeederStats(stat)).reduce((sum, stat) => sum + stat.aircrafts, 0)
        : feeder.aircraft_total;
    const uniqueAircraft = filterPositionStats
        ? feeder.unique_positions_stats.filter(stat => filterFeederStats(stat)).reduce((sum, stat) => sum + stat.aircrafts, 0)
        : feeder.aircraft_unique;
    return {
        uuid: feeder.uuid,
        feeder_name: feeder.user,
        country: feeder.country,
        region: feeder.region,
        state: feeder.state,
        city: feeder.city,
        uptime: feederUptime,
        avg_range: feeder.avg_sq_nm_range,
        max_range: feeder.max_range_nm,
        position: position,
        aircraft_on_ground: aircraftOnGround,
        total_aircraft: totalAircraft,
        unique_aircraft: uniqueAircraft,
        nearest_airport: feeder.nearest_airport_nm,
        uniqueness: feeder.uniqueness,
        uniqueness_pct: feederUniqueness
    };
}

function filterFeederStats(stat) {
    let result = true;
    if (filterState.make_type_name.length > 0) {
        result = filterState.make_type_name.some(type => type.toLowerCase() === stat.make_type_name.toLowerCase());
    }

    if (filterState.signal_type.length > 0) {
        result = result && filterState.signal_type.some(type => type.toLowerCase() === stat.signal_type.toLowerCase());
    }

    return result;
}