let maxUniqueness = 0;
let maxUptime = 0;
let maxPosition = 0;
let maxTotalAircraft = 0;
let maxUniqueAircraft = 0;
let maxRange = 0;
let maxAvgRange = 0;
let maxNearestAirport = 0;
let maxAircraftOnGround = 0;

let filterState = null;
let userPosition = null;
let hardwareCenter, hardwareRadius, activityCenter, activityRadius, exchangeCenter, exchangeRadius;
let hardwareAvg, activityAvg, exchangeAvg;
let lastChartSeriesColour = "none";

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
      handleDataResponse(response);
    },
    error: function (error) {
      console.error('Error fetching feeder data:');
      $("#notification-section").getKendoNotification().show({ msg: `Error fetching feeder data` }, "error");
    }
  });
}

function showDefaultFeederStats() {
  const topRankedFeeder = $("#feeder-grid")
    .data("kendoGrid")
    .dataSource
    .at(0);
  let searchInput = $("#feeder-search-input").data("kendoAutoComplete");
  searchInput.value(topRankedFeeder.feeder_name);
  onFilterChange();
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
  const feederSearchInput = $('#feeder-search-input');
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

  const button = $('.search-button');
  button.on('click', onFilterChange);
}

function initializeFeederGrid() {
  $("#feeder-grid").kendoGrid({
    columns: [
      { field: "rank", title: "Rank", width: 80, attributes: { "data-field": "rank" } },
      { field: "feeder_name", title: "Feeder Name", attributes: { "data-field": "feeder_name", style: "overflow-wrap: break-word;" } },
      { field: "country", title: "Country", attributes: { "data-field": "country" } },
      { field: "score", title: "Score", width: 80, format: "{0:##,#}", attributes: { "data-field": "score" } },
      {
        title: "Hardware",
        columns: [
          { field: "uptime", title: "Uptime", width: 80, format: "{0}\%", attributes: { "data-field": "uptime" } },
          { field: "avg_range", title: "Avg Coverage (SNM)", format: "{0:##,#}", attributes: { "data-field": "avg_range" } },
          { field: "max_range", title: "Max Range (NM)", format: "{0:##,#}", attributes: { "data-field": "max_range" } },
        ]
      }, {
        title: "Activity",
        columns: [
          { field: "position", title: "Positions", format: "{0:##,#}", attributes: { "data-field": "position" } },
          { field: "aircraft_on_ground", title: "Aircraft on Ground", format: "{0:##,#}", attributes: { "data-field": "aircraft_on_ground" } },
          { field: "total_aircraft", title: "Total Aircraft", format: "{0:##,#}", attributes: { "data-field": "total_aircraft" } },
        ]
      }, {
        title: "Exchange",
        columns: [
          { field: "unique_aircraft", title: "Unique Aircraft", format: "{0:##,#}", attributes: { "data-field": "unique_aircraft" } },
          { field: "nearest_airport", title: "Nearest Airport (NM)", format: "{0:##,#}", attributes: { "data-field": "nearest_airport" } },
          { field: "uniqueness_pct", title: "Uniqueness", width: 110, format: "{0}\%", attributes: { "data-field": "uniqueness" } }
        ]
      }
    ],
    sortable: {
      allowUnsort: false
    },
    selectable: "row",
    scrollable: {
      virtual: true
    },
    height: 450,
    pageable: {
      numeric: false,
      previousNext: false,
      messages: {
        display: "Showing {0}-{1} of {2} feeders"
      }
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

function isWithinDistance(lat, lon, distance) {
  const earthRadius = 3440; // Radius of the Earth in nautical miles

  // Convert latitude and longitude to radians
  const lat1 = (Math.PI / 180) * lat;
  const lon1 = (Math.PI / 180) * lon;
  const lat2 = (Math.PI / 180) * userPosition.userLat;
  const lon2 = (Math.PI / 180) * userPosition.userLong;

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

function shouldFilterPositionStats() {
  return filterState.make_type_name.length > 0 || filterState.signal_type.length > 0;
}

function generateFeederGridData(feederlist) {
  return feederlist.map((feeder) => transformFeeder(feeder));
}

function setGridDataSources(feederlist) {
  const dataSource = new kendo.data.DataSource({
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
    // height: 50,
    sort: {
      field: "score",
      dir: "desc"
    }
  });
  const grid = $("#feeder-grid").data("kendoGrid");
  grid.setDataSource(dataSource);
  grid.refresh();

  const searchInput = $("#feeder-search-input").data("kendoAutoComplete");
  if (!searchInput.value()) {
    searchInput.setDataSource(new kendo.data.DataSource({
      data: feederlist.map(feeder => feeder.feeder_name)
    }));
    searchInput.refresh();
  }
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
    optionLabel: "Distance from You (NM)",
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
      return `<span>Grant location permission to enable this filter.
        <a target="_blank" href="https://www.google.com/search?q=allow+browser+to+access+location"> Show me how.</a>
      </span>`;
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
      highlight: {
        border: {
          opacity: 0
        },
        opacity: 0
      },
      overlay: {
        gradient: "none"
      },
      donut: {
        margin: 5
      },
      visual: function (e) {
        hardwareCenter = e.center;
        hardwareRadius = e.radius;

        return Pie_CurvedEnds(e);
      }
    },
    chartArea: {
      background: "",
      height: 250
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
      template: kendo.template($("#chartTemplate").html()),
      padding: 15
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
      highlight: {
        border: {
          opacity: 0
        },
        opacity: 0
      },
      overlay: {
        gradient: "none"
      },
      donut: {
        margin: 5
      },
      visual: function (e) {
        activityCenter = e.center;
        activityRadius = e.radius;

        return Pie_CurvedEnds(e);
      }
    },
    chartArea: {
      background: "",
      height: 250
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
      highlight: {
        border: {
          opacity: 0
        },
        opacity: 0
      },
      overlay: {
        gradient: "none"
      },
      donut: {
        margin: 5
      },
      visual: function (e) {
        exchangeCenter = e.center;
        exchangeRadius = e.radius;

        return Pie_CurvedEnds(e);
      }
    },
    chartArea: {
      background: "",
      height: 250
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
    maxUniqueness = Math.max(maxUniqueness, feeder.uniqueness_pct);
  });
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
    .total();

  const feederPercentile = parseFloat(((recordCount - feeder.rank) / (recordCount - 1) * 100).toFixed(2));
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
  return +((1 - (feeder.nearest_airport / maxNearestAirport)) * 100).toFixed(2);
}

function getUniquenessScore(feeder) {
  return +(feeder.uniqueness_pct / maxUniqueness * 100).toFixed(2);
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
  const hardwareChart = $("#hardware-chart").data("kendoChart");
  const uptimeScore = getUptimeScore(feeder);
  const avgRangeScore = getAvgRangeScore(feeder);
  const maxRangeScore = getMaxRangeScore(feeder);
  const positionScore = getPositionScore(feeder);
  const aircraftOnGroundScore = getAircraftOnGroundScore(feeder);
  const totalAircraftScore = getTotalAircraftScore(feeder);
  const uniqueAircraftScore = getUniqueAircraftScore(feeder);
  const nearestAirportScore = getNearestAirportScore(feeder);
  const uniquenessScore = getUniquenessScore(feeder);
  hardwareChart.options.series = [
    {
      name: "Uptime",
      startAngle: 90 + (uptimeScore * 3.6),
      data: [
        {
          category: "disabled",
          value: (100 - uptimeScore).toFixed(2),
          color: "#b3f2ff"
        }, {
          category: "Uptime",
          value: uptimeScore,
          color: "#00596a"
        },
      ]
    }, {
      name: "Average Coverage",
      startAngle: 90 + (avgRangeScore * 3.6),
      data: [
        {
          category: "disabled",
          value: (100 - avgRangeScore).toFixed(2),
          color: "#ecf7f8"
        }, {
          category: "Feeder Percentile",
          value: avgRangeScore,
          color: "#61bac9"
        }
      ],
      labels: {
        visible: false,
      }
    }, {
      name: "Maximum Range",
      startAngle: 90 + (maxRangeScore * 3.6),
      data: [
        {
          category: "disabled",
          value: (100 - maxRangeScore).toFixed(2),
          color: "#ecd2f9"
        }, {
          category: "Feeder Percentile",
          value: maxRangeScore,
          color: "#9d1edd"
        }
      ],
      labels: {
        visible: false
      }
    },];
  hardwareAvg = Math.ceil((maxRangeScore + avgRangeScore + uptimeScore) / 3);
  hardwareChart.refresh();
  let activityChart = $("#activity-chart").data("kendoChart");
  activityChart.options.series = [
    {
      name: "Position",
      startAngle: 90 + (positionScore * 3.6),
      data: [
        {
          category: "disabled",
          value: (100 - positionScore).toFixed(2),
          color: "#b3f2ff"
        }, {
          category: "Feeder Percentile",
          value: positionScore,
          color: "#00596a"
        }
      ]
    },
    {
      name: "Aircraft on Ground",
      startAngle: 90 + (aircraftOnGroundScore * 3.6),
      data: [
        {
          category: "disabled",
          value: (100 - aircraftOnGroundScore).toFixed(2),
          color: "#ecf7f8"
        }, {
          category: "Feeder Percentile",
          value: aircraftOnGroundScore,
          color: "#61bac9"
        }
      ],
      labels: {
        visible: false,
      }
    }, {
      name: "Total Aircraft",
      startAngle: 90 + (totalAircraftScore * 3.6),
      data: [
        {
          category: "disabled",
          value: (100 - totalAircraftScore).toFixed(2),
          color: "#ecd2f9"
        }, {
          category: "Feeder Percentile",
          value: totalAircraftScore,
          color: "#9d1edd"
        }
      ],
      labels: {
        visible: false
      }
    }

  ]
  activityAvg = Math.ceil((positionScore + aircraftOnGroundScore + totalAircraftScore) / 3);
  activityChart.refresh();
  let exchangeChart = $("#exchange-chart").data("kendoChart")
  exchangeChart.options.series = [
    {
      name: "Unique Aircraft",
      startAngle: 90 + (uniqueAircraftScore * 3.6),
      data: [
        {
          category: "disabled",
          value: (100 - uniqueAircraftScore).toFixed(2),
          color: "#b3f2ff"
        }, {
          category: "Feeder Percentile",
          value: uniqueAircraftScore,
          color: "#00596a"
        }
      ]
    },
    {
      name: "Nearest Airport",
      startAngle: 90 + (nearestAirportScore * 3.6),
      data: [
        {
          category: "disabled",
          value: (100 - nearestAirportScore).toFixed(2),
          color: "#ecf7f8"
        }, {
          category: "Feeder Percentile",
          value: nearestAirportScore,
          color: "#61bac9"
        }
      ],
      labels: {
        visible: false,
      }
    },
    {
      name: "Uniqueness",
      startAngle: 90 + (uniquenessScore * 3.6),
      data: [
        {
          category: "disabled",
          value: (100 - uniquenessScore).toFixed(2),
          color: "#ecd2f9"
        }, {
          category: "Feeder Percentile",
          value: uniquenessScore,
          color: "#9d1edd"
        }
      ],
      labels: {
        visible: false
      }
    }];
  exchangeAvg = Math.ceil((uniqueAircraftScore + nearestAirportScore + uniquenessScore) / 3);
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
  const grid = $("#feeder-grid").data("kendoGrid");

  grid.element.height(grid.options.height);

  if (filterState._filterContext && filterState._filterContext.foundFeeder) {
    const feeder = filterState._filterContext.foundFeeder;
    const pageSize = grid.dataSource.pageSize();
    const pageNo = Math.ceil(feeder.rank / pageSize);
    grid.dataSource.page(pageNo);

    const items = grid.items();
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
    // get the page header and append it to the grid
    grid.dataSource.page(1);
  } else {
    const customHeader = grid.element.find(".custom-header-row");
    if (customHeader) {
      customHeader.remove();
    }
  }
}

function generateChartTooltip(seriesName, category, value) {
  let pretext = '';
  if (category != 'disabled') {
    pretext += `${seriesName}: <b>${value}%</b> </br> </br>`;
  } else {
    pretext += `${seriesName} </br> </br>`
  }
  if (seriesName === 'Uptime') {
    return pretext += "The percentage of time the feeder is active and able to receive transmissions. </br>To improve, you will want to make sure you're plugged in to a stable power source, </br>connect to a reliable internet service, and use hardwired connections between your hardware </br>and source of internet.";
  } else if (seriesName === 'Maximum Range') {
    return pretext += 'The further the coverage distance of a receiver, </br>the more likely it is to receive ADS-B transmissions. </br>To improve, you want to have your receiver hardwired and place the </br>antenna as high as possible outside in an area with no obstructions.';
  } else if (seriesName === 'Average Coverage') {
    return pretext += 'The larger the coverage area of a receiver, the more likely </br>it is to receive ADS - B transmissions. </br>To improve, you want to have your receiver hardwired and place the antenna as high </br>as possible outside in an area with no obstructions.';
  } else if (seriesName === 'Position') {
    return pretext += 'The more positions a feeder receives, the more valuable it is to the Exchange.';
  } else if (seriesName === 'Aircraft on Ground') {
    return pretext += 'Ground activity is a vital signal to the Exchange. </br>To improve, you want to place your receiver as close to an airport runway as possible </br>and / or minimize obstructions between the antenna and the airport.';
  } else if (seriesName === 'Total Aircraft') {
    return pretext += 'The more aircraft a feeder receives, the more valuable it is to the Exchange.';
  } else if (seriesName === 'Unique Aircraft') {
    return pretext += 'The more unique aircraft a feeder receives, the more valuable it is to the Exchange. </br>This is the most valuable of all signals that contribute to the Exchange.';
  } else if (seriesName === 'Nearest Airport') {
    return pretext += 'Receivers that are close to airports are particularly valuable to the Exchange. </br>To improve, you want to place your receiver as close to an airport runway as possible.';
  } else if (seriesName === 'Uniqueness') {
    return pretext += "A feeder's value to the ADS - B Exchange network based on </br>receiver's placement relative to other receivers. </br>To improve, you want to find a location for your receiver </br>that is not already covered by other receivers.";
  } else {
    return pretext;
  }
}

function polarToCartesian(centerX, centerY, radius, angleInDegrees) {
  const angleInRadians = (angleInDegrees) * Math.PI / 180.0;

  return {
    x: centerX + (radius * Math.cos(angleInRadians)),
    y: centerY + (radius * Math.sin(angleInRadians))
  };
}

function Pie_CurvedEnds(e) {
  const seg = e.createVisual();

  const circRad = (e.radius - e.innerRadius) / 2;
  const dist = e.innerRadius + circRad;
  const spoint = polarToCartesian(e.center.x, e.center.y, dist, e.startAngle);
  const epoint = polarToCartesian(e.center.x, e.center.y, dist, e.endAngle);

  let group = new kendo.drawing.Group();
  group.append(seg);

  if (lastChartSeriesColour != "none") {
    const endArcGeometry = new kendo.geometry.Arc([spoint.x, spoint.y], {
      startAngle: 0, endAngle: 360, radiusX: circRad, radiusY: circRad
    });

    const endArc = new kendo.drawing.Arc(endArcGeometry, {
      fill: { color: e.options.color },
      stroke: { color: "none" }
    });

    group.append(endArc);
  }

  // draw semi-circle at end of segment to allow for overlap at the top of the pie
  const startArcGeometry = new kendo.geometry.Arc([epoint.x, epoint.y], {
    startAngle: 0, endAngle: 360, radiusX: circRad, radiusY: circRad
  });
  const startArc = new kendo.drawing.Arc(startArcGeometry, {
    fill: { color: e.category === "disabled" ? lastChartSeriesColour : e.options.color },
    stroke: { color: "none" }
  });
  group.append(startArc);

  lastChartSeriesColour = e.category != "disabled" ? "none" : e.options.color;
  return group;
}

