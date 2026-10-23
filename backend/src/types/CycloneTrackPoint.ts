/**
 * CycloneTrackPoint.ts
 * One observation along a cyclone's track. Index-aligned with the parent
 * Feature's `geometry.coordinates` (point i in the LineString <-> track[i]).
 * Kept separate from `geometry.coordinates` (rather than reusing the 3rd
 * coordinate slot) because that slot is already used for elevation/depth by
 * other sources (see USGSAdapter) — overloading it here would be ambiguous.
 */

export interface CycloneTrackPoint {
  timestamp: number;
  windSpeed?: number;
  pressure?: number;
  radiusOfMaxWind?: number;
}
