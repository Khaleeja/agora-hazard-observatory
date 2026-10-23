import { GeoJSONFeature } from '../types/GeoJSONFeature';
import { EventTypeStrategy, FilterField } from './event-type.strategy';

const TRACK_COLOR = '#A78BFA';

/**
 * The track coordinate/point representing the storm's known state AS OF
 * `asOf` — the last track entry whose timestamp doesn't exceed it, not
 * simply the last entry in the array. Shared by the map (passive pin) and
 * the list card, so both agree on what "current" means for a given search.
 */
export function pointAsOf(feature: GeoJSONFeature, asOf: number): number[] | undefined {
  const geom = feature.geometry;
  if (geom.type === 'Point') return geom.coordinates as number[];
  if (geom.type !== 'LineString') return undefined;

  const coords = geom.coordinates as number[][];
  const track = feature.properties.track;
  if (!track || track.length !== coords.length) return coords.at(-1);

  let idx = 0; // track is chronological — fall back to the earliest point if asOf predates all of it
  for (let i = 0; i < track.length; i++) {
    if (track[i].timestamp <= asOf) idx = i;
    else break;
  }
  return coords[idx];
}

/** Same resolution, but returning the track[] entry itself (wind/pressure) rather than the coordinate. */
export function trackPointAsOf(feature: GeoJSONFeature, asOf: number) {
  const track = feature.properties.track;
  if (!track || feature.geometry.type !== 'LineString') return undefined;

  let idx = 0;
  for (let i = 0; i < track.length; i++) {
    if (track[i].timestamp <= asOf) idx = i;
    else break;
  }
  return track[idx];
}

export class CycloneStrategy implements EventTypeStrategy {
  readonly name = 'cyclone';
  readonly label = 'Cyclone';
  readonly filterFields: ReadonlySet<FilterField> = new Set(['category', 'position']);

  /**
   * Passive/overview marker: a single pin at the storm's position AS OF
   * `asOf` (the search's 'to', or now) — never the full path, and never
   * simply the absolute last-ever point. For a live/recent search that's
   * the same thing; for a historical search (e.g. "cyclones active in March
   * 2023"), showing today's position would be incoherent with what was
   * actually asked. IBTrACS's own reporting lag also means the true last
   * point can trail `asOf` slightly even for a live search — that's fine,
   * it just resolves to the latest point at-or-before `asOf`.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  renderOnMap(feature: GeoJSONFeature, Cesium: any, dataSource: any, getPin: (f: GeoJSONFeature) => string, asOf: number): unknown {
    const point = pointAsOf(feature, asOf);
    if (!point) return null;

    return dataSource.entities.add({
      position: Cesium.Cartesian3.fromDegrees(point[0], point[1]),
      billboard: { image: getPin(feature), verticalOrigin: Cesium.VerticalOrigin.BOTTOM },
    });
  }

  /**
   * Full path, shown only for the currently-selected cyclone (see
   * map.ts). Endpoints and a sparse sample of intermediate points get a
   * date label directly on the map; the complete per-point breakdown
   * (including wind/pressure) lives in the detail panel instead — labelling
   * every single point here would be unreadable for long-lived storms.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  renderDetail(feature: GeoJSONFeature, Cesium: any, dataSource: any): unknown {
    if (feature.geometry.type !== 'LineString') return null; // single-point storm: nothing more to draw
    const coords = feature.geometry.coordinates as number[][];
    const track = feature.properties.track ?? [];

    const polyline = dataSource.entities.add({
      polyline: {
        positions: Cesium.Cartesian3.fromDegreesArray(coords.flat()),
        width: 3,
        material: new Cesium.ColorMaterialProperty(Cesium.Color.fromCssColorString(TRACK_COLOR).withAlpha(0.85)),
        clampToGround: false,
      },
    });

    const labelStride = Math.max(1, Math.ceil(coords.length / 8));
    coords.forEach((c, i) => {
      const isEndpoint = i === 0 || i === coords.length - 1;
      const point = track[i];
      const showLabel = point && (isEndpoint || i % labelStride === 0);

      dataSource.entities.add({
        position: Cesium.Cartesian3.fromDegrees(c[0], c[1]),
        point: {
          pixelSize: isEndpoint ? 9 : 5,
          color: Cesium.Color.fromCssColorString(TRACK_COLOR),
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 1,
        },
        label: showLabel
          ? {
              text: new Date(point.timestamp).toISOString().slice(0, 10),
              font: '11px sans-serif',
              pixelOffset: new Cesium.Cartesian2(0, -14),
              fillColor: Cesium.Color.WHITE,
              outlineColor: Cesium.Color.BLACK,
              outlineWidth: 2,
              style: Cesium.LabelStyle.FILL_AND_OUTLINE,
              showBackground: true,
              backgroundColor: Cesium.Color.fromCssColorString('#1F2937').withAlpha(0.75),
            }
          : undefined,
      });
    });

    return polyline;
  }
}
