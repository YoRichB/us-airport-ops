#!/usr/bin/env python3
"""Build hourly taxi-out and departure-delay medians from a BTS on-time zip.

Usage:
  python3 scripts/build-baselines.py /path/to/On_Time_....zip
"""

import csv
import json
import statistics
import sys
import zipfile
from collections import defaultdict
from pathlib import Path

AIRPORTS = {
    "ATL": {"icao": "KATL", "name": "Hartsfield-Jackson Atlanta", "city": "Atlanta", "tz": "America/New_York"},
    "ORD": {"icao": "KORD", "name": "O'Hare", "city": "Chicago", "tz": "America/Chicago"},
    "DFW": {"icao": "KDFW", "name": "Dallas/Fort Worth", "city": "Dallas-Fort Worth", "tz": "America/Chicago"},
    "DEN": {"icao": "KDEN", "name": "Denver", "city": "Denver", "tz": "America/Denver"},
    "LAX": {"icao": "KLAX", "name": "Los Angeles", "city": "Los Angeles", "tz": "America/Los_Angeles"},
    "EWR": {"icao": "KEWR", "name": "Newark Liberty", "city": "Newark", "tz": "America/New_York"},
    "SFO": {"icao": "KSFO", "name": "San Francisco", "city": "San Francisco", "tz": "America/Los_Angeles"},
    "MIA": {"icao": "KMIA", "name": "Miami", "city": "Miami", "tz": "America/New_York"},
    "TPA": {"icao": "KTPA", "name": "Tampa", "city": "Tampa", "tz": "America/New_York"},
}

MIN_HOUR_FLIGHTS = 30


def median(values):
    return int(round(statistics.median(values)))


def hour_of(crs):
    if crs is None or crs == "":
        return None
    try:
        value = int(float(crs))
    except ValueError:
        return None
    if value == 2400:
        return 0
    hour = value // 100
    return hour if 0 <= hour <= 23 else None


def summarize(rows):
    taxi = [r[0] for r in rows if r[0] is not None]
    delay = [r[1] for r in rows if r[1] is not None]
    if not taxi:
        return None
    return {
        "flights": len(rows),
        "taxiOutMedian": median(taxi),
        "taxiOutP90": int(round(sorted(taxi)[max(0, int(len(taxi) * 0.9) - 1)])),
        "depDelayMedian": median(delay) if delay else 0,
    }


def main():
    if len(sys.argv) != 2:
        print("usage: build-baselines.py <bts.zip>", file=sys.stderr)
        sys.exit(2)
    zip_path = Path(sys.argv[1])
    buckets = {code: defaultdict(list) for code in AIRPORTS}
    kept = 0
    with zipfile.ZipFile(zip_path) as archive:
        csv_name = next(name for name in archive.namelist() if name.endswith(".csv"))
        with archive.open(csv_name) as raw:
            reader = csv.DictReader((line.decode("utf-8", "replace") for line in raw))
            for row in reader:
                origin = (row.get("Origin") or "").strip()
                if origin not in buckets:
                    continue
                if (row.get("Cancelled") or "").strip() in {"1", "1.00"}:
                    continue
                hour = hour_of(row.get("CRSDepTime"))
                if hour is None:
                    continue
                taxi_raw = (row.get("TaxiOut") or "").strip()
                delay_raw = (row.get("DepDelay") or "").strip()
                if not taxi_raw:
                    continue
                try:
                    taxi = float(taxi_raw)
                except ValueError:
                    continue
                delay = None
                if delay_raw:
                    try:
                        delay = float(delay_raw)
                    except ValueError:
                        delay = None
                buckets[origin][hour].append((taxi, delay))
                kept += 1

    airports = {}
    for code, meta in AIRPORTS.items():
        by_hour = {}
        all_rows = []
        for hour, rows in buckets[code].items():
            all_rows.extend(rows)
            summary = summarize(rows)
            if summary:
                by_hour[str(hour)] = summary
        overall = summarize(all_rows)
        hours = {}
        for hour in range(24):
            key = str(hour)
            sample = by_hour.get(key)
            if sample and sample["flights"] >= MIN_HOUR_FLIGHTS:
                hours[key] = sample
            elif overall:
                hours[key] = {
                    **overall,
                    "flights": sample["flights"] if sample else 0,
                    "fallback": "airport",
                }
        airports[code] = {**meta, "iata": code, "overall": overall, "hours": hours}

    payload = {
        "source": "Bureau of Transportation Statistics, Reporting Carrier On-Time Performance",
        "sourceUrl": "https://transtats.bts.gov/TableInfo.asp?gnoyr_VQ=FGJ&QO_fu146_anzr=b0-gvzr",
        "period": "2026-08",
        "periodLabel": "August 2026",
        "file": zip_path.name,
        "departuresUsed": kept,
        "note": "Medians of reporting-carrier domestic departures. Hours with fewer than 30 flights use the airport median for that month.",
        "fuel": {
            "aircraft": "Typical narrowbody (737 / A320 class)",
            "kgPerMinute": 12,
            "kgPerGallon": 3.04,
            "note": "Planning figure for both engines at taxi thrust. This is not a measured fuel flow.",
        },
        "airports": airports,
    }
    out = Path(__file__).resolve().parents[1] / "data" / "baselines.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, indent=2) + "\n")
    print(f"wrote {out} from {kept} departures")


if __name__ == "__main__":
    main()
