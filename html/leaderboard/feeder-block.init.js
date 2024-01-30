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
let filterState = null;
let userPosition = null;
let hardwareCenter, hardwareRadius, activityCenter, activityRadius, exchangeCenter, exchangeRadius;
let hardwareAvg, activityAvg, exchangeAvg;

setupLoader();
resetFilterState();
initializeFeederGrid();
initializeFeederSearchInput();
initializeFeederChart();
renderboard();
fetchboardData();

function fetchboardData() {
  setLoaderViewState(true);
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
      populateBoardStats(response.data.network_stats);
      setLoaderViewState(false);
      handleGeolocationPermission();
    },
    error: function (error) {
      console.error('Error fetching feeder data:', error);
      $("#notification-section").getKendoNotification().show({ msg: `Error fetching feeder data` }, "error");
    }
  });
}

function handleGeolocationPermission() {
  navigator.permissions.query({ name: 'geolocation' }).then(function (result) {
    if (result.state == 'granted') {
      setUserLocation(result);
    } else if (result.state == 'prompt') {
      setUserLocation(result);
    } else if (result.state == 'denied') {
      console.log('Location Permission denied');
    }

    result.onchange = function () {
      setUserLocation(result);
    }
  });
}

function setUserLocation(result) {
  navigator.geolocation.getCurrentPosition(function (position) {
    userPosition = { userLat: position.coords.latitude, userLong: position.coords.longitude };
    $("#distanceselect").data("kendoDropDownList").enable(userPosition);
  });
}

function setupLoader() {
  $('#loader').kendoLoader({
    size: "large",
    type: 'converging-spinner'
  });
}

function setLoaderViewState(isLoading) {
  const loader = $('#loader');
  const loadingContainer = $('.loadingContainer');

  if (isLoading) {
    loader.show();
    loadingContainer.show();
  } else {
    loader.hide();
    loadingContainer.hide();
  }
}

function initializeFeederSearchInput() {
  let feederSearchInput = $('#feeder-search-input');
  feederSearchInput.kendoAutoComplete({
    clearButton: true,
    placeholder: "Search Feeder Names",
    filter: "contains",
    change: onFilterChange
  });
  feederSearchInput.on('keyup', function (event) {
    if (event.key === 'Enter') {
      onFilterChange();
    }
  });

  let button = $('.search-button');
  button.on('click', onFilterChange);
}

function initializeFeederGrid() {
  $("#feeder-grid").kendoGrid({
    columns: [
      { field: "rank", title: "Rank", width: 80 },
      { field: "feeder_name", title: "Feeder Name" },
      { field: "country", title: "Country" },
      { field: "score", title: "Score", width: 140, format: "{0:##,#}" },
      { field: "uptime", title: "Uptime", width: 90, format: "{0}\%" },
      { field: "avg_range", title: "Avg Coverage (SNM)", format: "{0:##,#}" },
      { field: "max_range", title: "Max Range (NM)", format: "{0:##,#}" },
      { field: "position", title: "Positions", format: "{0:##,#}" },
      { field: "aircraft_on_ground", title: "Aircraft on Ground", format: "{0:##,#}" },
      { field: "total_aircraft", title: "Total Aircraft", format: "{0:##,#}" },
      { field: "unique_aircraft", title: "Unique Aircraft", format: "{0:##,#}" },
      { field: "nearest_airport", title: "Nearest Airport (NM)", format: "{0:##,#}" },
      { field: "uniqueness", title: "Uniqueness", width: 100, format: "{0:n2}" }
    ],
    sortable: true,
    selectable: "row",
    scrollable: {
      virtual: true
    }
  });

  $("#feeder-grid").kendoTooltip({
    filter: "th",
    position: "right",
    width: 250,
    content: function (e) {
      return fetchHeaderTooltipContent(e.target.text());
    }
  }).data("kendoTooltip");

  $("#feeder-grid tbody").on("click", "tr", function (e) {
    let row = $(this);
    let grid = $("#feeder-grid").getKendoGrid();

    if (row.hasClass("k-selected")) {
      row.removeClass("k-selected");
      e.stopPropagation();
    } else {
      let dataItem = grid.dataItem(row);
      let searchInput = $("#feeder-search-input").data("kendoAutoComplete");
      searchInput.value(dataItem.feeder_name);
      onFilterChange();
    }
  });
  $("#notification").kendoNotification();
  $("#notification-section").kendoNotification({
    autoHideAfter: 0,
    width: 300,
    height: 50,
    stacking: "down",
    position: {
      pinned: true,
      top: 30,
      right: 30
    },
    templates: [{
      // define a custom template for the built-in "warning" notification type
      type: "warning",
      template: "<div class='myWarning'>#= myMessage #</div>"
    }, {
      // define a template for the custom "timeAlert" notification type
      type: "error",
      template: $("#ajax-error-template").html()
    }]
  });
}

