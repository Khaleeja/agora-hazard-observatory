import { CycloneTrackPoint } from "./CycloneTrackPoint";
import { GeoJSONGeometry } from "./GeoJSONGeometry";

export interface GeoJSONFeature {
  _id?: string;
  type: "Feature";
  geometry: GeoJSONGeometry;
  properties: {
    id: string;
    title: string;
    eventType: string;
    description?: string;
    accessibility?: string;
    source: string;
    sourceURL?: string;
    severity: "Low" | "Medium" | "High";
    timestamp: number;
    location: string;
    magnitude?: number; // reserved for USGS (earthquake magnitude)
    // ── Cyclone-specific (optional; populated by IBTrACSAdapter) ──────────
    startTimestamp?: number; // first known observation — timestamp is the last; together they bound the track's overlap for time-window search
    windSpeed?: number; // peak sustained wind speed across the whole track (kt)
    pressure?: number; // minimum central pressure across the whole track (hPa)
    basin?: string; // e.g. "NA", "WP", "EP" — see IBTrACS basin codes
    category?: string; // Saffir-Simpson category at peak intensity: "TD"|"TS"|"1".."5"
    track?: CycloneTrackPoint[]; // per-point detail, index-aligned with geometry.coordinates
  };
}
