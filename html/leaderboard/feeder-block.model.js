class Feeder {
  feeder = [];
  schema = null;

  constructor(feederArray, schema) {
    console
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