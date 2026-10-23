/**
 * IBTrACSAdapter.ts
 * IBTrACSAdapter converts rows from NOAA's bulk IBTrACS CSV into Feature[].
 *
 * Unlike USGSAdapter (1 API row = 1 independent, immutable Feature), IBTrACS
 * rows are individual track *points* — several rows share the same `sid`
 * (storm id) and together form one cyclone's path. This adapter groups rows
 * by `sid` and emits exactly one Feature per storm: a LineString (or a
 * single Point, for a storm observed only once) plus a per-point `track[]`
 * array index-aligned with the geometry's coordinates.
 *
 * The whole CSV file (full archive or recent window) is passed in already
 * parsed; `input.from` filters out storms with no activity at/after that
 * time — passing `undefined` converts every storm in the file. There is no
 * "only fetch what changed" step here: the caller always hands over a
 * storm's *complete* known track, and a plain upsert-and-replace in the
 * repository correctly both extends an active storm's path and absorbs
 * NOAA's later best-track revisions to already-ingested points.
 */

import { createModuleLogger } from "../logger/logger";
import { IBTrACSConfig } from "../configs/IBTrACSConfig";
import { CycloneTrackPoint } from "../types/CycloneTrackPoint";
import { GeoJSONFeature } from "../types/GeoJSONFeature";
import { IBTrACSCsvInput, IBTrACSCsvRow } from "../types/IBTrACSCsv";
import { Adapter } from "./Adapter";

const BASIN_NAMES: Record<string, string> = {
  NA: "North Atlantic",
  EP: "Eastern Pacific",
  WP: "Western Pacific",
  NI: "North Indian",
  SI: "South Indian",
  SP: "South Pacific",
  SA: "South Atlantic",
};

interface RawPoint {
  sid: string;
  name: string;
  season?: number;
  basin?: string;
  time: number; // ms epoch, parsed from ISO_TIME
  lat: number;
  lon: number;
  windSpeed?: number; // kt, best available of USA_WIND / WMO_WIND
  pressure?: number; // hPa, best available of USA_PRES / WMO_PRES
  radiusOfMaxWind?: number; // nmile
}

export class IBTrACSAdapter extends Adapter<IBTrACSCsvInput> {
  protected readonly _type: string = "cyclone";
  private readonly _logger = createModuleLogger("IBTrACS Adapter");
  private readonly _cols = IBTrACSConfig.Columns;

  private _getCategory(peakWindKt: number): string {
    if (peakWindKt < 34) return "TD";
    if (peakWindKt < 64) return "TS";
    if (peakWindKt < 83) return "1";
    if (peakWindKt < 96) return "2";
    if (peakWindKt < 113) return "3";
    if (peakWindKt < 137) return "4";
    return "5";
  }

  private _getSeverity(category: string): "Low" | "Medium" | "High" {
    if (category === "TD" || category === "TS") return "Low";
    if (category === "1" || category === "2") return "Medium";
    return "High";
  }

  private _toNumber(cell: string | undefined): number | undefined {
    if (cell === undefined) return undefined;
    const trimmed = cell.trim();
    if (trimmed === "") return undefined; // CSV represents missing values as blank, not null
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : undefined;
  }

  /**
   * IBTrACS lets longitude run past ±180° to keep a track that crosses the
   * antimeridian numerically continuous (e.g. 178, 179, 180.4, 181... instead
   * of wrapping to -179.6). GeoJSON/MongoDB's 2dsphere index requires
   * [-180, 180], and rejects the *entire* bulk write — every storm in the
   * batch, not just the offending one — if a single point is out of range.
   * Observed live: this silently dropped a whole year's worth of otherwise-
   * valid cyclones (Gabrielle 2023 crosses the antimeridian near NZ).
   */
  private _normalizeLongitude(lon: number): number {
    if (lon >= -180 && lon <= 180) return lon; // common case: untouched, no float drift
    let wrapped = lon;
    while (wrapped > 180) wrapped -= 360;
    while (wrapped < -180) wrapped += 360;
    return wrapped;
  }

