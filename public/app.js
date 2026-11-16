const board = document.querySelector("#board");
const template = document.querySelector("#card");
const statusLine = document.querySelector("#status-line");
const scheduledInput = document.querySelector("#scheduled");
const useNow = document.querySelector("#use-now");
const whenForm = document.querySelector("#when");
const whenNote = document.querySelector("#when-note");
const localClock = document.querySelector("#local-clock");
const utcClock = document.querySelector("#utc-clock");
let airportLocal = true;

function pad(value) {
  return String(value).padStart(2, "0");
}

function browserLocalValue(date = new Date()) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function paintClocks(date = new Date()) {
  localClock.textContent = browserLocalValue(date);
  utcClock.textContent = `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}Z`;
}

function clockText(clock, suffix) {
  const day = clock.dayOffset ? `+${clock.dayOffset}d` : "";
  return `${clock.clock}${day}${suffix}`;
}

function signed(minutes) {
  const value = Number(minutes);
  if (value > 0) return `+${value} min`;
  if (value < 0) return `${value} min`;
  return "on time";
}

function flags(airport) {
  const items = [];
  for (const delay of airport.status.departureDelays) {
    items.push({ tone: "alert", text: `Departure delay ${delay.min}–${delay.max}` });
  }
  for (const delay of airport.status.groundDelays) {
    items.push({ tone: "inbound", text: `Inbound ground delay avg ${delay.avg}` });
  }
  for (const stop of airport.status.groundStops) {
    items.push({ tone: "alert", text: `Ground stop${stop.endTime ? ` until ${stop.endTime}` : ""}` });
  }
  for (const delay of airport.status.arrivalDelays) {
    items.push({ tone: "caution", text: `Arrival delay ${delay.min}–${delay.max}` });
  }
  if (airport.status.closures.length) items.push({ tone: "alert", text: "Closure posted" });
  return items;
}

function render(payload) {
  board.replaceChildren();
  for (const airport of payload.airports) {
    const node = template.content.firstElementChild.cloneNode(true);
    node.querySelector(".code").textContent = airport.iata;
    node.querySelector(".place").textContent = airport.city;
    const category = airport.weather?.flightCategory || "—";
    const cat = node.querySelector(".cat");
    cat.textContent = category;
    cat.classList.add(category.toLowerCase());
    node.querySelector(".local").textContent =
      `${airport.local.label} · ${airport.local.clock} local · ${airport.utc.clock}Z · ${airport.name}`;

    const list = node.querySelector(".flags");
    const posted = flags(airport);
    if (posted.length === 0) {
      const item = document.createElement("li");
      item.className = "clear";
      item.textContent = "No FAA program";
      list.append(item);
    } else {
      for (const flag of posted) {
        const item = document.createElement("li");
        item.className = flag.tone;
        item.textContent = flag.text;
        list.append(item);
      }
    }

    const estimate = airport.estimate;
    const figures = [
      ["Taxi-out", `${estimate.taxiOut} min`],
      ["Gate delay", signed(estimate.gateDelay)],
      ["Wheels-off", `${clockText(estimate.wheelsOff, " L")} / ${clockText(estimate.wheelsOffUtc, "Z")}`],
      ["Taxi fuel", `${estimate.fuel.pounds.toLocaleString("en-US")} lb`],
    ];
    const dl = node.querySelector(".figures");
    for (const [label, value] of figures) {
      const wrap = document.createElement("div");
      const dt = document.createElement("dt");
      const dd = document.createElement("dd");
      dt.textContent = label;
      dd.textContent = value;
      if (label === "Wheels-off") wrap.classList.add("hero");
      if (label === "Gate delay") {
        wrap.classList.add(estimate.gateDelay > 0 ? "late" : estimate.gateDelay < 0 ? "early" : "ontime");
      }
      wrap.append(dt, dd);
      dl.append(wrap);
    }

    const gate = String(airport.scheduledHhmm).padStart(4, "0");
    const gateClock = `${gate.slice(0, 2)}:${gate.slice(2)}`;
    node.querySelector(".math").textContent =
      `Gate ${gateClock} ${signed(estimate.gateDelay)} historical delay, then ${estimate.taxiOut} min taxi. ` +
      `Typical late taxi-out is ${estimate.taxiOutP90} min. Fuel is ${estimate.taxiOut} min × ${estimate.fuel.lbPerMinute} lb for a ${payload.fuel.aircraft.toLowerCase()}, about ${estimate.fuel.gallons} gal.`;
    node.querySelector(".weather").textContent = airport.weather
      ? `${airport.weather.wind} · vis ${airport.weather.visibility} · ${airport.weather.raw}`
      : "Weather unavailable";
    board.append(node);
  }
  statusLine.textContent =
    `FAA update ${payload.updated}. History is ${payload.period} reporting-carrier departures. ` +
    `A ground delay holds flights headed to that airport. It does not change taxi-out for flights leaving it.`;
}

function showLoadError(error) {
  statusLine.textContent = error.message;
}

async function load() {
  const params = new URLSearchParams();
  if (!airportLocal && scheduledInput.value) params.set("scheduled", scheduledInput.value);
  const response = await fetch(`/api/board?${params.toString()}`);
  if (!response.ok) throw new Error(`Board ${response.status}`);
  render(await response.json());
}

scheduledInput.addEventListener("change", () => {
  airportLocal = scheduledInput.value === "";
  whenNote.textContent = airportLocal
    ? "Each airport uses its own local time."
    : "That gate time is local at every airport.";
  load().catch(showLoadError);
});

whenForm.addEventListener("submit", (event) => {
  event.preventDefault();
  useNow.click();
});

useNow.addEventListener("click", () => {
  airportLocal = true;
  scheduledInput.value = browserLocalValue();
  whenNote.textContent = "Each airport uses its own local time.";
  paintClocks();
  load().catch(showLoadError);
});

paintClocks();
setInterval(paintClocks, 1000);

load().catch((error) => {
  statusLine.textContent = error.message;
});
setInterval(() => {
  load().catch((error) => {
    statusLine.textContent = error.message;
  });
}, 60_000);