function fetchHeaderTooltipContent(headerName) {
  switch (headerName) {
    case "Rank":
      return "The ultimate ranking of each feeder based on the Score";
    case "Feeder Name":
      return "The name of the feeder, as defined within each receiver's configuration dashboard";
    case "Country":
      return "The location of the receiver, as determined by the latitude and longitude entered in the receiver's configuration dashboard.";
    case "Score":
      return "The sum of all 9 ring percentages * 1000. The rings are based on uptime, average range, max range, positions, aircraft on ground, total aircraft, unique aircraft, nearest airport, and uniqueness data collected from each receiver.";
    case "Uptime":
      return "The percent of time the receiver is able to receive transmissions";
    case "Avg Coverage (SNM)":
      return "The average square nautical mile coverage of the receiver.";
    case "Max Range (NM)":
      return "The greatest nautical mile distance from the receiver that an ADS-B signal has been observed.";
    case "Positions":
      return "The total number of positions received by a receiver.";
    case "Aircraft on Ground":
      return "The number of aircraft on the ground a receiver observed.";
    case "Total Aircraft":
      return "The total aircraft a receiver observed. This includes aircraft that may also be observed by other receivers simultaneously.";
    case "Unique Aircraft":
      return "The total unique aircraft a receiver observed. i.e. when a receiver captures the position of an aircraft that no other receiver observed.";
    case "Nearest Airport (NM)":
      return "The GCD between the receiver and the nearest airport."
    case "Uniqueness":
      return "The number of receivers in your 100NM range relative to others."
    default:
      return headerName;
  }
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
    distance: 0
  };
}

function renderboard() {
  let feeders = generateFeederGridData(applyFilter());
  calculateBoardMaxValues(feeders);
  calculateFeederScoreRanks(feeders);
  setGridDataSources(feeders);
  renderFeederSection();
  populateCustomHeader();
}

function applyFilter() {
  let filteredData = boardData;
  filterState._filterContext = null;
  filteredData = filterByRegion(filteredData, filterState);
  filteredData = filterByCountry(filteredData, filterState);
  filteredData = filterByMunicipality(filteredData, filterState);
  filteredData = filterByAircraftType(filteredData, filterState);
  filteredData = filterBySignalType(filteredData, filterState);
  filteredData = filterByDistance(filteredData, filterState);
  filteredData = filterbyFeederName(filteredData, filterState);

  return filteredData;
}

