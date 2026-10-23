import { USGSAdapter } from "../adapters/USGSAdapter";
import { USGSFeature, USGSResponse } from "../types/USGSResponse";

const makeFeature = (
  id: string,
  mag: number,
  opts: { place?: string; time?: number; url?: string; title?: string } = {},
): USGSFeature => ({
  type: "Feature",
  id,
  properties: {
    id,
    mag,
    place: opts.place ?? "test place",
    time: opts.time ?? 1000000,
    url: opts.url ?? "http://test.com",
    title: opts.title ?? "Test Title",
  },
  geometry: { type: "Point", coordinates: [0, 0, 0] },
});

const makeResponse = (features: USGSFeature[]): USGSResponse =>
  ({ features }) as USGSResponse;

describe("USGSAdapter.toGeoJSON", () => {
  let adapter: USGSAdapter;

  beforeEach(() => {
    adapter = new USGSAdapter();
  });

  it("correctly converts a USGS feature to GeoJSONFeature", () => {
    const data = makeResponse([
      makeFeature("nc26566", 1.04, {
        place: "27 km W of Coalinga, California",
        time: 462566988730,
        url: "https://earthquake.usgs.gov/...",
        title: "M 1.0 - 27 km W of Coalinga",
      }),
    ]);

    const result = adapter.toGeoJSON(data);

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("Feature");
    expect(result[0].properties.id).toBe("nc26566");
    expect(result[0].properties.source).toBe("USGS");
    expect(result[0].properties.eventType).toBe("earthquake");
    expect(result[0].properties.location).toBe("27 km W of Coalinga, California");
    expect(result[0].properties.timestamp).toBe(462566988730);
    expect(result[0].geometry.coordinates).toEqual([0, 0, 0]);
  });

  it("discards feature with empty id", () => {
    const data = makeResponse([makeFeature("", 1.0)]);
    expect(adapter.toGeoJSON(data)).toHaveLength(0);
  });

  it("discards feature with undefined id", () => {
    const feature = {
      ...makeFeature("x", 1.0),
      id: undefined,
    } as unknown as USGSFeature;
    expect(adapter.toGeoJSON(makeResponse([feature]))).toHaveLength(0);
  });

  it("discards feature with null properties", () => {
    const feature = {
      ...makeFeature("abc", 1.0),
      properties: null,
    } as unknown as USGSFeature;
    expect(adapter.toGeoJSON(makeResponse([feature]))).toHaveLength(0);
  });

  it("severity is Low for mag < 4", () => {
    const result = adapter.toGeoJSON(makeResponse([makeFeature("a1", 3.9)]));
    expect(result[0].properties.severity).toBe("Low");
  });

  it("severity is Low for mag = 0", () => {
    const result = adapter.toGeoJSON(makeResponse([makeFeature("a2", 0)]));
    expect(result[0].properties.severity).toBe("Low");
  });

  it("severity is Medium at boundary mag = 4", () => {
    const result = adapter.toGeoJSON(makeResponse([makeFeature("a3", 4.0)]));
    expect(result[0].properties.severity).toBe("Medium");
  });

  it("severity is Medium for mag between 4 and 5.9", () => {
    const result = adapter.toGeoJSON(makeResponse([makeFeature("a4", 5.5)]));
    expect(result[0].properties.severity).toBe("Medium");
  });

  it("severity is High at boundary mag = 6", () => {
    const result = adapter.toGeoJSON(makeResponse([makeFeature("a5", 6.0)]));
    expect(result[0].properties.severity).toBe("High");
  });

  it("severity is High for mag > 6", () => {
    const result = adapter.toGeoJSON(makeResponse([makeFeature("a6", 8.5)]));
    expect(result[0].properties.severity).toBe("High");
  });

  it("falls back to 'missing-title' when title is undefined", () => {
    const feature = makeFeature("b1", 1.0);
    (feature.properties as unknown as Record<string, unknown>).title =
      undefined;
    const result = adapter.toGeoJSON(makeResponse([feature]));
    expect(result[0].properties.title).toBe("missing-title");
  });

  it("falls back to 'missing-place' when place is undefined", () => {
    const feature = makeFeature("b2", 1.0);
    (feature.properties as unknown as Record<string, unknown>).place =
      undefined;
    const result = adapter.toGeoJSON(makeResponse([feature]));
    expect(result[0].properties.location).toBe("missing-place");
  });

  it("returns an empty array for an empty features list", () => {
    expect(adapter.toGeoJSON(makeResponse([]))).toEqual([]);
  });

  it("correctly converts multiple features", () => {
    const data = makeResponse([
      makeFeature("f1", 1.0, { place: "a", time: 10 }),
      makeFeature("f2", 5.0, { place: "b", time: 20 }),
      makeFeature("f3", 7.0, { place: "c", time: 30 }),
    ]);
    const result = adapter.toGeoJSON(data);
    expect(result).toHaveLength(3);
    expect(result.map((r) => r.properties.id)).toEqual(["f1", "f2", "f3"]);
    expect(result.map((r) => r.properties.severity)).toEqual([
      "Low",
      "Medium",
      "High",
    ]);
  });

  it("discards only invalid features and keeps valid ones", () => {
    const data = makeResponse([
      makeFeature("", 1.0),
      makeFeature("valid", 2.0),
    ]);
    const result = adapter.toGeoJSON(data);
    expect(result).toHaveLength(1);
    expect(result[0].properties.id).toBe("valid");
  });
});

describe("USGSAdapter.getEventType", () => {
  it("returns 'earthquake'", () => {
    expect(new USGSAdapter().getEventType()).toBe("earthquake");
  });
});
