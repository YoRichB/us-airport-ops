import { parseDurationMinutes } from "./estimate.js";

function decode(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function blocks(xml, tag) {
  const found = [];
  const re = new RegExp(`<${tag}(\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "g");
  let match = re.exec(xml);
  while (match) {
    found.push({ attrs: match[1] || "", body: match[2] });
    match = re.exec(xml);
  }
  return found;
}

function field(body, tag) {
  const match = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(body);
  return match ? decode(match[1]) : "";
}

function attr(attrs, name) {
  const match = new RegExp(`${name}="([^"]*)"`).exec(attrs);
  return match ? decode(match[1]) : "";
}

export function isOperationalClosure(closure) {
  const reason = (closure.reason || "").toUpperCase();
  return !reason.includes("NON SKED") && !reason.includes("NON-SKED");
}

export function parseFaaStatus(xml) {
  const updated = field(xml, "Update_Time");
  const byAirport = new Map();
  const ensure = (code) => {
    if (!byAirport.has(code)) {
      byAirport.set(code, {
        code,
        groundDelays: [],
        groundStops: [],
        arrivalDelays: [],
        departureDelays: [],
        closures: [],
      });
    }
    return byAirport.get(code);
  };

  for (const section of blocks(xml, "Delay_type")) {
    const name = field(section.body, "Name");
    if (name === "Ground Delay Programs") {
      for (const item of blocks(section.body, "Ground_Delay")) {
        const code = field(item.body, "ARPT");
        if (!code) continue;
        const avg = field(item.body, "Avg");
        const max = field(item.body, "Max");
        ensure(code).groundDelays.push({
          reason: field(item.body, "Reason"),
          avg,
          max,
          avgMinutes: parseDurationMinutes(avg),
          maxMinutes: parseDurationMinutes(max),
        });
      }
    } else if (name.startsWith("Ground Stop")) {
      for (const item of blocks(section.body, "Ground_Stop")) {
        const code = field(item.body, "ARPT");
        if (!code) continue;
        ensure(code).groundStops.push({
          reason: field(item.body, "Reason"),
          endTime: field(item.body, "End_Time"),
        });
      }
    } else if (name.startsWith("General Arrival")) {
      for (const item of blocks(section.body, "Delay")) {
        const code = field(item.body, "ARPT");
        if (!code) continue;
        const flow = blocks(item.body, "Arrival_Departure")[0];
        const kind = flow ? attr(flow.attrs, "Type") : "";
        const min = flow ? field(flow.body, "Min") : "";
        const max = flow ? field(flow.body, "Max") : "";
        const entry = {
          reason: field(item.body, "Reason"),
          min,
          max,
          trend: flow ? field(flow.body, "Trend") : "",
          minMinutes: parseDurationMinutes(min),
          maxMinutes: parseDurationMinutes(max),
        };
        const bucket = kind === "Departure" ? "departureDelays" : "arrivalDelays";
        ensure(code)[bucket].push(entry);
      }
    } else if (name.startsWith("Airport Closures")) {
      for (const item of blocks(section.body, "Airport")) {
        const code = field(item.body, "ARPT");
        if (!code) continue;
        ensure(code).closures.push({
          reason: field(item.body, "Reason"),
          start: field(item.body, "Start"),
          reopen: field(item.body, "Reopen"),
        });
      }
    }
  }

  return { updated, byAirport };
}
