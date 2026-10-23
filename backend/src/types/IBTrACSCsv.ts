/**
 * IBTrACSCsv.ts
 * Shape of one parsed row from NOAA's bulk IBTrACS CSV distribution — a
 * plain column-name -> string-value map (CSV has no types; every cell is
 * text, numeric parsing is the adapter's job). Replaces the earlier
 * ERDDAP-shaped IBTrACSResponse: this project moved off the AOML ERDDAP
 * mirror after finding it stuck ~9 months behind NOAA's own CSV files (see
 * IBTrACSConfig for the full story).
 */
export type IBTrACSCsvRow = Record<string, string>;

export interface IBTrACSCsvInput {
  rows: IBTrACSCsvRow[];
  // Only storms with at least one point at/after this time are converted —
  // undefined means "no filter, include everything" (a full reconstruction).
  from?: number;
}
