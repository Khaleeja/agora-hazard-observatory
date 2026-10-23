import { GeoJSONFeature } from '../types/GeoJSONFeature';

export type FilterField = 'magnitude' | 'position' | 'category';

export interface EventTypeStrategy {
  readonly name: string;
  readonly label: string;
  readonly filterFields: ReadonlySet<FilterField>;
  // Renders the passive/overview marker shown in the main list & default map
  // view (e.g. for a cyclone: only its most recent known position as of
  // `asOf`, not its whole path — see renderDetail for that). `asOf` is the
  // search's 'to' boundary (or now, if unbounded) — a historical search must
  // show the event as it was then, not as of today.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  renderOnMap(feature: GeoJSONFeature, Cesium: any, dataSource: any, getPin: (f: GeoJSONFeature) => string, asOf: number): unknown;
  // Optional: renders extra map content only for the currently-selected
  // event (e.g. a cyclone's full track). Most event types have nothing to
  // add here and simply don't implement it.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  renderDetail?(feature: GeoJSONFeature, Cesium: any, dataSource: any): unknown;
}
