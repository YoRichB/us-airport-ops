import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { airportBoard } from "./lib/board.js";
import { parseFaaStatus } from "./lib/faa.js";

const root = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.PORT || 4173);
const baselines = JSON.parse(await readFile(join(root, "data/baselines.json"), "utf8"));
const icaos = Object.values(baselines.airports).map((airport) => airport.icao).join(",");

const cache = {
  faa: null,
  weather: null,
  at: 0,
};
const CACHE_MS = 60_000;

async function live() {
  if (cache.faa && Date.now() - cache.at < CACHE_MS) return cache;
  const [faaRes, metarRes] = await Promise.all([
    fetch("https://nasstatus.faa.gov/api/airport-status-information"),
    fetch(`https://aviationweather.gov/api/data/metar?ids=${icaos}&format=json`),
  ]);
  if (!faaRes.ok) throw new Error(`FAA status ${faaRes.status}`);
  if (!metarRes.ok) throw new Error(`METAR ${metarRes.status}`);
  const faa = parseFaaStatus(await faaRes.text());
  const metars = await metarRes.json();
  const weather = new Map(metars.map((item) => [item.icaoId, item]));
  cache.faa = faa;
  cache.weather = weather;
  cache.at = Date.now();
  return cache;
}

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function scheduledFrom(url) {
  const raw = url.searchParams.get("scheduled");
  if (raw == null || raw === "") return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(raw) || /^(\d{3,4})$/.exec(raw);
  if (!match) return null;
  if (match[2] != null && raw.includes(":")) {
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (hour > 23 || minute > 59) return null;
    return hour * 100 + minute;
  }
  const value = Number(match[1]);
  const hour = Math.floor(value / 100);
  const minute = value % 100;
  if (hour > 23 || minute > 59) return null;
  return value;
}

async function boardResponse(url) {
  const current = await live();
  const code = url.searchParams.get("airport");
  const airports = airportBoard({
    baselines,
    faa: current.faa,
    weather: current.weather,
    scheduledHhmm: scheduledFrom(url),
  });
  return {
    updated: current.faa.updated,
    fetchedAt: new Date(cache.at).toISOString(),
    period: baselines.periodLabel,
    source: baselines.source,
    fuel: baselines.fuel,
    airports: code ? airports.filter((airport) => airport.iata === code.toUpperCase()) : airports,
  };
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === "/api/board") {
      const body = JSON.stringify(await boardResponse(url));
      res.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      });
      res.end(body);
      return;
    }
    if (url.pathname === "/api/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    const requested = url.pathname === "/" ? "/index.html" : url.pathname;
    const filePath = normalize(join(root, "public", requested));
    if (!filePath.startsWith(normalize(join(root, "public")))) {
      res.writeHead(403).end("Forbidden");
      return;
    }
    const body = await readFile(filePath);
    res.writeHead(200, { "content-type": types[extname(filePath)] || "application/octet-stream" });
    res.end(body);
  } catch (error) {
    const missing = error && error.code === "ENOENT";
    res.writeHead(missing ? 404 : 502, { "content-type": "text/plain; charset=utf-8" });
    res.end(missing ? "Not found" : `Upstream failed: ${error.message}`);
  }
});

server.listen(port, () => {
  console.log(`US Airport Ops listening on http://localhost:${port}`);
});
