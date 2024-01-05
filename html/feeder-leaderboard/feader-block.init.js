let boardData;
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
let activeGridCount = 0;
let selectedFeeder = null;
initializeFeederGrid();
bindSearch();
renderFilterSection();

$.ajax({
  url: 'https://__ROOT_PUB_DOMAIN_NAME__/api/aircraft/v2/public/leaderboard',
  method: 'GET',
  success: function (response) {
    boardData = response.data;
    getGeoInfoList(boardData.feeders)
    renderboard(boardData.feeders);
    populateFeederStats(boardData);
  },
  error: function (error) {
    console.error('Error fetching feeder data:', error);
  }
});

function renderboard(feeders) {
  getMaximumProperties(feeders);
  calculateFeederScores(feeders);
  setGridDataSources(feeders);
  initializeFeederChart();
  renderFilter();
  activeGridCount = feeders.length;
  if (selectedFeeder) {
    renderFeederSection(selectedFeeder);
  }
}

function setGridDataSources(feederlist) {
  var dataSource = new kendo.data.DataSource({
    data: feederlist,
    pageSize: 10, // Set the number of items per page
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
          uniqueness: { type: "number" },
          position: { type: "number" }
        },
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

function initializeFeederGrid() {
  $("#feeder-grid").kendoGrid({
    columns: [
      { field: "rank", title: "Rank", width: 60 },
      { field: "feeder_name", title: "Feeder Name" },
      { field: "country", title: "Country" },
      { field: "score", title: "Score", width: 140, format: "{0:##,#}" },
      { field: "uptime", title: "Uptime", width: 70, format: "{0:n2}" },
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
    dataBound: populateHeader
  });
}

function renderFilter() {
  $("#regionselect").kendoDropDownList({
    optionLabel: "Select Region...",
    rounded: "full",
    autoBind: true,
    dataSource: regions
  });

  $("#countryselect").kendoDropDownList({
    optionLabel: "Select country...",
    dataSource: countries,
    rounded: "full",
    autoBind: true,
    cascadeFrom: "regionselect",
    cascadeFromField: "region",
    dataValueField: "country",
    dataTextField: "country"
  });

  $("#municipalityselect").kendoDropDownList({
    optionLabel: "Select municipality...",
    dataTextField: "city",
    dataValueField: "city",
    rounded: "full",
    autoBind: false,
    dataSource: cities,
    cascadeFrom: "countryselect",
    cascadeFromField: "country"
  });

  $("#regionselect").data("kendoDropDownList").bind("change", onFilterChange);
  $("#countryselect").data("kendoDropDownList").bind("change", onFilterChange);
  $("#municipalityselect").data("kendoDropDownList").bind("change", onFilterChange);

  // $("#aircraftselect").kendoMultiSelect({
  //   placeholder: "Select aircraft...",
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

  // $("#modeselect").kendoMultiSelect({
  //   placeholder: "Select mode...",
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

function onFilterChange() {
  let region = $("#regionselect").val();
  let country = $("#countryselect").val();
  let city = $("#municipalityselect").val();


  if ((region && region.startsWith('Select'))
    || (country && country.startsWith('Select'))
    || (city && city.startsWith('Select'))) {
    renderboard(boardData.feeders);
  } else if (region && country && city) {
    renderboard(
      boardData.feeders.filter(
        feeder =>
          feeder.region === region &&
          feeder.country === country &&
          feeder.city === city
      )
    );
  } else if (region && country) {
    renderboard(
      boardData.feeders.filter(
        feeder => feeder.region === region && feeder.country === country
      )
    );
  } else if (region) {
    renderboard(boardData.feeders.filter(feeder => feeder.region === region));
  } else {
    renderboard(boardData.feeders);
  }
}

function initializeFeederChart() {
  $("#hardware-chart").kendoChart({
    seriesDefaults: {
      type: "donut",
      margin: 2,
      startAngle: 150
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
      startAngle: 150
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
      startAngle: 150
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

function renderFilterSection() {
  if (selectedFeeder) {
    $("#search-grid").show();
    let hardwareChart = $("#hardware-chart").data("kendoChart");
    hardwareChart.options.series = [
      {
        name: "Maximum Range",
        data: [
          {
            category: "Feeder Percentile",
            value: getMaxRangeScore(selectedFeeder),
            color: "#1E395C"
          }, {
            category: "Remaining Percentile",
            value: (100 - getMaxRangeScore(selectedFeeder)).toFixed(2),
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
            value: getAvgRangeScore(selectedFeeder),
            color: "#066674"
          }, {
            category: "Remaining Percentile",
            value: (100 - getAvgRangeScore(selectedFeeder)).toFixed(2),
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
            value: getUptimeScore(selectedFeeder),
            color: "#660058"
          },
          {
            category: "Downtime",
            value: (100 - getUptimeScore(selectedFeeder)).toFixed(2),
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
            value: getPositionScore(selectedFeeder),
            color: "#1E395C"
          },
          {
            category: "Remaining Percentage",
            value: (100 - getPositionScore(selectedFeeder)).toFixed(2),
            color: "#C1D3EB"
          }
        ]
      },
      {
        name: "Aircraft on Ground",
        data: [
          {
            category: "Feeder Percentile",
            value: getAircraftOnGroundScore(selectedFeeder),
            color: "#066674"
          },
          {
            category: "Remaining Percentile",
            value: (100 - getAircraftOnGroundScore(selectedFeeder)).toFixed(2),
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
            value: getTotalAircraftScore(selectedFeeder),
            color: "#660058"
          }, {
            category: "Other Percentile",
            value: (100 - getTotalAircraftScore(selectedFeeder)).toFixed(2),
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
            value: getUniqueAircraftScore(selectedFeeder),
            color: "#1E395C"
          },
          {
            category: "Remaining Percentile",
            value: (100 - getUniqueAircraftScore(selectedFeeder)).toFixed(2),
            color: "#C1D3EB"
          }
        ]
      },
      {
        name: "Nearest Airport",
        data: [
          {
            category: "Feeder Percentile",
            value: getNearestAirportScore(selectedFeeder),
            color: "#066674"
          },
          {
            category: "Remaining Percentile",
            value: (100 - getNearestAirportScore(selectedFeeder)).toFixed(2),
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
            value: getUniquenessScore(selectedFeeder),
            color: "#660058"
          }, {
            category: "Remaining Percentile",
            value: (100 - getUniquenessScore(selectedFeeder)).toFixed(2),
            color: "#FFADF4"
          }
        ],
        labels: {
          visible: false
        }
      }];
    exchangeChart.refresh();
    $("#rank-chart").data("kendoChart").refresh();
  } else {
    $("#search-grid").hide();
  }
}

function populateFeederStats(feederArray) {
  $("#feeder-count").text(formatNumber(feederArray.feeder_count));
  $("#feeders-added").text(formatNumber(feederArray.feeders_added));
  $("#monthly-positions").text(transformNumber(feederArray.total_monthly_positions, 1));
  $("#countries-count").text(transformNumber(feederArray.countries_count, 1));
  $("#daily-positions").text(transformNumber(feederArray.total_daily_positions, 1));
  $("#aircraft-count").text(transformNumber(feederArray.total_aircrafts, 1));
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

  feederlist.forEach((feeder) => {
    if (feeder.country && feeder.country.trim() !== "") {
      distinctCountries.add({ region: feeder.region, country: feeder.country });
    }
    if (feeder.region && feeder.region.trim() !== "") {
      distinctRegions.add(feeder.region);
    }
    if (feeder.city && feeder.city.trim() !== "") {
      distinctCities.add({ city: feeder.city, region: feeder.region, country: feeder.country });
    }
  });

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
  regions = Array.from(distinctRegions).sort();
  cities = Array.from(distinctCities).sort((a, b) => a.city.localeCompare(b.city));
}

function calculateFeederScores(feederlist) {
  feederlist.forEach((feeder) => {
    feeder.score = getFeederScore(feeder);
  });

  feederlist.sort((a, b) => b.score - a.score);

  feederlist.forEach((feeder, index) => {
    feeder.rank = index + 1;
    feeder.position = index + 1;
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

function bindSearch() {
  let input = $('#feeder-search-input');
  let button = $('.search-button');
  input.on('keyup', function (event) {
    if (event.key === 'Enter') {
      searchFeeders();
    }
  });

  button.on('click', searchFeeders);
}

function searchFeeders() {
  let input = $('#feeder-search-input');
  let searchText = input.val();

  selectedFeeder = boardData.feeders
    .find(feeder => feeder.feeder_name.toLowerCase() === searchText.toLowerCase());
  console.log('selectedFeeder', selectedFeeder);
  renderFeederSection(selectedFeeder);
}

function renderFeederSection(selectedFeeder) {
  let grid = $("#feeder-grid").data("kendoGrid");

  renderFilterSection();
  populateFeederPercentile(selectedFeeder);
  generateSearchSummaryText(selectedFeeder.feeder_name);
  grid.refresh();
}

function generateSearchSummaryText(feeder_name) {
  $("#selected-feeder").text(`"${feeder_name}"`);

  let region = $("#regionselect").val();
  let country = $("#countryselect").val();
  let city = $("#municipalityselect").val();
  let filter_text = 'with filters '
  let locationPrefix = 'Country: ';


  if (region && !region.startsWith('Select')) {
    locationPrefix += `${region}`;
  }
  if (country && !country.startsWith('Select')) {
    locationPrefix += `, ${country}`;
  }
  if (city && !city.startsWith('Select')) {
    locationPrefix += `, ${city}`;
  }
}

function populateHeader(e) {
  e.sender.element.find(".custom-header-row").remove();
  var items = e.sender.items();
  e.sender.element.height(e.sender.options.height);

  if (selectedFeeder) {
    items.each(function () {
      var row = $(this);
      var dataItem = e.sender.dataItem(row);

      if (dataItem.feeder_name === selectedFeeder.feeder_name) {
        var item = row.clone();
        item.addClass("custom-header-row");
        var thead = e.sender.element.find(".k-grid-header table thead");
        thead.append(item);
        e.sender.element.height(e.sender.element.height() + row.height());
      }
    })
  }
}