# Leipzig Transit Tracker

A live public transport tracker for Leipzig, showing real-time departures and tram route overlays on an interactive map.

## Features

- **Station search** — find any stop in the MDV network by name
- **Live departures** — real-time departure board with delays, per stop
- **Transport filters** — toggle Tram / S-Bahn / Bus; active types are sent to the backend so hafas only returns relevant services
- **Tram line selector** — individual LVB line chips (1–16) in official line colors; selecting a line draws its full route on the map and filters the departure board
- **Route overlay** — GTFS-derived polyline + clickable stop dots per line; clicking a stop opens its departure board
- **Nearby stops** — shown automatically when selecting a station; right-click anywhere on the map to discover stops at that location
- **Auto-refresh** — open departure popups refresh every 30 seconds

## Stack

- **Backend**: Node.js (ESM), Express, [hafas-client](https://github.com/public-transport/hafas-client) with the INSA profile
- **Frontend**: Single HTML file — Leaflet 1.9.4, vanilla JS, CartoDB dark tiles, no build step
- **GTFS**: MDV open data ([CC BY 4.0](https://www.mdv.de/service/downloads/)), downloaded once at startup and cached to disk

## Getting started

```bash
npm install
npm start        # http://localhost:3000
npm run dev      # same, with auto-restart on file changes
```

On first start the server downloads `gtfs_mdv.zip` (~12 MB) from MDV and parses it. Subsequent starts use the cached file. To force a re-download, delete `gtfs_mdv.zip`.

## Data sources

| Data | Source | Refresh |
|------|--------|---------|
| Live departures & station search | [INSA HAFAS](https://reiseauskunft.insa.de) | Real-time |
| GTFS route geometry & stops | [MDV open data](https://www.mdv.de/service/downloads/) | Weekly (manual) |
