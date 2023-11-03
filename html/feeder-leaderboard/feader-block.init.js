let feederArray = [ //Static array for now
  {ID: 1, Rank: "1163", FeederName: "Jason13501", Country: "United States", Score: 97475, Uptime: "74", AVGRange: 284, MaxRange:371, Positions: 14384230, AircraftOnGround: 478, TotalAircraft:42483, UniqueAircraft:42483, NearestAirport: 19, Uniqueness:694},
  {ID: 2, Rank: "1", FeederName: "FlyingDan", Country: "United States", Score: 140280, Uptime: "100", AVGRange: 316, MaxRange:379, Positions: 25550120, AircraftOnGround: 14234, TotalAircraft:129759, UniqueAircraft:0, NearestAirport: 4, Uniqueness:0},
  {ID: 3, Rank: "2", FeederName: "Mix294", Country: "Cote d'lvoire", Score: 131475, Uptime: "99.7", AVGRange: 270, MaxRange:411, Positions: 19123574, AircraftOnGround: 11283, TotalAircraft:79574, UniqueAircraft:297, NearestAirport: 112, Uniqueness:164},
  {ID: 4, Rank: "3", FeederName: "Xbbs42k", Country: "Germany", Score: 130474, Uptime: "100", AVGRange: 295, MaxRange:483, Positions: 21434001, AircraftOnGround: 12384, TotalAircraft:97242, UniqueAircraft:131, NearestAirport: 13, Uniqueness:172}

];

// Target the div element by using jQuery and then call the kendoGrid() method.
$("#feeder-grid").kendoGrid({
  columns: [
    // The field matches the ID property in the data array.
    { field: "Rank", title: "Rank", width: 60},
    { field: "FeederName", title: "Feeder Name"},
    { field: "Country", title: "Country"},
    { field: "Score", title: "Score", width: 70},
    { field: "Uptime", title: "Uptime", width: 70},
    { field: "AVGRange", title: "Avg Range (SNM)"},
    { field: "MaxRange", title: "Max Range (NM)"},
    { field: "Positions", title: "Positions"},
    { field: "AircraftOnGround", title: "Aircraft on Ground"},
    { field: "TotalAircraft", title: "Total Aircraft"},
    { field: "UniqueAircraft", title: "Unique Aircraft"},
    { field: "NearestAirport", title: "Nearest Airport (NM)"},
    { field: "Uniqueness", title: "Uniqueness", width: 100},
  ],
  sortable: true,
  dataSource: {
    data: feederArray,
    schema: {
      model: {
        id: "ID", // The ID field is a unique identifier that allows the dataSource to distinguish different elements.
        fields: {
          ID: { type: "number"},
          Rank: { type: "number"},
          FeederName: { type: "string" },
          Score: { type: "number"},
          Uptime: { type: "number"},
          AVGRange: { type: "number"},
          MaxRange: { type: "number"},
          Positions: { type: "number"},
          AircraftOnGround: { type: "number"},
          TotalAircraft: { type: "number"},
          UniqueAircraft: { type: "number"},
          NearestAirport: { type: "number"},
          Uniqueness: { type: "number"}
        }
      }
    }
  }
});
