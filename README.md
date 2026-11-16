# US Airport Ops

A board for nine US hubs: Atlanta, Chicago O'Hare, Dallas/Fort Worth, Denver, Los Angeles, Newark, San Francisco, Miami, and Tampa.

Each card shows:

- The FAA program in effect right now, if any
- Current METAR flight category and wind
- The August 2026 median taxi-out and gate delay for the scheduled hour
- An estimated wheels-off time
- An estimated taxi fuel burn for a typical narrowbody

A ground delay or ground stop holds flights headed **to** that airport. It does not change the taxi-out for flights leaving it. Departure delays posted by the FAA are the ones that apply to flights leaving the field.

## Run

```bash
npm start
```

Open http://localhost:4173

```bash
npm test
```

## Data

| Piece | Source |
| --- | --- |
| Taxi-out and gate delay | [BTS Reporting Carrier On-Time Performance](https://transtats.bts.gov/TableInfo.asp?gnoyr_VQ=FGJ&QO_fu146_anzr=b0-gvzr), August 2026 |
| Live programs | [FAA NAS status](https://nasstatus.faa.gov/api/airport-status-information) |
| Weather | NOAA Aviation Weather METAR |
| Taxi fuel | 26.5 lb per minute, both engines, 737 / A320 class. About 6.7 lb per US gallon. Planning figure, not a measured flow. |

Refresh the history when a new BTS month is published:

```bash
python3 scripts/build-baselines.py /path/to/On_Time_Reporting_Carrier_On_Time_Performance_1987_present_YEAR_MONTH.zip
```

The prezipped files live at `https://transtats.bts.gov/PREZIP/`.

## GitHub

This app lives at https://github.com/YoRichB/us-airport-ops. Pull, change, and push on that repo as the board grows.
