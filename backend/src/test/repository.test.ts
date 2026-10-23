import { Db } from "mongodb";
import { GeoEventRepository } from "../repositories/GeoEventRepository";
import { makeRegistry } from "./helpers/makeRegistry";
import { GeoJSONFeature } from "../types/GeoJSONFeature";
import { EventSearchParams } from "../types/EventSearchParams";

const makeEvent = (id: string, timestamp: number, type = "earthquake"): GeoJSONFeature => ({
  type: "Feature",
  properties: {
    id,
    title: "Test Event",
    eventType: type,
    source: "USGS",
    severity: "Low",
    timestamp,
    location: "Test Location",
  },
  geometry: { type: "Point", coordinates: [0, 0, 0] },
});

const makeDb = (collectionOverrides: Record<string, jest.Mock> = {}): {
  db: Db;
  col: Record<string, jest.Mock>;
} => {
  const toArray = jest.fn().mockResolvedValue([]);
  const limit = jest.fn().mockReturnValue({ toArray });
  const sort = jest.fn().mockReturnValue({ limit });

  const col: Record<string, jest.Mock> = {
    findOne: jest.fn().mockResolvedValue(null),
    find: jest.fn().mockReturnValue({ sort }),
    countDocuments: jest.fn().mockResolvedValue(0),
    estimatedDocumentCount: jest.fn().mockResolvedValue(0),
    insertOne: jest.fn().mockResolvedValue({}),
    bulkWrite: jest.fn().mockResolvedValue({
      upsertedCount: 0,
      modifiedCount: 0,
      matchedCount: 0,
    }),
    createIndex: jest.fn().mockResolvedValue(""),
    ...collectionOverrides,
  };

  const db = { collection: jest.fn().mockReturnValue(col) } as unknown as Db;
  return { db, col };
};

const params = (overrides: Partial<EventSearchParams> = {}): EventSearchParams => ({
  orderby: -1,
  ...overrides,
});

/*-----------------------------------------------------------
  getLastEventTime
------------------------------------------------------------*/
describe("GeoEventRepository.getLastEventTime", () => {
  it("returns null when the collection is empty", async () => {
    const { db } = makeDb({ findOne: jest.fn().mockResolvedValue(null) });
    const repo = new GeoEventRepository(makeRegistry(), db);
    expect(await repo.getLastEventTime("earthquake")).toBeNull();
  });

  it("returns the timestamp of the most recent event", async () => {
    const { db } = makeDb({
      findOne: jest.fn().mockResolvedValue({ properties: { timestamp: 1782123724080 } }),
    });
    const repo = new GeoEventRepository(makeRegistry(), db);
    expect(await repo.getLastEventTime("earthquake")).toBe(1782123724080);
  });
});

/*-----------------------------------------------------------
  isEmpty / countByType
------------------------------------------------------------*/
describe("GeoEventRepository.isEmpty", () => {
  it("returns true when countByType is 0", async () => {
    const { db } = makeDb({ countDocuments: jest.fn().mockResolvedValue(0) });
    const repo = new GeoEventRepository(makeRegistry(), db);
    expect(await repo.isEmpty("earthquake")).toBe(true);
  });

  it("returns false when countByType is greater than 0", async () => {
    const { db } = makeDb({ countDocuments: jest.fn().mockResolvedValue(42) });
    const repo = new GeoEventRepository(makeRegistry(), db);
    expect(await repo.isEmpty("earthquake")).toBe(false);
  });
});

describe("GeoEventRepository.countByType", () => {
  it("calls countDocuments with the correct filter", async () => {
    const { db, col } = makeDb({ countDocuments: jest.fn().mockResolvedValue(7) });
    const repo = new GeoEventRepository(makeRegistry(), db);
    const result = await repo.countByType("earthquake");
    expect(result).toBe(7);
    expect(col.countDocuments).toHaveBeenCalledWith({ "properties.eventType": "earthquake" });
  });
});

