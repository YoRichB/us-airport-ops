import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { estimateDeparture, fuelFor, parseDurationMinutes } from "../lib/estimate.js";
import { isOperationalClosure, parseFaaStatus } from "../lib/faa.js";

test("wheels-off adds gate delay and taxi-out", () => {
  const result = estimateDeparture({
    airport: {
      hours: {
        18: { flights: 100, taxiOutMedian: 18, taxiOutP90: 29, depDelayMedian: 6 },
      },
    },
    scheduledHhmm: 1840,
    fuel: { kgPerMinute: 12, kgPerGallon: 3.04, aircraft: "Narrowbody" },
  });
  assert.equal(result.wheelsOff.clock, "19:04");
  assert.equal(result.wheelsOff.dayOffset, 0);
  assert.equal(result.fuel.pounds, 477);
  assert.equal(result.fuel.lbPerMinute, 26.5);
  assert.equal(result.fuel.gallons, 71);
});

test("midnight wrap carries a day", () => {
  const result = estimateDeparture({
    airport: { hours: { 23: { taxiOutMedian: 40, taxiOutP90: 50, depDelayMedian: 30, flights: 40 } } },
    scheduledHhmm: 2350,
    fuel: { kgPerMinute: 12, kgPerGallon: 3.04 },
  });
  assert.equal(result.wheelsOff.clock, "01:00");
  assert.equal(result.wheelsOff.dayOffset, 1);
});

test("duration text parses hours and minutes", () => {
  assert.equal(parseDurationMinutes("2 hours and 59 minutes"), 179);
  assert.equal(parseDurationMinutes("16 minutes"), 16);
  assert.equal(fuelFor(15, { kgPerMinute: 12, kgPerGallon: 3.04 }).pounds, 398);
});

test("FAA sample separates inbound programs from departure delays", () => {
  const xml = readFileSync(fileURLToPath(new URL("./fixtures/faa-sample.xml", import.meta.url)), "utf8");
  const parsed = parseFaaStatus(xml);
  const sfo = parsed.byAirport.get("SFO");
  const mco = parsed.byAirport.get("MCO");
  assert.ok(sfo.groundDelays.length >= 1);
  assert.equal(sfo.groundDelays[0].avgMinutes, 179);
  assert.equal(mco.departureDelays[0].minMinutes, 16);
  assert.equal(mco.departureDelays[0].trend, "Increasing");
  assert.equal(isOperationalClosure({ reason: "closed overnight" }), true);
  assert.equal(
    isOperationalClosure({ reason: "CLSD TO NON SKED TRANSIENT GA ACFT" }),
    false,
  );
});
