const zlib = require("zlib");

const STRIDE = 112;
const BINCRAFT_VERSION = 20250403;
const TWO_POW_32 = 4294967296;
const VALID_FLIGHT = 8;
const VALID_ALT_BARO = 16;
const VALID_ALT_GEOM = 32;
const VALID_POSITION = 64;
const VALID_GS = 128;
const VALID_TRACK = 8;
const GROUND = 1;
const AIRBORNE = 2;
const GROUND_ALTITUDE = "ground";
const FLIGHT_OFFSET = 78;
const FLIGHT_LENGTH = 8;

function isNumber(value) {
  return typeof value === "number" && !Number.isNaN(value);
}

function encodeAircraft(view, offset, aircraftEntry) {
  view.setInt32(offset, parseInt(aircraftEntry.hex, 16), true);
  view.setInt32(offset + 4, Math.round((aircraftEntry.seen || 0) * 10), true);
  view.setInt32(offset + 8, Math.round((isNumber(aircraftEntry.lon) ? aircraftEntry.lon : 0) * 1e6), true);
  view.setInt32(offset + 12, Math.round((isNumber(aircraftEntry.lat) ? aircraftEntry.lat : 0) * 1e6), true);
  view.setInt16(offset + 20, Math.round((isNumber(aircraftEntry.alt_baro) ? aircraftEntry.alt_baro : 0) / 25), true);
  view.setInt16(offset + 22, Math.round((isNumber(aircraftEntry.alt_geom) ? aircraftEntry.alt_geom : 0) / 25), true);
  view.setInt16(offset + 34, Math.round((isNumber(aircraftEntry.gs) ? aircraftEntry.gs : 0) * 10), true);
  view.setInt16(offset + 40, Math.round((isNumber(aircraftEntry.track) ? aircraftEntry.track : 0) * 90), true);
  view.setUint16(offset + 62, Math.min(aircraftEntry.messages || 0, 65535), true);
  view.setUint8(offset + 64, aircraftEntry.category ? parseInt(aircraftEntry.category, 16) : 0);
  view.setUint8(offset + 68, aircraftEntry.alt_baro === GROUND_ALTITUDE ? GROUND : AIRBORNE);
  const flight = (aircraftEntry.flight || "").slice(0, FLIGHT_LENGTH);
  for (let index = 0; index < flight.length; index++) view.setUint8(offset + FLIGHT_OFFSET + index, flight.charCodeAt(index));
  let validityFlags = 0;
  if (isNumber(aircraftEntry.lat) && isNumber(aircraftEntry.lon)) validityFlags |= VALID_POSITION;
  if (aircraftEntry.flight) validityFlags |= VALID_FLIGHT;
  if (isNumber(aircraftEntry.alt_baro)) validityFlags |= VALID_ALT_BARO;
  if (isNumber(aircraftEntry.alt_geom)) validityFlags |= VALID_ALT_GEOM;
  if (isNumber(aircraftEntry.gs)) validityFlags |= VALID_GS;
  view.setUint8(offset + 73, validityFlags);
  view.setUint8(offset + 74, isNumber(aircraftEntry.track) ? VALID_TRACK : 0);
  view.setUint8(offset + 104, 1);
  view.setUint8(offset + 105, Math.round(((aircraftEntry.rssi != null ? aircraftEntry.rssi : -20) + 50) * 255 / 50));
  view.setInt32(offset + 108, Math.round((aircraftEntry.seen_pos || 0) * 10), true);
}

function binCraftOf(aircraft, nowMs) {
  const buffer = new ArrayBuffer(STRIDE * (aircraft.length + 1));
  const view = new DataView(buffer);
  view.setUint32(0, nowMs % TWO_POW_32, true);
  view.setUint32(4, Math.floor(nowMs / TWO_POW_32), true);
  view.setUint32(8, STRIDE, true);
  view.setUint32(12, aircraft.length, true);
  view.setInt16(20, -90, true);
  view.setInt16(22, -180, true);
  view.setInt16(24, 90, true);
  view.setInt16(26, 180, true);
  view.setUint32(40, BINCRAFT_VERSION, true);
  aircraft.forEach((aircraftEntry, index) => encodeAircraft(view, STRIDE * (index + 1), aircraftEntry));
  return Buffer.from(buffer);
}

function zstdBinCraftOf(aircraft) {
  return zlib.zstdCompressSync(binCraftOf(aircraft, Date.now()));
}

module.exports = { binCraftOf, zstdBinCraftOf };
