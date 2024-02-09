let boardData = [];
let schema = null;
let countries = []
let cities = [];
let aircraftTypes = [];
let signalTypes = [];

function handleDataResponse(response) {
    schema = response.data.schemas;
    boardData = response.data.feeders;
    getGeoInfoList(boardData);
    renderboard();
    renderFilter();
    populateBoardStats(response.data.network_stats);
    showDefaultFeederStats();
    setLoaderViewState(false);
    handleGeolocationPermission();
}

function getGeoInfoList(feederlist) {
    let distinctCountries = new Set();
    let distinctCities = new Set();
    let distinctAircraftTypes = new Set();
    let distinctSignalTypes = new Set();

    feederlist.forEach((feederArray) => {
        const feeder = new Feeder(feederArray, schema);
        const country = feeder.get("country");
        const region = feeder.get("region");
        const city = feeder.get("city");
        const state = feeder.get("state");
        const all_positions_stats = feeder.get("all_positions_stats");
        const feederRegion = region && region.trim() !== "" ? region : "Others";

        if (country && country.trim() !== "") {
            distinctCountries.add({ region: feederRegion, country: country });
        }
        if (city && city.trim() !== "") {
            distinctCities.add({ city: city, region: feederRegion, country: country, state: state });
        }
        all_positions_stats.forEach((statsArray) => {
            const stats = new PositionStat("all_positions_stats", statsArray, schema);
            const make_type_name = stats.get("make_type_name");
            const signal_type = stats.get("signal_type");

            if (make_type_name !== "Undefined") {
                distinctAircraftTypes.add(make_type_name);
            }
            distinctSignalTypes.add(signal_type);
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
    countries.unshift({ region: "Popular", country: "United States" });
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
        let searchedFeeder = data.find(feederArray => {
            const feeder = new Feeder(feederArray, schema);
            return feeder.get("user").toLowerCase() === filterState.feeder_name.toLowerCase()
                || (feeder.get("sid") && feeder.get("sid").toLowerCase() === filterState.feeder_name.toLowerCase());
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
        data = data.filter(feeder => {
            const region = new Feeder(feeder, schema).get("region");
            return region && filterState.region.some(r => r.toLowerCase() === region.toLowerCase())
        });
    }
    return data;
}

function filterByCountry(data, filterState) {
    if (filterState.country.length > 0) {
        data = data.filter(feeder => {
            const country = new Feeder(feeder, schema).get("country");
            return country && filterState.country.some(c => c.toLowerCase() === country.toLowerCase());
        });
    }
    return data;
}

function filterByMunicipality(data, filterState) {
    if (filterState.city.length > 0) {
        data = data.filter(feeder => {
            const city = new Feeder(feeder, schema).get("city");
            return city && filterState.city.some(c => c.toLowerCase() === city.toLowerCase());
        });
    }
    return data;
}

function filterByAircraftType(data, filterState) {
    if (filterState.make_type_name.length > 0) {
        data = data.filter(feeder => {
            const all_positions_stats = new Feeder(feeder, schema).get("all_positions_stats");
            return all_positions_stats.some(stat => filterState.make_type_name.some(type => {
                const positionStat = new PositionStat("all_positions_stats", stat, schema);
                return type.toLowerCase() === positionStat.get("make_type_name").toLowerCase();
            }));
        });
    }
    return data;
}

function filterBySignalType(data, filterState) {
    if (filterState.signal_type.length > 0) {
        const signalTypeIndex = getSignalTypeIndex("signal_type");
        data = data.filter(feeder => {
            const all_positions_stats = new Feeder(feeder, schema).get("all_positions_stats");
            return all_positions_stats.some(stat =>
                filterState.signal_type
                    .some(type => getSignalTypeIndexFromFriendlyName(type) === stat[signalTypeIndex]));

            return all_positions_stats.some(stat => filterState.signal_type.some(type => {
                const positionStat = new PositionStat("all_positions_stats", stat, schema);
                return type.toLowerCase() === positionStat.get("signal_type").toLowerCase();
            }));
        });
    }
    return data;
}

function filterByDistance(data, filterState) {
    if (filterState.distance > 0) {
        data = data.filter(feederArray => {
            const feeder = new Feeder(feederArray, schema);
            return isWithinDistance(feeder.get("lat"), feeder.get("lon"), filterState.distance)
        });
    }
    return data;
}

function getSignalTypeIndexFromFriendlyName(signalTypeFriendlyName) {
    const friendlyNameMap = schema[".all_positions_stats.signal_type._friendly_name_map"];
    const valueMap = schema[".all_positions_stats.signal_type._value_map"];
    const value = Object.keys(friendlyNameMap).find(key => friendlyNameMap[key] === signalTypeFriendlyName);
    return valueMap[value];
}

function getSignalTypeIndex() {
    return schema[".all_positions_stats._schema_index"]["signal_type"];
}


function transformFeeder(feederArray) {
    const filterPositionStats = shouldFilterPositionStats();
    const feeder = new Feeder(feederArray, schema);
    const uptime = feeder.get("uptime");
    const positions = feeder.get("positions");
    const aircraft_on_ground = feeder.get("aircraft_on_ground");
    const aircraft_total = feeder.get("aircraft_total");
    const aircraft_unique = feeder.get("aircraft_unique");
    const all_positions_stats = feeder.get("all_positions_stats");
    const unique_positions_stats = feeder.get("unique_positions_stats");
    const uuid = feeder.get("uuid");
    const user = feeder.get("user");
    const country = feeder.get("country");
    const region = feeder.get("region");
    const state = feeder.get("state");
    const city = feeder.get("city");
    const avg_sq_nm_range = feeder.get("avg_sq_nm_range");
    const max_range_nm = feeder.get("max_range_nm");
    const nearest_airport_nm = feeder.get("nearest_airport_nm");
    const uniqueness = feeder.get("uniqueness");
    const uniqueness_pct = feeder.get("uniqueness_percentile");
    const feederUniqueness = uniqueness_pct >= 100 ? 100 : uniqueness_pct;
    const feederUptime = uptime >= 100 ? 100 : uptime;
    const position = filterPositionStats
        ? all_positions_stats
            .filter(stat => filterFeederStats(stat))
            .reduce((sum, stat) => sum + new PositionStat("all_positions_stats", stat, schema).get("positions"), 0)
        : positions;
    const aircraftOnGround = filterPositionStats
        ? all_positions_stats
            .filter(stat => new PositionStat("all_positions_stats", stat, schema).get("on_ground") === "On Ground" && filterFeederStats(stat))
            .reduce((sum, stat) => sum + new PositionStat("all_positions_stats", stat, schema).get("aircrafts"), 0)
        : aircraft_on_ground;
    const totalAircraft = filterPositionStats
        ? all_positions_stats
            .filter(stat => filterFeederStats(stat))
            .reduce((sum, stat) => sum + new PositionStat("all_positions_stats", stat, schema).get("aircrafts"), 0)
        : aircraft_total;
    const uniqueAircraft = filterPositionStats
        ? unique_positions_stats
            .filter(stat => filterFeederStats(stat))
            .reduce((sum, stat) => sum + new PositionStat("unique_positions_stats", stat, schema).get("aircrafts"), 0)
        : aircraft_unique;
    return {
        uuid: uuid,
        feeder_name: user,
        country: country,
        region: region,
        state: state,
        city: city,
        uptime: feederUptime,
        avg_range: avg_sq_nm_range,
        max_range: max_range_nm,
        position: position,
        aircraft_on_ground: aircraftOnGround,
        total_aircraft: totalAircraft,
        unique_aircraft: uniqueAircraft,
        nearest_airport: nearest_airport_nm,
        uniqueness: uniqueness,
        uniqueness_pct: feederUniqueness
    };
}

function filterFeederStats(stat) {
    let result = true;
    const positionStat = new PositionStat("all_positions_stats", stat, schema);

    if (filterState.make_type_name.length > 0) {
        result = filterState.make_type_name.some(type => type.toLowerCase() === positionStat.get("make_type_name").toLowerCase());
    }

    if (filterState.signal_type.length > 0) {
        result = result && filterState.signal_type.some(type => type.toLowerCase() === positionStat.get("signal_type").toLowerCase());
    }

    return result;
}
