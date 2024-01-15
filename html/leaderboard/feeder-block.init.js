let boardData = [];
let maxUniqueness = 0;
let maxUptime = 0;
let maxPosition = 0;
let maxTotalAircraft = 0;
let maxUniqueAircraft = 0;
let maxRange = 0;
let maxAvgRange = 0;
let maxNearestAirport = 0;
let maxAircraftOnGround = 0;
let countries = []
let regions = [];
let cities = [];
let aircraftTypes = [];
let signalTypes = [];
let activeGridCount = 0;
filterState = null;

resetFilterState();
initializeFeederGrid();
bindSearch();
initializeFeederChart();
renderboard();

$.ajax({
  url: LEADERBOARD_API_ENDPOINT,
  method: 'GET',
  dataType: "json",
  contentType: "application/json",
  xhrFields: {
    withCredentials: true,
  },
  crossDomain: true,
  success: function (response) {
    boardData = response.data.rows;
    getGeoInfoList(boardData);
    renderboard();
    renderFilter();
    populateFeederStats(response.data.network_stats);
  },
  error: function (error) {
    console.error('Error fetching feeder data:', error);
  }
});

function initializeFeederGrid() {
  $("#feeder-grid").kendoGrid({
    columns: [
      { field: "rank", title: "Rank", width: 60 },
      { field: "feeder_name", title: "Feeder Name" },
      { field: "country", title: "Country" },
      { field: "score", title: "Score", width: 140, format: "{0:##,#}" },
      { field: "uptime", title: "Uptime", width: 90, format: "{0:n2}\%" },
      { field: "avg_range", title: "Avg Range (SNM)", format: "{0:n2}" },
      { field: "max_range", title: "Max Range (NM)", format: "{0:n2}" },
      { field: "position", title: "Positions", format: "{0:n2}" },
      { field: "aircraft_on_ground", title: "Aircraft on Ground" },
      { field: "total_aircraft", title: "Total Aircraft" },
      { field: "unique_aircraft", title: "Unique Aircraft" },
      { field: "nearest_airport", title: "Nearest Airport (NM)" },
      { field: "uniqueness", title: "Uniqueness", width: 100, format: "{0:n2}" }
    ],
    sortable: false,
    pageable: {
      buttonCount: 10
    },
    selectable: "row",
    dataBound: populateCustomHeader
  });
  $("#notification").kendoNotification({
    allowHideAfter: 1000,
    width: 300,
    height: 50,
    position: {
      pinned: true,
      top: 30,
      // left: null,
      // bottom: 200,
      right: 30
    }
  });
}

function resetFilterState() {
  filterState = {
    _filterContext: null,
    feeder_name: null,
    country: [],
    region: [],
    city: [],
    make_type_name: [],
    signal_type: [],
    distance: 500
  };
}

function renderboard() {
  let feeders = generateFeederGridData(applyFilter());
  getMaximumProperties(feeders);
  calculateFeederScores(feeders);
  setGridDataSources(feeders);
  renderFeederSection();
  activeGridCount = feeders.length;
}

function applyFilter() {
  let filteredData = boardData;
  filterState._filterContext = null;
  filteredData = filterByRegion(filteredData, filterState);
  filteredData = filterByCountry(filteredData, filterState);
  filteredData = filterByMunicipality(filteredData, filterState);
  filteredData = filterByAircraftType(filteredData, filterState);
  filteredData = filterBySignalType(filteredData, filterState);
  filteredData = filterbyFeederName(filteredData, filterState);

  return filteredData;
}

