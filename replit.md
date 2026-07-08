# ORION — Orbital Real-time Intelligence & Operations Network

A DoD-quality 3D interactive space traffic control system tracking real space objects in real time.

## What it does

- **3D Interactive Globe** — React Three Fiber globe with real satellite positions propagated from TLE data via satellite.js. Falls back to a 2D canvas globe when WebGL is unavailable (e.g. Replit preview sandbox).
- **Live Orbital Catalog** — 128+ space objects across 6 categories: Space Stations (ISS, CSS/Tiangong), Starlink, GPS/GNSS, Weather, Military, and Debris.
- **Conjunction Analysis** — proximity-based close-approach detection for LEO objects within 10 km.
- **HUD Interface** — tactical display with fleet telemetry, category filters, threat level, and per-satellite detail panels showing orbital kinematics and raw TLE data.
- **Real Data** — live TLE data from CelesTrak (cached hourly), with a 100+ satellite embedded fallback dataset when CelesTrak is unreachable.

## Architecture

This is a pnpm monorepo with two artifacts:

- **`artifacts/orion`** — React + Vite frontend (path: `/`)
- **`artifacts/api-server`** — Express 5 API server (path: `/api`)
- **`lib/api-spec`** — OpenAPI spec (source of truth for the API)
- **`lib/api-client-react`** — Auto-generated React Query hooks
- **`lib/api-zod`** — Auto-generated Zod validation schemas

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/healthz` | Health check |
| GET | `/api/satellites` | List satellites (filter by category, search, limit) |
| GET | `/api/satellites/categories` | Category counts and colors |
| GET | `/api/satellites/:noradId` | Single satellite detail |
| GET | `/api/stats` | Fleet statistics and threat level |
| GET | `/api/conjunctions` | Close-approach event analysis |

## Data Source

TLE (Two-Line Element) data from **CelesTrak** (`celestrak.org`), fetched hourly across 6 groups: stations, Starlink, GPS, weather, military, debris. Position propagated server-side using `satellite.js`.

**Fallback:** If CelesTrak is unreachable (403/404), the server automatically uses an embedded dataset of 100+ well-known space objects covering all categories. This ensures the app is always functional.

## Running

- Frontend dev server: `pnpm --filter @workspace/orion run dev`
- API server: `pnpm --filter @workspace/api-server run dev`

Both workflows are managed by Replit automatically.

## User Preferences

- Project name: **ORION** (Orbital Real-time Intelligence & Operations Network)
- Audience: DoD / defense tech / LinkedIn
- Visual style: Dark tactical HUD, cyan primary (#00f0ff), mono font, military-grade aesthetics
- No database needed — all data is live or embedded