function filterbyFeederName(data, filterState) {
  if (filterState.feeder_name) {
    let searchedFeeder = data.find(feeder => feeder.user.toLowerCase() === filterState.feeder_name.toLowerCase());
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

function isWithinDistance(lat, lon, distance) {
  const earthRadius = 3440; // Radius of the Earth in nautical miles

  // Convert latitude and longitude to radians
  const lat1 = (Math.PI / 180) * lat;
  const lon1 = (Math.PI / 180) * lon;
  const lat2 = (Math.PI / 180) * userLat;
  const lon2 = (Math.PI / 180) * userLong;

  // Calculate the distance between the two positions using the Haversine formula
  const dLat = lat2 - lat1;
  const dLon = lon2 - lon1;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distanceBetweenPositions = earthRadius * c;

  return distanceBetweenPositions <= distance;
}

function transformFeeder(feeder) {
  const filterPositionStats = shouldFilterPositionStats();
  const feederUptime = feeder.uptime >= 100 ? 100 : feeder.uptime;
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
    uniqueness: feeder.uniqueness
  };
}

function shouldFilterPositionStats() {
  return filterState.make_type_name.length > 0 || filterState.signal_type.length > 0;
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

function setGridDataSources(feederlist) {
  let dataSource = new kendo.data.DataSource({
    data: feederlist,
    pageSize: 12,
    schema: {
      model: {
        id: "uuid",
        fields: {
          uuid: { type: "string" },
          rank: { type: "number" },
          feeder_name: { type: "string" },
          country: { type: "string" },
          score: { type: "number" },
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

  let searchInput = $("#feeder-search-input").data("kendoAutoComplete");
  searchInput.setDataSource(new kendo.data.DataSource({
    data: feederlist.map(feeder => feeder.feeder_name)
  }));
  searchInput.refresh();
}

function renderFilter() {
  let regionDataSource = new kendo.data.DataSource({
    data: regions
  });
  let countriesDataSource = new kendo.data.DataSource({
    data: countries
  });
  let citiesDataSource = new kendo.data.DataSource({
    data: cities,
    group: { field: "state" }
  });
  $("#regionselect").kendoMultiSelect({
    placeholder: "Region",
    rounded: "medium",
    autoBind: false,
    autoClose: false,
    dataSource: regionDataSource,
    dataTextField: "region",
    dataValueField: "region",
    tagMode: "single",
    tagTemplate: kendo.template($("#tagTemplate").html()),
    change: function () {
      toggleFilterState();
      let filters = buildFilters(this.dataItems(), "region");
      countriesDataSource.filter(filters);
      onFilterChange();
    }
  });

  $("#countryselect").kendoMultiSelect({
    placeholder: "Country",
    rounded: "medium",
    autoBind: false,
    autoClose: false,
    dataSource: countriesDataSource,
    dataValueField: "country",
    dataTextField: "country",
    tagMode: "single",
    tagTemplate: kendo.template($("#tagTemplate").html()),
    enable: false,
    change: function () {
      toggleFilterState();
      let filters = buildFilters(this.dataItems(), "country");
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
    autoClose: false,
    dataSource: citiesDataSource,
    enable: false,
    tagMode: "single",
    tagTemplate: kendo.template($("#tagTemplate").html()),
  });

  $("#aircraftselect").kendoMultiSelect({
    placeholder: "Aircraft Type",
    rounded: "medium",
    autoBind: false,
    autoClose: false,
    dataSource: aircraftTypes,
    tagMode: "single",
    tagTemplate: kendo.template($("#tagTemplate").html()),
  });

  $("#modeselect").kendoMultiSelect({
    placeholder: "Signal",
    rounded: "medium",
    autoBind: false,
    autoClose: false,
    dataSource: signalTypes,
    tagMode: "single",
    tagTemplate: kendo.template($("#tagTemplate").html()),
  });
  $("#distanceselect").kendoDropDownList({
    optionLabel: "Distance",
    adaptiveMode: "auto",
    autoBind: false,
    fillMode: "outline",
    dataTextField: "data",
    dataValueField: "value",
    enable: false,
    dataSource: [
      { data: 10, value: 10 },
      { data: 50, value: 50 },
      { data: 100, value: 100 },
      { data: 200, value: 200 },
      { data: 500, value: 500 },
      { data: 1000, value: 1000 },
      { data: "All", value: -1 }
    ]
  });

  $("#distance-select-w").kendoTooltip({
    filter: "span.k-disabled",
    position: "right",
    content: function (e) {
      return "Grant location permission to enable this filter";
    }
  }).data("kendoTooltip");

  $("#municipalityselect").data("kendoMultiSelect").bind("change", onFilterChange);
  $("#aircraftselect").data("kendoMultiSelect").bind("change", onFilterChange);
  $("#modeselect").data("kendoMultiSelect").bind("change", onFilterChange);
  $("#distanceselect").data("kendoDropDownList").bind("change", onFilterChange);
}

function toggleFilterState() {
  let region = $("#regionselect").val();
  let country = $("#countryselect").val();

  $("#countryselect").data("kendoMultiSelect").enable(region.length > 0);
  $("#municipalityselect").data("kendoMultiSelect").enable(country.length > 0);
  $(".k-list-scroller").delegate(".k-list-item-group-label", "click", multiSelectGroupClick);
}

function multiSelectGroupClick() {
  var ms = $("#municipalityselect").data("kendoMultiSelect");
  var data = ms.dataSource.data();
  var msValue = [];

  for (var i = 0; i < data.length; i++) {
    if (data[i].state == this.textContent) {
      msValue.push(data[i].city);
    }
  }

  ms.value(msValue);
}

function buildFilters(dataItems, selector) {
  let filters = [],
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
  let distance = $("#distanceselect").val();
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

  if (distance > 0) {
    filterState.distance = distance;
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
      holeSize: 30,
      startAngle: 90,
      overlay: {
        gradient: "none"
      },
      donut: {
        margin: 5
      },
      visual: function (e) {
        hardwareCenter = e.center;
        hardwareRadius = e.radius;

        return e.createVisual();
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
    series: [],
    tooltip: {
      visible: true,
      template: kendo.template($("#chartTemplate").html())
    },
    render: function (e) {
      let draw = kendo.drawing;
      let geom = kendo.geometry;

      let circleGeometry = new geom.Circle(hardwareCenter, hardwareRadius);
      let bbox = circleGeometry.bbox();

      let text = new draw.Text(`${hardwareAvg}%`, [0, 0], {
        font: "18px Verdana,Arial,sans-serif"
      });

      draw.align([text], bbox, "center");
      draw.vAlign([text], bbox, "center");

      e.sender.surface.draw(text);
    }
  });

  $("#activity-chart").kendoChart({
    seriesDefaults: {
      type: "donut",
      holeSize: 30,
      margin: 2,
      startAngle: 90,
      overlay: {
        gradient: "none"
      },
      donut: {
        margin: 5
      },
      visual: function (e) {
        activityCenter = e.center;
        activityRadius = e.radius;

        return e.createVisual();
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
    series: [],
    tooltip: {
      visible: true,
      template: kendo.template($("#chartTemplate").html())
    },
    render: function (e) {
      let draw = kendo.drawing;
      let geom = kendo.geometry;

      let circleGeometry = new geom.Circle(activityCenter, activityRadius);
      let bbox = circleGeometry.bbox();

      let text = new draw.Text(`${activityAvg}%`, [0, 0], {
        font: "18px Verdana,Arial,sans-serif"
      });

      draw.align([text], bbox, "center");
      draw.vAlign([text], bbox, "center");

      e.sender.surface.draw(text);
    }
  });

  $("#exchange-chart").kendoChart({
    seriesDefaults: {
      type: "donut",
      holeSize: 30,
      margin: 2,
      startAngle: 90,
      overlay: {
        gradient: "none"
      },
      donut: {
        margin: 5
      },
      visual: function (e) {
        exchangeCenter = e.center;
        exchangeRadius = e.radius;

        return e.createVisual();
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
    series: [],
    tooltip: {
      visible: true,
      template: kendo.template($("#chartTemplate").html())
    },
    render: function (e) {
      let draw = kendo.drawing;
      let geom = kendo.geometry;

      let circleGeometry = new geom.Circle(exchangeCenter, exchangeRadius);
      let bbox = circleGeometry.bbox();

      let text = new draw.Text(`${exchangeAvg}%`, [0, 0], {
        font: "18px Verdana,Arial,sans-serif"
      });

      draw.align([text], bbox, "center");
      draw.vAlign([text], bbox, "center");

      e.sender.surface.draw(text);
    }
  });

  $("#rank-chart").kendoChart({
    title: {
      visible: false,
      text: "Feeder Rank Trend"
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
      },
      color: "#28cf8a"
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

function populateBoardStats(feederStats) {
  $("#feeder-count").text(formatNumber(feederStats.feeders_total));
  $("#feeders-added").text(formatNumber(feederStats.feeders_added_last_30_days));
  $("#monthly-positions").text(transformNumber(feederStats.positions_last_30_days, 1));
  $("#countries-count").text(transformNumber(feederStats.countries_total, 1));
  $("#daily-positions").text(transformNumber(feederStats.positions_captured_24h, 1));
  $("#aircraft-count").text(transformNumber(feederStats.aircrafts_seen_24h, 1));
}

function calculateBoardMaxValues(feederlist) {
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
      distinctCities.add({ city: feeder.city, region: feeder.region, country: feeder.country, state: feeder.state });
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
    const existingCity = acc.find(city => city.city === curr.city && city.region === curr.region && city.country === curr.country && city.state === curr.state);
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

function calculateFeederScoreRanks(feederlist) {
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
  return (score * 100).toFixed(0);
}

function populateFeederPercentile(feeder) {
  const recordCount = $("#feeder-grid")
    .data("kendoGrid")
    .dataSource
    .data().length;

  const feederPercentile = ((recordCount - feeder.rank) / (recordCount - 1) * 100).toFixed(2);
  $("#feeder-percentile").text(`${feederPercentile}%`);
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
    renderFeederImpactCharts(feeder);
    refreshGrid();
  } else {
    $("#search-grid").hide();
  }
}

function renderFeederImpactCharts(feeder) {
  let hardwareChart = $("#hardware-chart").data("kendoChart");
  hardwareChart.options.series = [
    {
      name: "Maximum Range",
      data: [
        {
          category: "Feeder Percentile",
          value: getMaxRangeScore(feeder),
          color: "#00596a"
        }, {
          category: "disabled",
          value: (100 - getMaxRangeScore(feeder)).toFixed(2),
          color: "#b3f2ff"
        }
      ],
      labels: {
        visible: false
      }
    },
    {
      name: "Average Coverage",
      data: [
        {
          category: "Feeder Percentile",
          value: getAvgRangeScore(feeder),
          color: "#61bac9"
        }, {
          category: "disabled",
          value: (100 - getAvgRangeScore(feeder)).toFixed(2),
          color: "#ecf7f8"
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
          color: "#9d1edd"
        },
        {
          category: "disabled",
          value: (100 - getUptimeScore(feeder)).toFixed(2),
          color: "#ecd2f9"
        }
      ]
    }];
  hardwareAvg = Math.ceil((getMaxRangeScore(feeder) + getAvgRangeScore(feeder) + getUptimeScore(feeder)) / 3);
  hardwareChart.refresh();
  let activityChart = $("#activity-chart").data("kendoChart");
  activityChart.options.series = [
    {
      name: "Position",
      data: [
        {
          category: "Feeder Percentile",
          value: getPositionScore(feeder),
          color: "#00596a"
        },
        {
          category: "disabled",
          value: (100 - getPositionScore(feeder)).toFixed(2),
          color: "#b3f2ff"
        }
      ]
    },
    {
      name: "Aircraft on Ground",
      data: [
        {
          category: "Feeder Percentile",
          value: getAircraftOnGroundScore(feeder),
          color: "#61bac9"
        },
        {
          category: "disabled",
          value: (100 - getAircraftOnGroundScore(feeder)).toFixed(2),
          color: "#ecf7f8"
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
          color: "#9d1edd"
        }, {
          category: "disabled",
          value: (100 - getTotalAircraftScore(feeder)).toFixed(2),
          color: "#ecd2f9"
        }
      ],
      labels: {
        visible: false
      }
    }
  ]
  activityAvg = Math.ceil((getPositionScore(feeder) + getAircraftOnGroundScore(feeder) + getTotalAircraftScore(feeder)) / 3);
  activityChart.refresh();
  let exchangeChart = $("#exchange-chart").data("kendoChart")
  exchangeChart.options.series = [
    {
      name: "Unique Aircraft",
      data: [
        {
          category: "Feeder Percentile",
          value: getUniqueAircraftScore(feeder),
          color: "#00596a"
        },
        {
          category: "disabled",
          value: (100 - getUniqueAircraftScore(feeder)).toFixed(2),
          color: "#b3f2ff"
        }
      ]
    },
    {
      name: "Nearest Airport",
      data: [
        {
          category: "Feeder Percentile",
          value: getNearestAirportScore(feeder),
          color: "#61bac9"
        },
        {
          category: "disabled",
          value: (100 - getNearestAirportScore(feeder)).toFixed(2),
          color: "#ecf7f8"
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
          color: "#9d1edd"
        }, {
          category: "disabled",
          value: (100 - getUniquenessScore(feeder)).toFixed(2),
          color: "#ecd2f9"
        }
      ],
      labels: {
        visible: false
      }
    }];
  exchangeAvg = Math.ceil((getUniqueAircraftScore(feeder) + getNearestAirportScore(feeder) + getUniquenessScore(feeder)) / 3);
  exchangeChart.refresh();
  $("#rank-chart").data("kendoChart").refresh();
}

function refreshGrid() {
  $("#feeder-grid").data("kendoGrid").refresh();
}

function generateSearchSummaryText(feeder_name) {
  $("#selected-feeder").text(`"${feeder_name}"`);

  let filter_text = '';

  if (filterState.region && filterState.region.length > 0) {
    filter_text += `Region: ${filterState.region.join(', ')}, `;
  }
  if (filterState.country && filterState.country.length > 0) {
    filter_text += `Country: ${filterState.country.join(', ')}, `;
  }
  if (filterState.city && filterState.city.length > 0) {
    filter_text += `City: ${filterState.city.join(', ')}, `;
  }
  if (filterState.signalType && filterState.signalType.length > 0) {
    filter_text += `Signal type: ${filterState.signalType.join(', ')}, `;
  }
  if (filterState.aircraftType && filterState.aircraftType.length > 0) {
    filter_text += `Aircraft type: ${filterState.aircraftType.join(', ')}, `;
  }

  // Remove the trailing comma and space
  filter_text = filter_text.slice(0, -2);

  const lastCommaIndex = filter_text.lastIndexOf(',');
  if (lastCommaIndex !== -1) {
    filter_text = filter_text.slice(0, lastCommaIndex) + ' and' + filter_text.slice(lastCommaIndex + 1);
  }

  if (filter_text !== '') {
    $("#filter-summary-pretext").show();
    $("#filter-summary-text").text(filter_text);
  } else {
    $("#filter-summary-pretext").hide();
  }
}

function populateCustomHeader() {
  let grid = $("#feeder-grid").data("kendoGrid");

  grid.element.height(grid.options.height);

  if (filterState._filterContext && filterState._filterContext.foundFeeder) {
    let feeder = filterState._filterContext.foundFeeder;
    let pageSize = grid.dataSource.pageSize();
    let pageNo = Math.ceil(feeder.rank / pageSize);
    grid.dataSource.page(pageNo);

    let items = grid.items();
    items.each(function () {
      let row = $(this);
      let dataItem = grid.dataItem(row);

      if (dataItem.feeder_name === feeder.feeder_name) {
        let customHeader = grid.element.find(".custom-header-row");
        if (customHeader) {
          customHeader.remove();
        } else {
          grid.element.height(grid.element.height() + row.height());
        }

        let item = row.clone();
        item.addClass("custom-header-row");
        let thead = grid.element.find(".k-grid-header table thead");
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

function generateChartTooltip(seriesName, category, value) {
  let pretext = '';
  if (category != 'disabled') {
    pretext += `(${seriesName}) ${category}: ${value}% </br>`;
  }
  if (seriesName === 'Uptime') {
    return pretext += "The percentage of time the feeder is active and able to receive transmissions. </br>To improve, you will want to make sure you're plugged in to a stable power source, connect to a reliable internet service, and use hardwired connections between your hardware and source of internet.";
  } else if (seriesName === 'Maximum Range') {
    return pretext += 'The further the coverage distance of a receiver, the more likely it is to receive ADS-B transmissions. </br>To improve, you want to have your receiver hardwired and place the antenna as high as possible outside in an area with no obstructions.';
  } else if (seriesName === 'Average Coverage') {
    return pretext += 'The larger the coverage area of a receiver, the more likely it is to receive ADS - B transmissions. </br>To improve, you want to have your receiver hardwired and place the antenna as high as possible outside in an area with no obstructions.';
  } else if (seriesName === 'Position') {
    return pretext += 'The more positions a feeder receives, the more valuable it is to the Exchange.';
  } else if (seriesName === 'Aircraft on Ground') {
    return pretext += 'Ground activity is a vital signal to the Exchange. </br>To improve, you want to place your receiver as close to an airport runway as possible and / or minimize obstructions between the antenna and the airport.';
  } else if (seriesName === 'Total Aircraft') {
    return pretext += 'The more aircraft a feeder receives, the more valuable it is to the Exchange.';
  } else if (seriesName === 'Unique Aircraft') {
    return pretext += 'The more unique aircraft a feeder receives, the more valuable it is to the Exchange. </br>This is the most valuable of all signals that contribute to the Exchange.';
  } else if (seriesName === 'Nearest Airport') {
    return pretext += 'Receivers that at close to airports are particularly valuable to the Exchange. </br>To improve, you want to place your receiver as close to an airport runway as possible.';
  } else if (seriesName === 'Unique Range') {
    return pretext += "A feeder's value to the ADS - B Exchange network based on receiver's placement relative to other receivers. </br>To improve, you want to find a location for your receiver that is not already covered by other receivers.";
  } else {
    return pretext;
  }
}