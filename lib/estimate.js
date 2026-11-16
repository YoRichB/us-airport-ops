export function padClock(hhmm) {
  const value = ((Number(hhmm) % 2400) + 2400) % 2400;
  const text = String(value).padStart(4, "0");
  return `${text.slice(0, 2)}:${text.slice(2)}`;
}

export function minutesOfDay(hhmm) {
  const value = Number(hhmm);
  const hour = Math.floor(value / 100);
  const minute = value % 100;
  if (hour === 24 && minute === 0) return 0;
  return hour * 60 + minute;
}

export function fromMinutes(total) {
  const dayOffset = Math.floor(total / 1440);
  const wrapped = ((total % 1440) + 1440) % 1440;
  const hour = Math.floor(wrapped / 60);
  const minute = wrapped % 60;
  return {
    hhmm: hour * 100 + minute,
    clock: padClock(hour * 100 + minute),
    dayOffset,
  };
}

export function hourOf(hhmm) {
  const value = Number(hhmm);
  if (value === 2400) return 0;
  return Math.floor(value / 100);
}

export function baselineFor(airport, hour) {
  const hours = airport?.hours || {};
  return hours[String(hour)] || airport?.overall || null;
}

export function fuelFor(taxiMinutes, fuel) {
  const minutes = Math.max(0, Number(taxiMinutes) || 0);
  const kgPerMinute = fuel?.kgPerMinute ?? 12;
  const kgPerGallon = fuel?.kgPerGallon ?? 3.04;
  const kg = Math.round(minutes * kgPerMinute);
  return {
    minutes,
    kg,
    gallons: Math.round(kg / kgPerGallon),
    aircraft: fuel?.aircraft,
    kgPerMinute,
  };
}

export function estimateDeparture({ airport, scheduledHhmm, fuel }) {
  const hour = hourOf(scheduledHhmm);
  const pattern = baselineFor(airport, hour);
  if (!pattern) {
    return null;
  }
  const gateDelay = pattern.depDelayMedian;
  const taxi = pattern.taxiOutMedian;
  const wheels = fromMinutes(minutesOfDay(scheduledHhmm) + gateDelay + taxi);
  return {
    hour,
    pattern,
    gateDelay,
    taxiOut: taxi,
    taxiOutP90: pattern.taxiOutP90,
    wheelsOff: wheels,
    fuel: fuelFor(taxi, fuel),
  };
}

export function parseDurationMinutes(text) {
  if (!text) return null;
  const hours = /(\d+)\s*hour/.exec(text);
  const minutes = /(\d+)\s*minute/.exec(text);
  const value = (hours ? Number(hours[1]) * 60 : 0) + (minutes ? Number(minutes[1]) : 0);
  return text.match(/\d/) ? value : null;
}
