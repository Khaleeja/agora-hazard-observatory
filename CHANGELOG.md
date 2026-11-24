# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
AGORA is versioned as a single product (backend + frontend share one
version number) under [Semantic Versioning](https://semver.org/).

## [1.0.1] - 2026-11-24

### Changed

- Both Docker images now publish to GHCR (`ghcr.io/khaleeja/agora-backend`,
  `ghcr.io/khaleeja/agora-frontend`) on every tagged release; `setup-env.js`
  generates random MongoDB credentials instead of leaving `.env.example`'s
  placeholders in place.
- Backend container now drops to the built-in non-root `node` user after
  install; logs are bind-mounted as plain host files instead of a named
  volume, so they're reachable without `docker cp`.
- Frontend container now runs fully non-root (`nginxinc/nginx-unprivileged`,
  port 8080), on an nginx/Alpine base current enough to pick up
  outstanding OS CVEs.
- Backend dependency fixes (`body-parser`, `proxy-addr`, `qs`); `ts-node`/
  `typescript` moved to devDependencies so the production image no longer
  installs them.

## [1.0.0] - 2026-10-29

Initial public release.

### Added

- REST API ingesting earthquakes ([USGS](https://earthquake.usgs.gov)) and
  tropical cyclones ([NOAA IBTrACS](https://www.ncei.noaa.gov/products/international-best-track-archive)),
  stored in MongoDB as GeoJSON Features, with a unified, filterable search
  endpoint across every registered phenomenon type.
- Plugin architecture on both ends: a phenomenon/data source is a self-
  contained class owning its own ingestion, search-param parsing,
  query-building, and projection — no phenomenon-specific logic scattered
  across shared layers.
- `GET /api/health`, reporting per-phenomenon ingestion status and live
  document counts; a small accessible status badge in the frontend header
  polls it every 30s.
- Interactive 3D globe (CesiumJS) with clustered, per-type colour-coded
  markers; a cyclone renders its full historical track, resolved to
  whichever point was current as of the search's time window.
- Filter panel — type, severity, category, magnitude/wind range, time
  window, location radius with click-to-place on the globe — synchronised
  with an event list and a detail panel.
- An original logo: continent coastlines traced from a CC0 source map,
  rendered with a true perspective camera and surface-anchored hazard
  markers (see the root README for the full pipeline).
- Docker Compose setup for the full stack (MongoDB + backend + frontend).

[1.0.1]: https://github.com/Khaleeja/agora-hazard-observatory/releases/tag/v1.0.1
[1.0.0]: https://github.com/Khaleeja/agora-hazard-observatory/releases/tag/v1.0.0
