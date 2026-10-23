/**
 * IBTrACSConfig.ts
 *
 * HISTORY — why this points at NOAA's bulk CSV files, not ERDDAP:
 * This project originally used a NOAA ERDDAP mirror
 * (erddap.aoml.noaa.gov/hdb, dataset IBTrACS_since1980_1) because it offered
 * a queryable REST-like API similar in spirit to USGS's. Confirmed live
 * (2026-09-08) that this specific mirror's data is stuck at 2025-12-16
 * despite its "since1980" name — verified via the server's own actual_range
 * error message, and cross-checked against NOAA's canonical CSV
 * distribution, which was current to within days (e.g. ibtracs.ACTIVE's
 * most recent provisional point was only 3 days old at the time of
 * checking, and all three candidate files had today's date as
 * Last-Modified). No live, better-maintained ERDDAP alternative was found —
 * NCEI's own ERDDAP instance doesn't host IBTrACS at all. Hence: read the
 * bulk files directly instead.
 */

export const IBTrACSConfig = {
  // Full 1980+ archive (~140MB) — used once, for the initial reconstruction
  // when the DB is empty. Costly per-download, so never used for periodic
  // updates.
  FullArchiveUrl:
    "https://www.ncei.noaa.gov/data/international-best-track-archive-for-climate-stewardship-ibtracs/v04r01/access/csv/ibtracs.since1980.list.v04r01.csv",
  // Rolling last-3-years window (~10MB) — small enough to re-download on
  // every scheduled check, used for every non-reconstruction call.
  RecentUrl:
    "https://www.ncei.noaa.gov/data/international-best-track-archive-for-climate-stewardship-ibtracs/v04r01/access/csv/ibtracs.last3years.list.v04r01.csv",
  RequestTimeout: 120_000, // ms — a single bulk download, not many small requests; the full archive can take a while
  TimeOrigin: Date.UTC(1980, 0, 1), // matches the full archive's genuine coverage
  // Columns read from the CSV by name (see IBTrACSAdapter). NOAA's CSV
  // header is uppercase/underscored, unlike the lowercase ERDDAP variable
  // names this project used before.
  Columns: {
    sid: "SID",
    name: "NAME",
    season: "SEASON",
    basin: "BASIN",
    isoTime: "ISO_TIME",
    lat: "LAT",
    lon: "LON",
    usaWind: "USA_WIND",
    wmoWind: "WMO_WIND",
    usaPres: "USA_PRES",
    wmoPres: "WMO_PRES",
    usaRmw: "USA_RMW",
  },
};

// Cyclone-only query knowledge, read by IBTrACSStrategy.parseSearchParams —
// used to live in RESTConfig.ts, moved here since nothing but this plugin
// needs it.
export const VALID_CATEGORIES = ["TD", "TS", "1", "2", "3", "4", "5"] as const;
export const VALID_BASINS = ["NA", "EP", "WP", "NI", "SI", "SP", "SA"] as const;
