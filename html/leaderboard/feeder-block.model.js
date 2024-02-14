class Feeder {
  feeder = [];
  schema = null;

  constructor(feederArray, schema) {
    this.feeder = feederArray;
    this.schema = schema;
  }

  get(fieldName) {
    const fieldIndex = this.schema["_main._schema_index"][fieldName];
    return this.feeder[fieldIndex];
  }
}

class PositionStat {
  constructor(type, statArray, schema) {
    this.type = type;
    this.stat = statArray;
    this.schema = schema;
  }

  get(statName) {
    const statIndex = this.schema[`.${this.type}._schema_index`][statName];
    if (statName === 'aircrafts' || statName === 'positions') {
      return this.stat[statIndex];
    }

    const valueMap = schema[`.${this.type}.${statName}._value_map`];
    const resultMap = schema[`.${this.type}.${statName}._friendly_name_map`];
    const value = Object.keys(valueMap).find(key => valueMap[key] === this.stat[statIndex]);
    return resultMap[value];
  }
}

class FeederStat {
  maxUniqueness = 0;
  maxUptime = 0;
  maxPosition = 0;
  maxTotalAircraft = 0;
  maxUniqueAircraft = 0;
  maxRange = 0;
  maxAvgRange = 0;
  maxNearestAirport = 0;
  maxAircraftOnGround = 0;

  constructor(feederArray) {
    this.calculateBoardMaxValues(feederArray);
  }

  calculateBoardMaxValues(feederlist) {
    feederlist.forEach((feeder) => {
      this.maxUptime = Math.max(this.maxUptime, feeder.uptime);
      this.maxAvgRange = Math.max(this.maxAvgRange, feeder.avg_range);
      this.maxRange = Math.max(this.maxRange, feeder.max_range);
      this.maxPosition = Math.max(this.maxPosition, feeder.position);
      this.maxAircraftOnGround = Math.max(this.maxAircraftOnGround, feeder.aircraft_on_ground);
      this.maxTotalAircraft = Math.max(this.maxTotalAircraft, feeder.total_aircraft);
      this.maxUniqueAircraft = Math.max(this.maxUniqueAircraft, feeder.unique_aircraft);
      this.maxNearestAirport = Math.max(this.maxNearestAirport, feeder.nearest_airport);
      this.maxUniqueness = Math.max(this.maxUniqueness, feeder.uniqueness_pct);
    });
  }

  populateScoreRanks(feederlist) {
    feederlist.forEach((feeder) => {
      feeder.score = this.getFeederScore(feeder);
    });

    feederlist.sort((a, b) => b.score - a.score);

    feederlist.forEach((feeder, index) => {
      feeder.rank = index + 1;
    });
    return feederlist;
  }

  getFeederScore(feeder) {
    let score = 0;
    score += this.getUptimeScore(feeder);
    score += this.getAvgRangeScore(feeder);
    score += this.getMaxRangeScore(feeder);
    score += this.getPositionScore(feeder);
    score += this.getAircraftOnGroundScore(feeder);
    score += this.getTotalAircraftScore(feeder);
    score += this.getUniqueAircraftScore(feeder);
    score += this.getNearestAirportScore(feeder);
    score += this.getUniquenessScore(feeder);
    return (score * 100).toFixed(0);
  }

  getUptimeScore(feeder) {
    if (this.maxUptime === 0) {
      return 0;
    }
    return +(feeder.uptime / this.maxUptime * 100).toFixed(2);
  }

  getAvgRangeScore(feeder) {
    if (this.maxAvgRange === 0) {
      return 0;
    }
    return +(feeder.avg_range / this.maxAvgRange * 100).toFixed(2);
  }

  getMaxRangeScore(feeder) {
    if (this.maxRange === 0) {
      return 0;
    }
    return +(feeder.max_range / this.maxRange * 100).toFixed(2);
  }

  getPositionScore(feeder) {
    if (this.maxPosition === 0) {
      return 0;
    }
    return +(feeder.position / this.maxPosition * 100).toFixed(2);
  }

  getAircraftOnGroundScore(feeder) {
    if (this.maxAircraftOnGround === 0) {
      return 0;
    }
    return +(feeder.aircraft_on_ground / this.maxAircraftOnGround * 100).toFixed(2);
  }

  getTotalAircraftScore(feeder) {
    if (this.maxTotalAircraft === 0) {
      return 0;
    }
    return +(feeder.total_aircraft / this.maxTotalAircraft * 100).toFixed(2);
  }

  getUniqueAircraftScore(feeder) {
    if (this.maxUniqueAircraft === 0) {
      return 0;
    }
    return +(feeder.unique_aircraft / this.maxUniqueAircraft * 100).toFixed(2);
  }

  getNearestAirportScore(feeder) {
    if (this.maxNearestAirport === 0) {
      return 0;
    }
    return +((1 - (feeder.nearest_airport / this.maxNearestAirport)) * 100).toFixed(2);
  }

  getUniquenessScore(feeder) {
    if (this.maxUniqueness === 0) {
      return 0;
    }
    return +(feeder.uniqueness_pct / this.maxUniqueness * 100).toFixed(2);
  }
}