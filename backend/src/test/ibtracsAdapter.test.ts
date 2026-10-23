import { IBTrACSAdapter } from "../adapters/IBTrACSAdapter";
import { GeoJSONGeometry } from "../types/GeoJSONGeometry";
import { IBTrACSCsvInput, IBTrACSCsvRow } from "../types/IBTrACSCsv";

type RowInput = Partial<Record<string, string | number | null>>;

const cell = (v: string | number | null | undefined): string =>
  v === null || v === undefined ? "" : String(v);

const makeRow = (overrides: RowInput = {}): IBTrACSCsvRow => {
  const defaults: Record<string, string | number | null> = {
    SID: "2024276N09165",
    NAME: "MILTON",
    SEASON: 2024,
    BASIN: "NA",
    ISO_TIME: "2024-10-05 18:00:00",
    LAT: 18.7,
    LON: -83.4,
    USA_WIND: 35,
    USA_PRES: 1005,
    USA_RMW: null,
    WMO_WIND: 30,
    WMO_PRES: 1006,
  };
  const merged = { ...defaults, ...overrides };
  const row: IBTrACSCsvRow = {};
  for (const [k, v] of Object.entries(merged)) row[k] = cell(v);
  return row;
};

const makeInput = (rows: IBTrACSCsvRow[], from?: number): IBTrACSCsvInput => ({
  rows,
  from,
});

