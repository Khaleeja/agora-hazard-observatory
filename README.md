# AGORA

**A**ll-**H**azard **G**lobal **O**bservation & **R**eporting **A**rchive

A full-stack platform that ingests, stores, and visualizes natural-hazard
events — currently earthquakes (USGS) and tropical cyclones (NOAA IBTrACS) —
on an interactive 3D globe, with a REST API for filtered search over both.

## Structure

This is a two-service monorepo:

```
backend/    Node.js + Express + MongoDB REST API. Ingests events from
            external sources via a plugin-based Strategy pattern
            (see backend/src/plugins) and exposes a unified /api/events
            search endpoint across all registered phenomenon types.
frontend/   Angular + Cesium single-page app. Renders events on a 3D
            globe, with filtering, a detail panel, and per-phenomenon
            map rendering (point markers for earthquakes, full tracks
            for cyclones).
```

Each has its own `package.json`, `Dockerfile`, and CI workflow
(`.github/workflows/backend-ci.yml` / `frontend-ci.yml`, triggered only
by changes under their own folder) — they can be developed and deployed
independently, while sharing one repository and one orchestration layer.

## Running it

**Everything, via Docker:**

```sh
cp .env.example .env                      # fill in ARCGIS_API_KEY, Mongo credentials
cp backend/.env.example backend/.env      # fill in the backend's own settings
docker compose up --build
```

The frontend is served on `http://localhost:8080`.

**Backend only, for local development:**

```sh
cd backend
cp .env.example .env
npm ci
npm run dev
```

See `backend/README.md` and `frontend/README.md` for project-specific details.

## Architecture notes

Adding a new phenomenon/data source means implementing one new
`IPhenomenonPlugin` (ingestion + search-param parsing + query-building +
projection fields, all in a single class) and registering it — no changes
needed to the generic controller/service/repository layers. See
`backend/src/plugins/IPhenomenonPlugin.ts`.

## License

MIT — see [LICENSE](LICENSE).
