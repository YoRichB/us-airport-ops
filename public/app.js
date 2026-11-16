const board = document.querySelector("#board");
const template = document.querySelector("#card");
const statusLine = document.querySelector("#status-line");
const scheduledInput = document.querySelector("#scheduled");
const useNow = document.querySelector("#use-now");

function signed(minutes) {
  const value = Number(minutes);
  if (value > 0) return `+${value} min`;
  if (value < 0) return `${value} min`;
  return "on time";
}

function flags(airport) {
  const items = [];
  for (const delay of airport.status.departureDelays) {
    items.push(`Departure delay ${delay.min}–${delay.max}`);
  }
  for (const delay of airport.status.groundDelays) {
    items.push(`Inbound ground delay avg ${delay.avg}`);
  }
  for (const stop of airport.status.groundStops) {
    items.push(`Ground stop${stop.endTime ? ` until ${stop.endTime}` : ""}`);
  }
  for (const delay of airport.status.arrivalDelays) {
    items.push(`Arrival delay ${delay.min}–${delay.max}`);
  }
  if (airport.status.closures.length) items.push("Closure posted");
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
    node.querySelector(".local").textContent = `${airport.local.label} · ${airport.local.clock} local · ${airport.name}`;

    const list = node.querySelector(".flags");
    const posted = flags(airport);
    if (posted.length === 0) {
      const item = document.createElement("li");
      item.className = "clear";
      item.textContent = "No FAA program";
      list.append(item);
    } else {
      for (const text of posted) {
        const item = document.createElement("li");
        item.textContent = text;
        list.append(item);
      }
    }

    const estimate = airport.estimate;
    const figures = [
      ["Taxi-out", `${estimate.taxiOut} min`],
      ["Gate delay", signed(estimate.gateDelay)],
      ["Wheels-off", estimate.wheelsOff.dayOffset ? `${estimate.wheelsOff.clock} +${estimate.wheelsOff.dayOffset}d` : estimate.wheelsOff.clock],
      ["Taxi fuel", `${estimate.fuel.pounds.toLocaleString("en-US")} lb`],
    ];
    const dl = node.querySelector(".figures");
    for (const [label, value] of figures) {
      const wrap = document.createElement("div");
      const dt = document.createElement("dt");
      const dd = document.createElement("dd");
      dt.textContent = label;
      dd.textContent = value;
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

async function load() {
  const params = new URLSearchParams();
  if (scheduledInput.value) params.set("scheduled", scheduledInput.value);
  const response = await fetch(`/api/board?${params.toString()}`);
  if (!response.ok) throw new Error(`Board ${response.status}`);
  render(await response.json());
}

scheduledInput.addEventListener("change", () => {
  load().catch((error) => {
    statusLine.textContent = error.message;
  });
});

useNow.addEventListener("click", () => {
  scheduledInput.value = "";
  load().catch((error) => {
    statusLine.textContent = error.message;
  });
});

load().catch((error) => {
  statusLine.textContent = error.message;
});
setInterval(() => {
  load().catch((error) => {
    statusLine.textContent = error.message;
  });
}, 60_000);