function filterbyFeederName(data, filterState) {
  if (filterState.feeder_name) {
    let searchedFeeder = data.find(feeder => feeder.user.toLowerCase() === filterState.feeder_name.toLowerCase());
    if (searchedFeeder) {
      filterState._filterContext = { foundFeeder: transformFeeder(searchedFeeder) };
    } else {
      $("#notification").getKendoNotification().show(`No feeder found with matching ${filterState.feeder_name}`, "error");
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

function transformFeeder(feeder) {
  return {
    uuid: feeder.uuid,
    feeder_name: feeder.user,
    country: feeder.country,
    region: feeder.region,
    state: feeder.state,
    city: feeder.city,
    uptime: feeder.uptime,
    avg_range: feeder.avg_sq_nm_range,
    max_range: feeder.max_range_nm,
    position: feeder.all_positions_stats.filter(stat => filterFeederStats(stat)).reduce((sum, stat) => sum + stat.positions, 0),
    aircraft_on_ground: feeder.all_positions_stats.filter(stat => stat.on_ground && filterFeederStats(stat)).reduce((sum, stat) => sum + stat.aircrafts, 0),
    total_aircraft: feeder.all_positions_stats.filter(stat => filterFeederStats(stat)).reduce((sum, stat) => sum + stat.aircrafts, 0),
    unique_aircraft: feeder.unique_positions_stats.filter(stat => filterFeederStats(stat)).reduce((sum, stat) => sum + stat.aircrafts, 0),
    nearest_airport: feeder.nearest_airport_nm,
    uniqueness: feeder.uniqueness
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

function generateFeederGridData(feederlist) {
  return feederlist.map((feeder) => transformFeeder(feeder));
}

function bindSearch() {
  let input = $('#feeder-search-input');
  let button = $('.search-button');
  input.on('keyup', function (event) {
    if (event.key === 'Enter') {
      onFilterChange();
    }
  });

  button.on('click', onFilterChange);
}

function setGridDataSources(feederlist) {
  let dataSource = new kendo.data.DataSource({
    data: feederlist,
    pageSize: 10,
    schema: {
      model: {
        id: "uuid",
        fields: {
          uuid: { type: "string" },
          rank: { type: "number" },
          feeder_name: { type: "string" },
          country: { type: "string" },
          score: { type: "number", defaultValue: 100 },
          uptime: { type: "number" },
          avg_range: { type: "number" },
          max_range: { type: "number" },
          position: { type: "number" },
          aircraft_on_ground: { type: "number" },
          total_aircraft: { type: "number" },
          unique_aircraft: { type: "number" },
          nearest_airport: { type: "number" },
          uniqueness: { type: "number" }
        }
      },
    },
    height: 50,
    scrollable: true,
    filterable: {
      mode: "row"
    },
    sort: {
      field: "score",
      dir: "desc"
    }
  });
  let grid = $("#feeder-grid").data("kendoGrid");
  grid.setDataSource(dataSource);
  grid.refresh();
}

function renderFilter() {
  let regionDataSource = new kendo.data.DataSource({
    data: regions
  });
  let countriesDataSource = new kendo.data.DataSource({
    data: countries
  });
  let citiesDataSource = new kendo.data.DataSource({
    data: cities
  });
  $("#regionselect").kendoMultiSelect({
    placeholder: "Region",
    rounded: "medium",
    autoBind: false,
    dataSource: regionDataSource,
    dataTextField: "region",
    dataValueField: "region",
    change: function () {
      var filters = buildFilters(this.dataItems(), "region");
      countriesDataSource.filter(filters);
      onFilterChange();
    }
  });

  $("#countryselect").kendoMultiSelect({
    placeholder: "Country",
    dataSource: countriesDataSource,
    rounded: "medium",
    autoBind: false,
    dataValueField: "country",
    dataTextField: "country",
    change: function () {
      var filters = buildFilters(this.dataItems(), "country");
      citiesDataSource.filter(filters);
      onFilterChange();
    }
  });

  $("#municipalityselect").kendoMultiSelect({
    placeholder: "Municipality",
    dataTextField: "city",
    dataValueField: "city",
    rounded: "medium",
    autoBind: false,
    dataSource: citiesDataSource
  });

  $("#aircraftselect").kendoMultiSelect({
    placeholder: "Aircraft Type",
    rounded: "medium",
    autoBind: false,
    dataSource: aircraftTypes
  });

  $("#modeselect").kendoMultiSelect({
    placeholder: "Signal",
    rounded: "medium",
    autoBind: false,
    dataSource: signalTypes
  });

  $("#municipalityselect").data("kendoMultiSelect").bind("change", onFilterChange);
  $("#aircraftselect").data("kendoMultiSelect").bind("change", onFilterChange);
  $("#modeselect").data("kendoMultiSelect").bind("change", onFilterChange);

  // $("#distanceselect").kendoMultiSelect({
  //   placeholder: "Select distance...",
  //   dataTextField: "ProductName",
  //   dataValueField: "ProductID",
  //   autoBind: false,
  //   dataSource: {
  //     type: "odata",
  //     serverFiltering: true,
  //     transport: {
  //       read: {
  //         url: "https://demos.telerik.com/kendo-ui/service/Northwind.svc/Products",
  //       }
  //     }
  //   }
  // });
}

function buildFilters(dataItems, selector) {
  var filters = [],
    length = dataItems.length,
    idx = 0, dataItem;

  for (; idx < length; idx++) {
    dataItem = dataItems[idx];
    filters.push({
      field: selector,
      operator: "eq",
      value: dataItem[selector]
    });
  }

  return {
    logic: "or",
    filters: filters
  };
}

function onFilterChange() {
  let region = $("#regionselect").val();
  let country = $("#countryselect").val();
  let city = $("#municipalityselect").val();
  let aircraftType = $("#aircraftselect").val();
  let signalType = $("#modeselect").val();
  let feederSearchInput = $('#feeder-search-input').val();

  resetFilterState();
  if (region.length > 0) {
    filterState.region = region;
  }

  if (country.length > 0) {
    filterState.country = country;
  }

  if (city.length > 0) {
    filterState.city = city;
  }

  if (aircraftType.length > 0) {
    filterState.make_type_name = aircraftType;
  }

  if (signalType.length > 0) {
    filterState.signal_type = signalType;
  }

  if (feederSearchInput) {
    filterState.feeder_name = feederSearchInput;
  }

  renderboard();
}

function initializeFeederChart() {
  $("#hardware-chart").kendoChart({
    seriesDefaults: {
      type: "donut",
      margin: 2,
      startAngle: 90,
      overlay: {
        gradient: "none"
      }
    },
    chartArea: {
      background: ""
    },
    title: {
      visible: false,
      position: "top",
      text: "Hardware",
      font: "20px Helvetica Neue, Helvetica, Verdana, sans-serif"
    },
    legend: {
      visible: false,
    },
    seriesHover: function (e) {
      if (e.category) {
        if (e.category == "disabled") {
          e.preventDefault(); //Turns off tooltip for disabled category.
        }
      }
    },
    series: [],
    tooltip: {
      visible: true,
      template: "(#= series.name #) #= category # :#= value #%"
    }
  });

  $("#activity-chart").kendoChart({
    seriesDefaults: {
      type: "donut",
      margin: 2,
      startAngle: 90,
      overlay: {
        gradient: "none"
      }
    },
    chartArea: {
      background: ""
    },
    title: {
      visible: false,
      position: "top",
      text: "Activity"
    },
    legend: {
      visible: false,
    },
    seriesHover: function (e) {
      if (e.category) {
        if (e.category == "disabled") {
          e.preventDefault(); //Turns off tooltip for disabled category.
        }
      }
    },
    series: [],
    tooltip: {
      visible: true,
      template: "(#= series.name #) #= category # :#= value #%"
    }
  });

  $("#exchange-chart").kendoChart({
    seriesDefaults: {
      type: "donut",
      margin: 2,
      startAngle: 90,
      overlay: {
        gradient: "none"
      }
    },
    chartArea: {
      background: ""
    },
    title: {
      visible: false,
      position: "top",
      text: "Exchange"
    },
    legend: {
      visible: false,
    },
    seriesHover: function (e) {
      if (e.category) {
        if (e.category == "disabled") {
          e.preventDefault(); //Turns off tooltip for disabled category.
        }
      }
    },
    series: [],
    tooltip: {
      visible: true,
      template: "(#= series.name #) #= category # :#= value #%"
    }
  });

  $("#rank-chart").kendoChart({
    title: {
      visible: false,
      text: "Internet Users"
    },
    legend: {
      position: "bottom",
      visible: false
    },
    chartArea: {
      background: ""
    },
    seriesDefaults: {
      type: "line",
      style: "smooth"
    },
    series: [{
      name: "World",
      data: [55.7, 80, 73.5, 96.6],
      markers: {
        visible: false
      }
    }],
    valueAxis: {
      labels: {
        format: "{0}%"
      }
    },
    categoryAxis: {
      categories: [new Date(new Date().getTime() - 30 * 24 * 60 * 60 * 1000), new Date()]
    }
  });
}

function populateFeederStats(feederStats) {
  $("#feeder-count").text(formatNumber(feederStats.feeders_total));
  $("#feeders-added").text(formatNumber(feederStats.feeders_added_last_30_days));
  $("#monthly-positions").text(transformNumber(feederStats.positions_last_30_days, 1));
  $("#countries-count").text(transformNumber(feederStats.countries_total, 1));
  $("#daily-positions").text(transformNumber(feederStats.positions_captured_24h, 1));
  $("#aircraft-count").text(transformNumber(feederStats.aircrafts_seen_24h, 1));
}

function getMaximumProperties(feederlist) {
  feederlist.forEach((feeder) => {
    maxUptime = Math.max(maxUptime, feeder.uptime);
    maxAvgRange = Math.max(maxRange, feeder.avg_range);
    maxRange = Math.max(maxAvgRange, feeder.max_range);
    maxPosition = Math.max(maxPosition, feeder.position);
    maxAircraftOnGround = Math.max(maxAircraftOnGround, feeder.aircraft_on_ground);
    maxTotalAircraft = Math.max(maxTotalAircraft, feeder.total_aircraft);
    maxUniqueAircraft = Math.max(maxUniqueAircraft, feeder.unique_aircraft);
    maxNearestAirport = Math.max(maxNearestAirport, feeder.nearest_airport);
    maxUniqueness = Math.max(maxUniqueness, feeder.uniqueness);
  });
}

function getGeoInfoList(feederlist) {
  let distinctCountries = new Set();
  let distinctRegions = new Set();
  let distinctCities = new Set();
  let distinctAircraftTypes = new Set();
  let distinctSignalTypes = new Set();

  feederlist.forEach((feeder) => {
    if (feeder.country && feeder.country.trim() !== "") {
      distinctCountries.add({ region: feeder.region, country: feeder.country });
    }
    if (feeder.region && feeder.region.trim() !== "") {
      distinctRegions.add({ region: feeder.region });
    }
    if (feeder.city && feeder.city.trim() !== "") {
      distinctCities.add({ city: feeder.city, region: feeder.region, country: feeder.country });
    }
    feeder.all_positions_stats.forEach((stats) => {
      if (stats.make_type_name !== "Undefined") {
        distinctAircraftTypes.add(stats.make_type_name);
      }
      distinctSignalTypes.add(stats.signal_type);
    });
  });

  distinctRegions = Array.from(distinctRegions).reduce((acc, curr) => {
    const existingRegion = acc.find(region => region.region === curr.region);
    if (!existingRegion) {
      acc.push(curr);
    }
    return acc;
  }, []);

  distinctCountries = Array.from(distinctCountries).reduce((acc, curr) => {
    const existingCountry = acc.find(country => country.region === curr.region && country.country === curr.country);
    if (!existingCountry) {
      acc.push(curr);
    }
    return acc;
  }, []);

  distinctCities = Array.from(distinctCities).reduce((acc, curr) => {
    const existingCity = acc.find(city => city.city === curr.city && city.region === curr.region && city.country === curr.country);
    if (!existingCity) {
      acc.push(curr);
    }
    return acc;
  }, []);
  countries = Array.from(distinctCountries).sort((a, b) => a.country.localeCompare(b.country));
  regions = Array.from(distinctRegions).sort((a, b) => a.region.localeCompare(b.region));
  cities = Array.from(distinctCities).sort((a, b) => a.city.localeCompare(b.city));
  aircraftTypes = Array.from(distinctAircraftTypes).sort();
  signalTypes = Array.from(distinctSignalTypes).sort();
}

function calculateFeederScores(feederlist) {
  feederlist.forEach((feeder) => {
    feeder.score = getFeederScore(feeder);
  });

  feederlist.sort((a, b) => b.score - a.score);

  feederlist.forEach((feeder, index) => {
    feeder.rank = index + 1;

    // refactor this to an idempotent function 
    if (filterState._filterContext && filterState._filterContext.foundFeeder) {
      let foundFeeder = filterState._filterContext.foundFeeder;
      if (foundFeeder.uuid === feeder.uuid) {
        foundFeeder.rank = feeder.rank;
      }
      filterState._filterContext.foundFeeder = foundFeeder;
    }
  });
}

function getFeederScore(feeder) {
  let score = 0;
  score += getUptimeScore(feeder);
  score += getAvgRangeScore(feeder);
  score += getMaxRangeScore(feeder);
  score += getPositionScore(feeder);
  score += getAircraftOnGroundScore(feeder);
  score += getTotalAircraftScore(feeder);
  score += getUniqueAircraftScore(feeder);
  score += getNearestAirportScore(feeder);
  score += getUniquenessScore(feeder);
  return (score * 10000).toFixed(0);
}

function populateFeederPercentile(feeder) {
  let feederPercentile = ((activeGridCount - feeder.rank) / activeGridCount * 100).toFixed(2);
  $("#feeder-percentile").text(feederPercentile);
}

function getUptimeScore(feeder) {
  return +(feeder.uptime / maxUptime * 100).toFixed(2);
}

function getAvgRangeScore(feeder) {
  return +(feeder.avg_range / maxAvgRange * 100).toFixed(2);
}

function getMaxRangeScore(feeder) {
  return +(feeder.max_range / maxRange * 100).toFixed(2);
}

function getPositionScore(feeder) {
  return +(feeder.position / maxPosition * 100).toFixed(2);
}

function getAircraftOnGroundScore(feeder) {
  return +(feeder.aircraft_on_ground / maxAircraftOnGround * 100).toFixed(2);
}

function getTotalAircraftScore(feeder) {
  return +(feeder.total_aircraft / maxTotalAircraft * 100).toFixed(2);
}

function getUniqueAircraftScore(feeder) {
  return +(feeder.unique_aircraft / maxUniqueAircraft * 100).toFixed(2);
}

function getNearestAirportScore(feeder) {
  return +(feeder.nearest_airport / maxNearestAirport * 100).toFixed(2);
}

function getUniquenessScore(feeder) {
  return +(feeder.uniqueness / maxUniqueness * 100).toFixed(2);
}

function renderFeederSection() {
  if (filterState._filterContext && filterState._filterContext.foundFeeder) {
    let feeder = filterState._filterContext.foundFeeder;
    $("#search-grid").show();
    populateFeederPercentile(feeder);
    generateSearchSummaryText(feeder.feeder_name);
    renderFilterSection(feeder);
    refreshGrid();
  } else {
    $("#search-grid").hide();
  }
}

function renderFilterSection(feeder) {
  let hardwareChart = $("#hardware-chart").data("kendoChart");
  hardwareChart.options.series = [
    {
      name: "Maximum Range",
      data: [
        {
          category: "Feeder Percentile",
          value: getMaxRangeScore(feeder),
          color: "#1E395C"
        }, {
          category: "Remaining Percentile",
          value: (100 - getMaxRangeScore(feeder)).toFixed(2),
          color: "#C1D3EB"
        }
      ],
      labels: {
        visible: false
      }
    },
    {
      name: "Average Range",
      data: [
        {
          category: "Feeder Percentile",
          value: getAvgRangeScore(feeder),
          color: "#066674"
        }, {
          category: "Remaining Percentile",
          value: (100 - getAvgRangeScore(feeder)).toFixed(2),
          color: "#C5F5FC"
        }
      ],
      labels: {
        visible: false,
      }
    },
    {
      name: "Uptime",
      data: [
        {
          category: "Uptime",
          value: getUptimeScore(feeder),
          color: "#660058"
        },
        {
          category: "Downtime",
          value: (100 - getUptimeScore(feeder)).toFixed(2),
          color: "#FFADF4"
        }
      ]
    }];
  hardwareChart.refresh();
  let activityChart = $("#activity-chart").data("kendoChart");
  activityChart.options.series = [
    {
      name: "Position",
      data: [
        {
          category: "Feeder Percentile",
          value: getPositionScore(feeder),
          color: "#1E395C"
        },
        {
          category: "Remaining Percentage",
          value: (100 - getPositionScore(feeder)).toFixed(2),
          color: "#C1D3EB"
        }
      ]
    },
    {
      name: "Aircraft on Ground",
      data: [
        {
          category: "Feeder Percentile",
          value: getAircraftOnGroundScore(feeder),
          color: "#066674"
        },
        {
          category: "Remaining Percentile",
          value: (100 - getAircraftOnGroundScore(feeder)).toFixed(2),
          color: "#C5F5FC"
        }
      ],
      labels: {
        visible: false,
      }
    },
    {
      name: "Total Aircraft",
      data: [
        {
          category: "Feeder Percentile",
          value: getTotalAircraftScore(feeder),
          color: "#660058"
        }, {
          category: "Other Percentile",
          value: (100 - getTotalAircraftScore(feeder)).toFixed(2),
          color: "#FFADF4"
        }
      ],
      labels: {
        visible: false
      }
    }
  ]
  activityChart.refresh();
  let exchangeChart = $("#exchange-chart").data("kendoChart")
  exchangeChart.options.series = [
    {
      name: "Unique Aircraft",
      data: [
        {
          category: "Feeder Percentile",
          value: getUniqueAircraftScore(feeder),
          color: "#1E395C"
        },
        {
          category: "Remaining Percentile",
          value: (100 - getUniqueAircraftScore(feeder)).toFixed(2),
          color: "#C1D3EB"
        }
      ]
    },
    {
      name: "Nearest Airport",
      data: [
        {
          category: "Feeder Percentile",
          value: getNearestAirportScore(feeder),
          color: "#066674"
        },
        {
          category: "Remaining Percentile",
          value: (100 - getNearestAirportScore(feeder)).toFixed(2),
          color: "#C5F5FC"
        }
      ],
      labels: {
        visible: false,
      }
    },
    {
      name: "Unique Range",
      data: [
        {
          category: "Feeder Percentile",
          value: getUniquenessScore(feeder),
          color: "#660058"
        }, {
          category: "Remaining Percentile",
          value: (100 - getUniquenessScore(feeder)).toFixed(2),
          color: "#FFADF4"
        }
      ],
      labels: {
        visible: false
      }
    }];
  exchangeChart.refresh();
  $("#rank-chart").data("kendoChart").refresh();
}

function refreshGrid() {
  $("#feeder-grid").data("kendoGrid").refresh();
}

function generateSearchSummaryText(feeder_name) {
  $("#selected-feeder").text(`"${feeder_name}"`);

  let region = $("#regionselect").val();
  let country = $("#countryselect").val();
  let city = $("#municipalityselect").val();
  let filter_text = 'with filters '
  let locationPrefix = 'Country: ';


  // if (region && !region.startsWith('Select')) {
  //   locationPrefix += `${region}`;
  // }
  // if (country && !country.startsWith('Select')) {
  //   locationPrefix += `, ${country}`;
  // }
  // if (city && !city.startsWith('Select')) {
  //   locationPrefix += `, ${city}`;
  // }
}

function populateCustomHeader(e) {
  let grid = $("#feeder-grid").data("kendoGrid");

  let items = grid.items();
  grid.element.height(grid.options.height);

  if (filterState._filterContext && filterState._filterContext.foundFeeder) {
    let feeder = filterState._filterContext.foundFeeder;
    let pageSize = grid.dataSource.pageSize();
    let pageNo = feeder.rank / pageSize;
    // console.log(pageNo);
    if (pageNo > grid.options.pageable.page) {
      grid.setOptions({
        page: pageNo
      });
      // grid.dataSource.page(pageNo);
    }

    items.each(function () {
      var row = $(this);
      var dataItem = grid.dataItem(row);

      if (dataItem.feeder_name === feeder.feeder_name) {
        let customHeader = grid.element.find(".custom-header-row");
        if (customHeader) {
          customHeader.remove();
        } else {
          grid.element.height(grid.element.height() + row.height());
        }

        var item = row.clone();
        item.addClass("custom-header-row");
        var thead = grid.element.find(".k-grid-header table thead");
        thead.append(item);
      }
    })
  } else {
    let customHeader = grid.element.find(".custom-header-row");
    if (customHeader) {
      customHeader.remove();
    }
  }
}