/*-----------------------------------------------------------
  findById
------------------------------------------------------------*/
describe("GeoEventRepository.findById", () => {
  it("returns null when the event does not exist", async () => {
    const { db } = makeDb({ findOne: jest.fn().mockResolvedValue(null) });
    const repo = new GeoEventRepository(makeRegistry(), db);
    expect(await repo.findById("non-existent", "USGS")).toBeNull();
  });

  it("returns the event when found", async () => {
    const event = makeEvent("abc123", 1000000);
    const { db } = makeDb({ findOne: jest.fn().mockResolvedValue(event) });
    const repo = new GeoEventRepository(makeRegistry(), db);
    const result = await repo.findById("abc123", "USGS");
    expect(result).toBe(event);
  });

  it("queries by properties.id and properties.source", async () => {
    const findOne = jest.fn().mockResolvedValue(null);
    const { db } = makeDb({ findOne });
    const repo = new GeoEventRepository(makeRegistry(), db);
    await repo.findById("nc26566", "USGS");
    expect(findOne).toHaveBeenCalledWith({
      "properties.id": "nc26566",
      "properties.source": "USGS",
    });
  });
});

/*-----------------------------------------------------------
  getLastEvent
------------------------------------------------------------*/
describe("GeoEventRepository.getLastEvent", () => {
  it("returns null when no events of that type exist", async () => {
    const { db } = makeDb({ findOne: jest.fn().mockResolvedValue(null) });
    const repo = new GeoEventRepository(makeRegistry(), db);
    expect(await repo.getLastEvent("earthquake")).toBeNull();
  });

  it("returns the most recent event of the given type", async () => {
    const event = makeEvent("latest", 9999999);
    const { db } = makeDb({ findOne: jest.fn().mockResolvedValue(event) });
    const repo = new GeoEventRepository(makeRegistry(), db);
    const result = await repo.getLastEvent("earthquake");
    expect(result).toBe(event);
  });
});

/*-----------------------------------------------------------
  getSearchEventsCount
------------------------------------------------------------*/
describe("GeoEventRepository.getSearchEventsCount", () => {
  it("uses estimatedDocumentCount when no filters are applied", async () => {
    const { db, col } = makeDb({
      estimatedDocumentCount: jest.fn().mockResolvedValue(100),
    });
    const repo = new GeoEventRepository(makeRegistry(), db);
    const result = await repo.getSearchEventsCount(params());
    expect(col.estimatedDocumentCount).toHaveBeenCalled();
    expect(result).toBe(100);
  });

  it("uses countDocuments when a filter is present", async () => {
    const { db, col } = makeDb({ countDocuments: jest.fn().mockResolvedValue(3) });
    const repo = new GeoEventRepository(makeRegistry(), db);
    const result = await repo.getSearchEventsCount(params({ minmag: 5 }));
    expect(col.countDocuments).toHaveBeenCalled();
    expect(result).toBe(3);
  });
});

/*-----------------------------------------------------------
  getSearchEvents
------------------------------------------------------------*/
describe("GeoEventRepository.getSearchEvents", () => {
  it("returns the features from the collection", async () => {
    const events = [makeEvent("e1", 1000), makeEvent("e2", 2000)];
    const toArray = jest.fn().mockResolvedValue(events);
    const limit = jest.fn().mockReturnValue({ toArray });
    const sort = jest.fn().mockReturnValue({ limit });
    const find = jest.fn().mockReturnValue({ sort });
    const { db } = makeDb({ find });
    const repo = new GeoEventRepository(makeRegistry(), db);
    const result = await repo.getSearchEvents(params({ limit: 10 }));
    expect(result).toBe(events);
    expect(find).toHaveBeenCalled();
  });
});

