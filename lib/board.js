import { estimateDeparture, hourOf, offsetMinutes, utcFromLocalClock } from "./estimate.js";
import { isOperationalClosure } from "./faa.js";

export function localParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "short",
    month: "short",
    day: "numeric",
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value || "";
  const hour = Number(get("hour"));
  const minute = Number(get("minute"));
  return {
    hhmm: hour * 100 + minute,
    clock: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
    label: `${get("weekday")} ${get("month")} ${get("day")}`,
    hour,
    minute,
  };
}

export function airportBoard({ baselines, faa, weather, now = new Date(), scheduledHhmm }) {
  const utc = localParts(now, "UTC");
  const airports = [];
  for (const [code, airport] of Object.entries(baselines.airports)) {
    const local = localParts(now, airport.tz);
    const scheduled = scheduledHhmm == null ? local.hhmm : Number(scheduledHhmm);
    const raw = faa.byAirport.get(code) || {
      code,
      groundDelays: [],
      groundStops: [],
      arrivalDelays: [],
      departureDelays: [],
      closures: [],
    };
    const status = {
      ...raw,
      closures: raw.closures.filter(isOperationalClosure),
    };
    const metar = weather.get(airport.icao) || null;
    const estimate = estimateDeparture({
      airport,
      scheduledHhmm: scheduled,
      fuel: baselines.fuel,
    });
    if (estimate) {
      estimate.wheelsOffUtc = utcFromLocalClock(estimate.wheelsOff, offsetMinutes(local, utc));
    }
    airports.push({
      ...airport,
      local,
      utc,
      scheduledHhmm: scheduled,
      scheduledHour: hourOf(scheduled),
      status,
      weather: metar
        ? {
            flightCategory: metar.fltCat || "",
            raw: metar.rawOb || "",
            wind: metar.wspd == null ? "" : `${metar.wdir ?? "VRB"}° at ${metar.wspd} kt`,
            visibility: metar.visib || "",
            tempC: metar.temp,
            ceiling: metar.cover || "",
          }
        : null,
      estimate,
    });
  }
  return airports;
}
