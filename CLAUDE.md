# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start          # run server (port 3000)
npm run dev        # run with auto-restart on file changes (node --watch)
```

No tests or linter configured.

## Architecture

Single-file backend + single-file frontend, no build step.

**`server.js`** — Express API. Loads GTFS at startup (blocking), then starts listening. Four endpoints:
- `GET /api/stations?q=` — hafas location search
- `GET /api/departures?id=&duration=&products=` — live departures; `products` is a comma-separated list (`tram,suburban,bus`) used to build the hafas products filter
- `GET /api/nearby?lat=&lng=` — hafas nearby stops
- `GET /api/tram-route/:line` — serves pre-parsed GTFS route data from in-memory `tramRouteData`

**`gtfs.js`** — GTFS module. Downloads `gtfs_mdv.zip` once to disk, parses it at startup into `tramRouteData: Map<lineNum, { outbound, inbound }>` where each direction has `{ stops, shape }`. Critical gotcha: **always pick the trip with the most stop_times entries** per route+direction — the first trip in file order is almost always a short-turn. Filter routes by `agency_id === '01130'` (LVB = Leipziger Verkehrsbetriebe) to avoid picking up identically-named lines from other operators in the MDV region. MDV GTFS has no `shapes.txt`, so route polylines are straight lines between stop coordinates.

**`public/index.html`** — Self-contained frontend. Key state:
- `activeProducts` — which transport types are backend-filtered (`tram`, `suburban`, `bus`)
- `activeTramLines: Set` — which line numbers are selected; empty = no filter (show all); non-empty = filter departures AND show route overlays on map
- `lastRawDepartures` — cached raw API response; tram line chip filter re-renders from this without re-fetching
- `routeLayers: Map<lineNum, { polylineGroup, stopGroup }>` — active Leaflet layers per line

Departure display flow: `loadDepartures()` fetches from API → stores in `lastRawDepartures` → calls `renderDepartures()`. Toggling tram line chips calls `renderDepartures()` directly (client-side only). Toggling transport type chips calls `loadDepartures()` (backend re-fetch needed).

Route stop markers are clickable — `openStopDepartures()` resolves GTFS stop IDs (format `de:14713:XXXXX`) to INSA/hafas IDs by searching by name and picking the closest result by coordinates, then calls `loadDepartures()`.

## Key gotchas

- **HAFAS profile**: use INSA (`hafas-client/p/insa/index.js`). The DB profile endpoint is retired. The VMT profile works for trains but has no LVB tram data.
- **GTFS download URL**: `https://www.mdv.de/media/file/817b7b11` — cached as `gtfs_mdv.zip`, updated weekly by MDV.
- **ID mismatch**: GTFS stop IDs (`de:14713:XXXXX`) ≠ INSA hafas stop IDs (numeric). Resolve via name search + coordinate proximity.