/*-----------------------------------------------------------
  insertBatchEvents
------------------------------------------------------------*/
describe("GeoEventRepository.insertBatchEvents", () => {
  it("returns 0 for an empty array without calling bulkWrite", async () => {
    const { db, col } = makeDb();
    const repo = new GeoEventRepository(makeRegistry(), db);
    const result = await repo.insertBatchEvents("earthquake", []);
    expect(result).toBe(0);
    expect(col.bulkWrite).not.toHaveBeenCalled();
  });

  it("returns upsertedCount + modifiedCount", async () => {
    const { db } = makeDb({
      bulkWrite: jest.fn().mockResolvedValue({
        upsertedCount: 3,
        modifiedCount: 2,
        matchedCount: 1,
      }),
    });
    const repo = new GeoEventRepository(makeRegistry(), db);
    const events = [
      makeEvent("a", 1), makeEvent("b", 2), makeEvent("c", 3),
      makeEvent("d", 4), makeEvent("e", 5),
    ];
    const result = await repo.insertBatchEvents("earthquake", events);
    expect(result).toBe(5);
  });

  it("uses upsert for each operation", async () => {
    const bulkWrite = jest.fn().mockResolvedValue({
      upsertedCount: 1,
      modifiedCount: 0,
      matchedCount: 0,
    });
    const { db } = makeDb({ bulkWrite });
    const repo = new GeoEventRepository(makeRegistry(), db);
    await repo.insertBatchEvents("earthquake", [makeEvent("x", 1)]);
    const ops = bulkWrite.mock.calls[0][0];
    expect(ops[0].updateOne.update.$set).toBeDefined();
    expect(ops[0].updateOne.upsert).toBe(true);
    expect(ops[0].updateOne.filter["properties.id"]).toBe("x");
  });
});

/*-----------------------------------------------------------
  ensureIndexes
------------------------------------------------------------*/
describe("GeoEventRepository.ensureIndexes", () => {
  it("creates all expected indexes", async () => {
    const { db, col } = makeDb();
    const repo = new GeoEventRepository(makeRegistry(), db);
    await repo.ensureIndexes();
    expect(col.createIndex).toHaveBeenCalledTimes(5);
  });

  it("creates the cyclone-specific eventType+startTimestamp+timestamp index", async () => {
    const { db, col } = makeDb();
    const repo = new GeoEventRepository(makeRegistry(), db);
    await repo.ensureIndexes();
    expect(col.createIndex).toHaveBeenCalledWith({
      "properties.eventType": 1,
      "properties.startTimestamp": 1,
      "properties.timestamp": 1,
    });
  });
});