  /**
   * NOAA's CSV stores time as "YYYY-MM-DD HH:mm:ss" (space, no zone) — always
   * UTC. Converted to a proper ISO string before parsing rather than relying
   * on Date's own lenient/inconsistent handling of the space-separated form.
   */
  private _parseIsoTime(raw: string): number {
    return Date.parse(`${raw.trim().replace(" ", "T")}Z`);
  }

  private _parseRows(rows: IBTrACSCsvRow[]): RawPoint[] {
    const points: RawPoint[] = [];
    for (const row of rows) {
      const sid = row[this._cols.sid]?.trim();
      const isoTime = row[this._cols.isoTime];
      const lat = this._toNumber(row[this._cols.lat]);
      const lon = this._toNumber(row[this._cols.lon]);

      if (!sid || !isoTime) {
        this._logger.error("Row discarded: missing sid or ISO_TIME", { row });
        continue;
      }
      const time = this._parseIsoTime(isoTime);
      if (lat === undefined || lon === undefined || Number.isNaN(time)) {
        this._logger.error("Row discarded: invalid position or time", {
          row,
        });
        continue;
      }

      points.push({
        sid,
        name: row[this._cols.name]?.trim() || sid,
        season: this._toNumber(row[this._cols.season]),
        basin: row[this._cols.basin]?.trim() || undefined,
        time,
        lat,
        lon: this._normalizeLongitude(lon),
        // USA agency (NHC/JTWC/CPHC) is preferred when present, WMO as fallback
        windSpeed:
          this._toNumber(row[this._cols.usaWind]) ??
          this._toNumber(row[this._cols.wmoWind]),
        pressure:
          this._toNumber(row[this._cols.usaPres]) ??
          this._toNumber(row[this._cols.wmoPres]),
        radiusOfMaxWind: this._toNumber(row[this._cols.usaRmw]),
      });
    }
    return points;
  }

  private _toFeature(sid: string, points: RawPoint[]): GeoJSONFeature {
    points.sort((a, b) => a.time - b.time);
    const first = points[0];
    const last = points[points.length - 1];

    const peakWind = points.reduce(
      (max, p) => (p.windSpeed !== undefined ? Math.max(max, p.windSpeed) : max),
      0,
    );
    const minPressure = points.reduce<number | undefined>((min, p) => {
      if (p.pressure === undefined) return min;
      return min === undefined ? p.pressure : Math.min(min, p.pressure);
    }, undefined);
    const category = this._getCategory(peakWind);

    const track: CycloneTrackPoint[] = points.map((p) => ({
      timestamp: p.time,
      windSpeed: p.windSpeed,
      pressure: p.pressure,
      radiusOfMaxWind: p.radiusOfMaxWind,
    }));

    const basin = last.basin ?? first.basin;

    return {
      type: "Feature",
      geometry:
        points.length === 1
          ? { type: "Point", coordinates: [first.lon, first.lat] }
          : {
              type: "LineString",
              coordinates: points.map((p) => [p.lon, p.lat]),
            },
      properties: {
        id: sid,
        title: `${first.name} (${first.season ?? new Date(first.time).getUTCFullYear()})`,
        eventType: this._type,
        source: "IBTrACS",
        severity: this._getSeverity(category),
        timestamp: last.time,
        startTimestamp: first.time,
        location: basin ? (BASIN_NAMES[basin] ?? basin) : "unknown basin",
        windSpeed: peakWind || undefined,
        pressure: minPressure,
        basin,
        category,
        track,
      },
    };
  }

  public toGeoJSON(input: IBTrACSCsvInput): GeoJSONFeature[] {
    const points = this._parseRows(input.rows);

    const bySid = new Map<string, RawPoint[]>();
    for (const p of points) {
      const group = bySid.get(p.sid);
      if (group) group.push(p);
      else bySid.set(p.sid, [p]);
    }

    const features: GeoJSONFeature[] = [];
    for (const [sid, group] of bySid) {
      if (input.from !== undefined && !group.some((p) => p.time >= input.from!))
        continue; // storm untouched since last check — nothing new to persist
      features.push(this._toFeature(sid, group));
    }
    return features;
  }
}
