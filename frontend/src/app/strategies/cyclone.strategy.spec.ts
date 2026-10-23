import { CycloneStrategy, pointAsOf, trackPointAsOf } from './cyclone.strategy';
import { GeoJSONFeature } from '../types/GeoJSONFeature';

// Minimal fake of the slice of the real Cesium global this strategy touches —
// mirrors how the rest of the codebase treats Cesium as `any`.
const fakeCesium = {
  Cartesian3: {
    fromDegrees: (lon: number, lat: number) => ({ lon, lat }),
    fromDegreesArray: (flat: number[]) => flat,
  },
  Cartesian2: class { constructor(public x: number, public y: number) {} },
  Color: {
    fromCssColorString: (c: string) => ({ css: c, withAlpha: (a: number) => ({ css: c, alpha: a }) }),
    WHITE: 'white',
    BLACK: 'black',
  },
  ColorMaterialProperty: class { constructor(public color: unknown) {} },
  LabelStyle: { FILL_AND_OUTLINE: 'FILL_AND_OUTLINE' },
  VerticalOrigin: { BOTTOM: 'BOTTOM' },
};

const makeDataSource = () => {
  const added: Record<string, unknown>[] = [];
  return { entities: { add: (opts: Record<string, unknown>) => (added.push(opts), opts) }, added };
};

const makeFeature = (overrides: Partial<GeoJSONFeature> = {}): GeoJSONFeature => ({
  type: 'Feature',
  geometry: {
    type: 'LineString',
    coordinates: [
      [80, 10],
      [81, 11],
      [82, 12],
    ],
  },
  properties: {
    id: 'test-cyclone',
    title: 'TEST (2024)',
    eventType: 'cyclone',
    source: 'IBTrACS',
    severity: 'Medium',
    timestamp: 3000,
    location: 'North Indian',
    category: '2',
    track: [
      { timestamp: 1000, windSpeed: 40 },
      { timestamp: 2000, windSpeed: 60 },
      { timestamp: 3000, windSpeed: 80 },
    ],
  },
  ...overrides,
});

describe('pointAsOf / trackPointAsOf', () => {
  it('returns the latest coordinate/track entry at or before asOf', () => {
    const f = makeFeature();
    expect(pointAsOf(f, 2500)).toEqual([81, 11]);
    expect(trackPointAsOf(f, 2500)?.windSpeed).toBe(60);
  });

  it('returns the exact match when asOf equals a track timestamp', () => {
    const f = makeFeature();
    expect(pointAsOf(f, 2000)).toEqual([81, 11]);
  });

  it('falls back to the earliest point when asOf predates the whole track', () => {
    const f = makeFeature();
    expect(pointAsOf(f, 500)).toEqual([80, 10]);
  });

  it('returns the point coordinates unchanged for a Point geometry, regardless of asOf', () => {
    const f = makeFeature({ geometry: { type: 'Point', coordinates: [50, 5] } });
    expect(pointAsOf(f, 1)).toEqual([50, 5]);
  });

  it('returns undefined for a non-cyclone-shaped geometry', () => {
    const f = makeFeature({ geometry: { type: 'Polygon', coordinates: [[[0, 0]]] } });
    expect(pointAsOf(f, Date.now())).toBeUndefined();
    expect(trackPointAsOf(f, Date.now())).toBeUndefined();
  });
});

describe('CycloneStrategy.renderOnMap', () => {
  const strategy = new CycloneStrategy();

  it('places a single pin at the coordinate AS OF asOf, not the whole path', () => {
    const ds = makeDataSource();
    strategy.renderOnMap(makeFeature(), fakeCesium, ds, () => 'pin.png', 3000);

    expect(ds.added).toHaveLength(1);
    expect(ds.added[0]['position']).toEqual({ lon: 82, lat: 12 });
    expect(ds.added[0]['polyline']).toBeUndefined();
  });

  it('resolves to an earlier point when asOf predates the storm\'s later activity', () => {
    // Historical search: must show the storm as it was then, not its
    // eventual (future-relative-to-the-search) final position.
    const ds = makeDataSource();
    strategy.renderOnMap(makeFeature(), fakeCesium, ds, () => 'pin.png', 2000);

    expect(ds.added[0]['position']).toEqual({ lon: 81, lat: 11 });
  });

  it('places a pin at the point itself for a single-observation storm', () => {
    const ds = makeDataSource();
    const single = makeFeature({ geometry: { type: 'Point', coordinates: [50, 5] } });
    strategy.renderOnMap(single, fakeCesium, ds, () => 'pin.png', Date.now());

    expect(ds.added).toHaveLength(1);
    expect(ds.added[0]['position']).toEqual({ lon: 50, lat: 5 });
  });
});

describe('CycloneStrategy.renderDetail', () => {
  const strategy = new CycloneStrategy();

  it('draws the full polyline plus one point entity per track vertex', () => {
    const ds = makeDataSource();
    strategy.renderDetail!(makeFeature(), fakeCesium, ds);

    const polylines = ds.added.filter((e) => e['polyline']);
    const points = ds.added.filter((e) => e['point']);
    expect(polylines).toHaveLength(1);
    expect(points).toHaveLength(3); // one per coordinate/track entry
  });

  it('labels both endpoints with their date', () => {
    const ds = makeDataSource();
    strategy.renderDetail!(makeFeature(), fakeCesium, ds);

    const points = ds.added.filter((e) => e['point']);
    expect(points[0]['label']).toBeDefined();
    expect(points[points.length - 1]['label']).toBeDefined();
  });

  it('returns null for a single-point storm (nothing to draw)', () => {
    const ds = makeDataSource();
    const single = makeFeature({ geometry: { type: 'Point', coordinates: [50, 5] } });
    const result = strategy.renderDetail!(single, fakeCesium, ds);

    expect(result).toBeNull();
    expect(ds.added).toHaveLength(0);
  });
});