/*-----------------------------------------------------------
  _buildQuery (tested indirectly via getSearchEventsCount)
------------------------------------------------------------*/
describe("GeoEventRepository._buildQuery", () => {
  const captureQuery = async (p: Partial<EventSearchParams>): Promise<Record<string, unknown>> => {
    const countDocuments = jest.fn().mockResolvedValue(0);
    const { db } = makeDb({ countDocuments });
    const repo = new GeoEventRepository(makeRegistry(), db);
    await repo.getSearchEventsCount(params(p));
    return countDocuments.mock.calls[0][0] as Record<string, unknown>;
  };

  it("from filter uses $gte on properties.timestamp, scoped per phenomenon once no type is given", async () => {
    // CHANGED by the plugin migration: with no explicit type, every
    // registered phenomenon's own time semantics apply (earthquake exact,
    // cyclone with lag tolerance) — they disagree on what `from` means for
    // the same field, so they can no longer be merged into one flat
    // condition the way the old hardcoded repository logic did. Never hit
    // by the real frontend (it always sends an explicit type list).
    const query = await captureQuery({ from: 1000 });
    const [earthquakeBranch, cycloneBranch] = query.$or as Record<string, unknown>[];
    expect(earthquakeBranch["properties.timestamp"]).toMatchObject({ $gte: 1000 });
    expect(cycloneBranch["properties.timestamp"]).toMatchObject({
      $gte: 1000 - 10 * 24 * 60 * 60 * 1000,
    });
  });

  it("to filter uses $lte on properties.timestamp, scoped per phenomenon once no type is given", async () => {
    const query = await captureQuery({ to: 9000 });
    const [earthquakeBranch, cycloneBranch] = query.$or as Record<string, unknown>[];
    expect(earthquakeBranch["properties.timestamp"]).toMatchObject({ $lte: 9000 });
    expect(cycloneBranch["properties.startTimestamp"]).toMatchObject({ $lte: 9000 });
  });

  it("from and to together do not overwrite each other, scoped per phenomenon once no type is given", async () => {
    const query = await captureQuery({ from: 1000, to: 9000 });
    const [earthquakeBranch, cycloneBranch] = query.$or as Record<string, unknown>[];
    expect(earthquakeBranch["properties.timestamp"]).toMatchObject({ $gte: 1000, $lte: 9000 });
    expect(cycloneBranch["properties.timestamp"]).toMatchObject({
      $gte: 1000 - 10 * 24 * 60 * 60 * 1000,
    });
    expect(cycloneBranch["properties.startTimestamp"]).toMatchObject({ $lte: 9000 });
  });

  it("minmag filter uses $gte on properties.magnitude", async () => {
    const query = await captureQuery({ minmag: 3 });
    expect(query["properties.magnitude"]).toMatchObject({ $gte: 3 });
    expect(query["properties.timestamp"]).toBeUndefined();
  });

  it("maxmag filter uses $lte on properties.magnitude", async () => {
    const query = await captureQuery({ maxmag: 7 });
    expect(query["properties.magnitude"]).toMatchObject({ $lte: 7 });
    expect(query["properties.timestamp"]).toBeUndefined();
  });

  it("minmag and maxmag together are set on properties.magnitude", async () => {
    const query = await captureQuery({ minmag: 2, maxmag: 6 });
    expect(query["properties.magnitude"]).toMatchObject({ $gte: 2, $lte: 6 });
  });

  it("timestamp and magnitude filters coexist without overwriting each other", async () => {
    const query = await captureQuery({ from: 1000, to: 9000, minmag: 2, maxmag: 6 });
    const [earthquakeBranch, cycloneBranch] = query.$or as Record<string, unknown>[];
    expect(earthquakeBranch["properties.timestamp"]).toMatchObject({ $gte: 1000, $lte: 9000 });
    expect(earthquakeBranch["properties.magnitude"]).toMatchObject({ $gte: 2, $lte: 6 });
    expect(cycloneBranch["properties.magnitude"]).toBeUndefined();
  });

  it("minwind filter uses $gte on properties.windSpeed", async () => {
    const query = await captureQuery({ minwind: 34 });
    expect(query["properties.windSpeed"]).toMatchObject({ $gte: 34 });
  });

  it("maxwind filter uses $lte on properties.windSpeed", async () => {
    const query = await captureQuery({ maxwind: 137 });
    expect(query["properties.windSpeed"]).toMatchObject({ $lte: 137 });
  });

  it("minwind and maxwind together are set on properties.windSpeed", async () => {
    const query = await captureQuery({ minwind: 34, maxwind: 137 });
    expect(query["properties.windSpeed"]).toMatchObject({ $gte: 34, $lte: 137 });
  });

  it("category filter uses $in on properties.category", async () => {
    const query = await captureQuery({ category: ["4", "5"] });
    expect(query["properties.category"]).toMatchObject({ $in: ["4", "5"] });
  });

  it("basin filter uses $in on properties.basin", async () => {
    const query = await captureQuery({ basin: ["NA", "WP"] });
    expect(query["properties.basin"]).toMatchObject({ $in: ["NA", "WP"] });
  });

  it("windSpeed and magnitude filters coexist, scoped per phenomenon once no type is given", async () => {
    // CHANGED by the plugin migration: minwind and minmag touch disjoint
    // fields with no collision between phenomena, so merging them flat
    // would still be correct — but the repository decides $or is needed
    // purely from "is there more than one fragment with something to say",
    // without inspecting which fields overlap. A deliberate simplicity
    // trade-off for a path never hit by the real frontend.
    const query = await captureQuery({ minwind: 34, minmag: 2 });
    const [earthquakeBranch, cycloneBranch] = query.$or as Record<string, unknown>[];
    expect(earthquakeBranch["properties.magnitude"]).toMatchObject({ $gte: 2 });
    expect(cycloneBranch["properties.windSpeed"]).toMatchObject({ $gte: 34 });
  });

  it("with an explicit non-cyclone type, time filtering stays exact (unchanged behaviour)", async () => {
    const query = await captureQuery({ from: 1000, to: 9000, type: ["earthquake"] });
    expect(query["properties.timestamp"]).toMatchObject({ $gte: 1000, $lte: 9000 });
    expect(query["properties.eventType"]).toMatchObject({ $in: ["earthquake"] });
    expect(query.$or).toBeUndefined();
  });

  it("cyclone-only search: uses startTimestamp/timestamp overlap, no $or needed", async () => {
    const query = await captureQuery({ from: 1000, to: 9000, type: ["cyclone"] });
    expect(query.$or).toBeUndefined();
    expect(query["properties.eventType"]).toMatchObject({ $in: ["cyclone"] });
    expect(query["properties.timestamp"]).toMatchObject({
      $gte: 1000 - 10 * 24 * 60 * 60 * 1000,
    });
    expect(query["properties.startTimestamp"]).toMatchObject({ $lte: 9000 });
  });

  it("cyclone-only search with only 'to' set: no lag adjustment needed on the missing 'from'", async () => {
    const query = await captureQuery({ to: 9000, type: ["cyclone"] });
    expect(query["properties.timestamp"]).toBeUndefined();
    expect(query["properties.startTimestamp"]).toMatchObject({ $lte: 9000 });
  });

  it("cyclone-only search with only 'from' set does not leak other types in (regression)", async () => {
    // Bug caught before it shipped: without an explicit eventType here, a
    // bare timestamp>=X condition is also satisfied by non-cyclone documents
    // (they have properties.timestamp too), so they'd incorrectly match.
    const query = await captureQuery({ from: 1000, type: ["cyclone"] });
    expect(query["properties.eventType"]).toMatchObject({ $in: ["cyclone"] });
    expect(query["properties.startTimestamp"]).toBeUndefined();
    expect(query["properties.timestamp"]).toMatchObject({
      $gte: 1000 - 10 * 24 * 60 * 60 * 1000,
    });
  });

  it("mixed earthquake+cyclone search: earthquake stays exact, cyclone gets overlap tolerance, via $or", async () => {
    const from = 20 * 24 * 60 * 60 * 1000; // comfortably larger than the 10-day lag, so $gte stays positive
    const to = 30 * 24 * 60 * 60 * 1000;
    const query = await captureQuery({ from, to, type: ["earthquake", "cyclone"] });

    expect(query["properties.timestamp"]).toBeUndefined(); // folded into $or, not top-level
    expect(query["properties.eventType"]).toBeUndefined();
    expect(query.$or).toHaveLength(2);

    const [earthquakeBranch, cycloneBranch] = query.$or as Record<string, unknown>[];
    expect(earthquakeBranch["properties.eventType"]).toMatchObject({ $in: ["earthquake"] });
    expect(earthquakeBranch["properties.timestamp"]).toMatchObject({ $gte: from, $lte: to });

    expect(cycloneBranch["properties.eventType"]).toMatchObject({ $in: ["cyclone"] });
    expect(cycloneBranch["properties.timestamp"]).toMatchObject({
      $gte: from - 10 * 24 * 60 * 60 * 1000,
    });
    expect(cycloneBranch["properties.startTimestamp"]).toMatchObject({ $lte: to });
  });

  it("mixed search without a time window: plain type $in, no $or (nothing to reconcile)", async () => {
    const query = await captureQuery({ type: ["earthquake", "cyclone"] });
    expect(query.$or).toBeUndefined();
    expect(query["properties.eventType"]).toMatchObject({ $in: ["earthquake", "cyclone"] });
  });

  it("regression: category filter in a mixed search no longer excludes earthquakes", async () => {
    // Bug found live: category is cyclone-only, but was applied as a
    // top-level AND across the whole query â€” earthquakes have no category
    // field at all, so they were silently dropped from every mixed search
    // that also filtered by category, not just narrowed on the cyclone side.
    const query = await captureQuery({
      from: 1000,
      to: 9000,
      type: ["earthquake", "cyclone"],
      category: ["TD", "2", "4"],
    });
    expect(query.$or).toHaveLength(2);
    const [earthquakeBranch, cycloneBranch] = query.$or as Record<string, unknown>[];
    expect(earthquakeBranch["properties.category"]).toBeUndefined();
    expect(cycloneBranch["properties.category"]).toMatchObject({
      $in: ["TD", "2", "4"],
    });
  });

  it("regression: minwind/maxwind/basin in a mixed search stay scoped to the cyclone branch", async () => {
    const query = await captureQuery({
      from: 1000,
      to: 9000,
      type: ["earthquake", "cyclone"],
      minwind: 34,
      basin: ["NA"],
    });
    const [earthquakeBranch, cycloneBranch] = query.$or as Record<string, unknown>[];
    expect(earthquakeBranch["properties.windSpeed"]).toBeUndefined();
    expect(earthquakeBranch["properties.basin"]).toBeUndefined();
    expect(cycloneBranch["properties.windSpeed"]).toMatchObject({ $gte: 34 });
    expect(cycloneBranch["properties.basin"]).toMatchObject({ $in: ["NA"] });
  });

  it("regression: magnitude in a mixed search stays scoped to the non-cyclone branch", async () => {
    const query = await captureQuery({
      from: 1000,
      to: 9000,
      type: ["earthquake", "cyclone"],
      minmag: 5,
    });
    const [earthquakeBranch, cycloneBranch] = query.$or as Record<string, unknown>[];
    expect(earthquakeBranch["properties.magnitude"]).toMatchObject({ $gte: 5 });
    expect(cycloneBranch["properties.magnitude"]).toBeUndefined();
  });

  it("category still applies when no type filter is given at all (only cyclones can match, correctly)", async () => {
    const query = await captureQuery({ category: ["4", "5"] });
    expect(query.$or).toBeUndefined();
    expect(query["properties.category"]).toMatchObject({ $in: ["4", "5"] });
  });

  it("category applies without $or when cyclone is the only requested type", async () => {
    const query = await captureQuery({ type: ["cyclone"], category: ["4", "5"] });
    expect(query.$or).toBeUndefined();
    expect(query["properties.category"]).toMatchObject({ $in: ["4", "5"] });
  });

  it("mixed types with no window/magnitude/cyclone-field still avoid $or (nothing to reconcile)", async () => {
    const query = await captureQuery({
      type: ["earthquake", "cyclone"],
      severity: ["High"],
    });
    expect(query.$or).toBeUndefined();
    expect(query["properties.eventType"]).toMatchObject({
      $in: ["earthquake", "cyclone"],
    });
  });

  it("unfiltered search (no type at all): time window is still scoped per phenomenon via $or", async () => {
    // CHANGED by the plugin migration — see the "from filter" test above for
    // why. eventType itself still never appears: "every registered type" is
    // not a real restriction.
    const query = await captureQuery({ from: 1000, to: 9000 });
    expect(query["properties.eventType"]).toBeUndefined();
    const [earthquakeBranch, cycloneBranch] = query.$or as Record<string, unknown>[];
    expect(earthquakeBranch["properties.timestamp"]).toMatchObject({ $gte: 1000, $lte: 9000 });
    expect(cycloneBranch["properties.timestamp"]).toMatchObject({
      $gte: 1000 - 10 * 24 * 60 * 60 * 1000,
    });
  });

  it("position filter builds the correct $geoWithin query", async () => {
    const query = await captureQuery({ position: { lat: 45, lon: 12, radius: 100 } });
    expect(query.geometry).toMatchObject({
      $geoWithin: {
        $centerSphere: [[12, 45], 100 / 6371],
      },
    });
  });

  it("empty params produce an empty query (uses estimatedDocumentCount)", async () => {
    const estimatedDocumentCount = jest.fn().mockResolvedValue(0);
    const { db } = makeDb({ estimatedDocumentCount });
    const repo = new GeoEventRepository(makeRegistry(), db);
    await repo.getSearchEventsCount(params());
    expect(estimatedDocumentCount).toHaveBeenCalled();
  });
});