describe("IBTrACSAdapter.toGeoJSON", () => {
  let adapter: IBTrACSAdapter;

  beforeEach(() => {
    adapter = new IBTrACSAdapter();
  });

  it("builds a Point (not a LineString) for a storm observed only once", () => {
    const result = adapter.toGeoJSON(makeInput([makeRow()]));

    expect(result).toHaveLength(1);
    expect(result[0].geometry.type).toBe("Point");
    expect(result[0].geometry.coordinates).toEqual([-83.4, 18.7]);
  });

  it("groups multiple rows with the same SID into one LineString Feature", () => {
    const rows = [
      makeRow({ ISO_TIME: "2024-10-05 12:00:00", LAT: 17.0, LON: -85.0 }),
      makeRow({ ISO_TIME: "2024-10-05 18:00:00", LAT: 18.7, LON: -83.4 }),
      makeRow({ ISO_TIME: "2024-10-06 00:00:00", LAT: 20.1, LON: -82.0 }),
    ];
    const result = adapter.toGeoJSON(makeInput(rows));

    expect(result).toHaveLength(1);
    const geometry = result[0].geometry as Extract<
      GeoJSONGeometry,
      { type: "LineString" }
    >;
    expect(geometry.type).toBe("LineString");
    expect(geometry.coordinates).toEqual([
      [-85.0, 17.0],
      [-83.4, 18.7],
      [-82.0, 20.1],
    ]);
  });

  it("orders track points chronologically regardless of input order", () => {
    const rows = [
      makeRow({ ISO_TIME: "2024-10-06 00:00:00" }),
      makeRow({ ISO_TIME: "2024-10-05 00:00:00" }),
    ];
    const result = adapter.toGeoJSON(makeInput(rows));

    expect(result[0].properties.track?.map((p) => p.timestamp)).toEqual([
      Date.parse("2024-10-05T00:00:00Z"),
      Date.parse("2024-10-06T00:00:00Z"),
    ]);
  });

  it("keeps separate storms (different SID) as separate Features", () => {
    const rows = [makeRow({ SID: "AL01" }), makeRow({ SID: "AL02" })];
    const result = adapter.toGeoJSON(makeInput(rows));

    expect(result).toHaveLength(2);
    expect(result.map((f) => f.properties.id).sort()).toEqual(["AL01", "AL02"]);
  });

  it("sets properties.timestamp to the most recent point (drives the ingestion cursor)", () => {
    const rows = [
      makeRow({ ISO_TIME: "2024-10-05 00:00:00" }),
      makeRow({ ISO_TIME: "2024-10-07 00:00:00" }),
    ];
    const result = adapter.toGeoJSON(makeInput(rows));
    expect(result[0].properties.timestamp).toBe(
      Date.parse("2024-10-07T00:00:00Z"),
    );
  });

  it("sets properties.startTimestamp to the earliest point (drives time-window overlap search)", () => {
    const rows = [
      makeRow({ ISO_TIME: "2024-10-05 00:00:00" }),
      makeRow({ ISO_TIME: "2024-10-07 00:00:00" }),
    ];
    const result = adapter.toGeoJSON(makeInput(rows));
    expect(result[0].properties.startTimestamp).toBe(
      Date.parse("2024-10-05T00:00:00Z"),
    );
  });

  it("windSpeed is the peak across all points, not the last one", () => {
    const rows = [
      makeRow({ USA_WIND: 40 }),
      makeRow({ USA_WIND: 90 }),
      makeRow({ USA_WIND: 60 }),
    ];
    const result = adapter.toGeoJSON(makeInput(rows));
    expect(result[0].properties.windSpeed).toBe(90);
  });

  it("pressure is the minimum across all points (most intense)", () => {
    const rows = [
      makeRow({ USA_PRES: 1005 }),
      makeRow({ USA_PRES: 970 }),
      makeRow({ USA_PRES: 990 }),
    ];
    const result = adapter.toGeoJSON(makeInput(rows));
    expect(result[0].properties.pressure).toBe(970);
  });

  it("falls back to WMO_WIND/WMO_PRES when USA_* is blank", () => {
    const result = adapter.toGeoJSON(
      makeInput([makeRow({ USA_WIND: null, USA_PRES: null, WMO_WIND: 55, WMO_PRES: 985 })]),
    );
    expect(result[0].properties.windSpeed).toBe(55);
    expect(result[0].properties.pressure).toBe(985);
  });

  it.each([
    [20, "TD"],
    [34, "TS"],
    [64, "1"],
    [83, "2"],
    [96, "3"],
    [113, "4"],
    [140, "5"],
  ])("classifies peak wind %s kt as category %s", (wind, expected) => {
    const result = adapter.toGeoJSON(makeInput([makeRow({ USA_WIND: wind })]));
    expect(result[0].properties.category).toBe(expected);
  });

  it("maps category to the shared Low/Medium/High severity scale", () => {
    const low = adapter.toGeoJSON(makeInput([makeRow({ USA_WIND: 30 })]));
    const medium = adapter.toGeoJSON(makeInput([makeRow({ USA_WIND: 70 })]));
    const high = adapter.toGeoJSON(makeInput([makeRow({ USA_WIND: 140 })]));
    expect(low[0].properties.severity).toBe("Low");
    expect(medium[0].properties.severity).toBe("Medium");
    expect(high[0].properties.severity).toBe("High");
  });

  it("resolves a known basin code to a readable name", () => {
    const result = adapter.toGeoJSON(makeInput([makeRow({ BASIN: "WP" })]));
    expect(result[0].properties.location).toBe("Western Pacific");
  });

  it("falls back to the raw code for an unknown basin", () => {
    const result = adapter.toGeoJSON(makeInput([makeRow({ BASIN: "ZZ" })]));
    expect(result[0].properties.location).toBe("ZZ");
  });

  it("discards a row with a missing SID", () => {
    const result = adapter.toGeoJSON(makeInput([makeRow({ SID: "" })]));
    expect(result).toHaveLength(0);
  });

  it("discards a row with an invalid ISO_TIME", () => {
    const result = adapter.toGeoJSON(makeInput([makeRow({ ISO_TIME: "not-a-date" })]));
    expect(result).toHaveLength(0);
  });

  it("discards only invalid rows and keeps the rest grouped correctly", () => {
    const rows = [
      makeRow({ SID: "" }),
      makeRow({ SID: "AL01", ISO_TIME: "2024-10-05 00:00:00" }),
      makeRow({ SID: "AL01", ISO_TIME: "2024-10-06 00:00:00" }),
    ];
    const result = adapter.toGeoJSON(makeInput(rows));
    expect(result).toHaveLength(1);
    expect(result[0].geometry.type).toBe("LineString");
  });

  it("returns an empty array for an empty row set", () => {
    expect(adapter.toGeoJSON(makeInput([]))).toEqual([]);
  });

  it("wraps a track crossing the antimeridian back into the valid -180..180 range", () => {
    // IBTrACS lets longitude run past 180° to keep an antimeridian-crossing
    // track numerically continuous (real case: Gabrielle 2023). MongoDB's
    // 2dsphere index rejects the whole write if any point is out of range.
    const rows = [
      makeRow({ ISO_TIME: "2023-02-12 00:00:00", LON: 179.4 }),
      makeRow({ ISO_TIME: "2023-02-12 06:00:00", LON: 180.4 }),
      makeRow({ ISO_TIME: "2023-02-12 12:00:00", LON: 186.4 }),
    ];
    const result = adapter.toGeoJSON(makeInput(rows));
    const geometry = result[0].geometry as Extract<
      GeoJSONGeometry,
      { type: "LineString" }
    >;
    for (const [lon] of geometry.coordinates) {
      expect(lon).toBeGreaterThanOrEqual(-180);
      expect(lon).toBeLessThanOrEqual(180);
    }
    const lons = geometry.coordinates.map((c) => c[0]);
    [179.4, -179.6, -173.6].forEach((expected, i) => {
      expect(lons[i]).toBeCloseTo(expected, 9);
    });
  });

  describe("from filtering", () => {
    it("excludes a storm with no point at/after 'from'", () => {
      const rows = [makeRow({ SID: "OLD01", ISO_TIME: "2024-01-01 00:00:00" })];
      const result = adapter.toGeoJSON(
        makeInput(rows, Date.parse("2024-06-01T00:00:00Z")),
      );
      expect(result).toHaveLength(0);
    });

    it("includes a storm with at least one point at/after 'from', with its FULL track", () => {
      const rows = [
        makeRow({ SID: "S1", ISO_TIME: "2024-01-01 00:00:00" }),
        makeRow({ SID: "S1", ISO_TIME: "2024-06-15 00:00:00" }),
      ];
      const result = adapter.toGeoJSON(
        makeInput(rows, Date.parse("2024-06-01T00:00:00Z")),
      );
      expect(result).toHaveLength(1);
      expect(result[0].properties.track).toHaveLength(2); // full history, not just the new point
    });

    it("includes everything when 'from' is undefined (full reconstruction)", () => {
      const rows = [makeRow({ SID: "OLD01", ISO_TIME: "2000-01-01 00:00:00" })];
      const result = adapter.toGeoJSON(makeInput(rows, undefined));
      expect(result).toHaveLength(1);
    });
  });
});

describe("IBTrACSAdapter.getEventType", () => {
  it("returns 'cyclone'", () => {
    expect(new IBTrACSAdapter().getEventType()).toBe("cyclone");
  });
});
