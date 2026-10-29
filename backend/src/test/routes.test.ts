import express from "express";
import request from "supertest";
import { GeoEventController } from "../controllers/GeoEventController";
import { makeRegistry } from "./helpers/makeRegistry";
import { SearchValidationError } from "../errors/SearchValidationError";
import { createRouter } from "../routes";
import { EventSearchService } from "../services/EventSearchService";
import { IngestionStatusService } from "../services/IngestionStatusService";
import { IEventReadRepository } from "../repositories/IEventReadRepository";
import { GeoJSONFeature } from "../types/GeoJSONFeature";

const EMPTY_COLLECTION = {
  type: "FeatureCollection",
  metadata: { total: 0, count: 0, limit: 20000, api: "1.0.0" },
  features: [],
};

const makeFeature = (): GeoJSONFeature =>
  ({
    type: "Feature",
    properties: {
      id: "nc123",
      source: "USGS",
      eventType: "earthquake",
      severity: "Low",
    },
    geometry: { type: "Point", coordinates: [0, 0] },
  }) as unknown as GeoJSONFeature;

const makeRepo = (countByType: jest.Mock = jest.fn().mockResolvedValue(0)): IEventReadRepository =>
  ({ countByType } as unknown as IEventReadRepository);

const makeApp = (overrides: Partial<EventSearchService> = {}, status = new IngestionStatusService()) => {
  const service = {
    searchEvents: jest.fn().mockResolvedValue(EMPTY_COLLECTION),
    getEventById: jest.fn().mockResolvedValue(null),
    ...overrides,
  } as unknown as EventSearchService;

  const app = express();
  app.use(express.json());
  app.use(
    "/api/",
    createRouter(new GeoEventController(makeRegistry(), service), status, makeRepo()),
  );
  return { app, service, status };
};

// â”€â”€â”€ GET /api/events/search â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe("GET /api/events/search — routing and response shape", () => {
  it("responds with 200 and Content-Type application/json", async () => {
    const { app } = makeApp();
    await request(app)
      .get("/api/events/search")
      .expect(200)
      .expect("Content-Type", /application\/json/);
  });

  it("response body has type FeatureCollection", async () => {
    const { app } = makeApp();
    const res = await request(app).get("/api/events/search").expect(200);
    expect(res.body.type).toBe("FeatureCollection");
  });

  it("passes numeric query params correctly through the HTTP layer", async () => {
    const { app, service } = makeApp();
    await request(app)
      .get(
        "/api/events/search?minmag=3&maxmag=7&limit=50&from=2020-01-01&to=2020-12-31",
      )
      .expect(200);
    expect(service.searchEvents).toHaveBeenCalledWith(
      expect.objectContaining({
        minmag: 3,
        maxmag: 7,
        limit: 50,
        from: new Date("2020-01-01").getTime(),
        to: new Date("2020-12-31").getTime(),
      }),
    );
  });

  it("parses repeated query params as an array for type filter", async () => {
    const { app, service } = makeApp();
    await request(app)
      .get("/api/events/search?type=earthquake&type=flood")
      .expect(200);
    expect(service.searchEvents).toHaveBeenCalledWith(
      expect.objectContaining({ type: ["earthquake", "flood"] }),
    );
  });

  it("parses repeated query params as an array for severity filter", async () => {
    const { app, service } = makeApp();
    await request(app)
      .get("/api/events/search?severity=low&severity=high")
      .expect(200);
    expect(service.searchEvents).toHaveBeenCalledWith(
      expect.objectContaining({ severity: ["Low", "High"] }),
    );
  });
});

describe("GET /api/events/search — 400 via HTTP", () => {
  it("400 when minmag is not a number", async () => {
    const { app } = makeApp();
    const res = await request(app)
      .get("/api/events/search?minmag=strong")
      .expect(400);
    expect(res.body.error).toBeDefined();
  });

  it("400 when type contains a MongoDB operator", async () => {
    const { app } = makeApp();
    await request(app).get("/api/events/search?type=$where").expect(400);
  });

  it("400 when only lat is provided without lon and radius", async () => {
    const { app } = makeApp();
    await request(app).get("/api/events/search?lat=45").expect(400);
  });

  it("400 when severity is not a valid value", async () => {
    const { app } = makeApp();
    await request(app).get("/api/events/search?severity=extreme").expect(400);
  });

  it("error response body contains a human-readable message", async () => {
    const { app } = makeApp();
    const res = await request(app)
      .get("/api/events/search?minmag=abc")
      .expect(400);
    expect(typeof res.body.error).toBe("string");
    expect(res.body.error.length).toBeGreaterThan(0);
  });
});

describe("GET /api/events/search — 422 and 500 via HTTP", () => {
  it("422 when the service throws SearchValidationError", async () => {
    const { app } = makeApp({
      searchEvents: jest
        .fn()
        .mockRejectedValue(new SearchValidationError("from >= to")),
    });
    const res = await request(app).get("/api/events/search").expect(422);
    expect(res.body.error).toContain("from >= to");
  });

  it("500 when the service throws an unexpected error", async () => {
    const { app } = makeApp({
      searchEvents: jest.fn().mockRejectedValue(new Error("db crash")),
    });
    const res = await request(app).get("/api/events/search").expect(500);
    expect(JSON.stringify(res.body)).not.toContain("db crash");
  });
});

// â”€â”€â”€ GET /api/events/:id â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe("GET /api/events/:id — routing and response shape", () => {
  it("200 and returns the event body when found", async () => {
    const feature = makeFeature();
    const { app } = makeApp({
      getEventById: jest.fn().mockResolvedValue(feature),
    });
    const res = await request(app)
      .get("/api/events/nc123?source=USGS")
      .expect(200);
    expect(res.body.type).toBe("Feature");
  });

  it("passes id and source extracted from path and query to the service", async () => {
    const { app, service } = makeApp();
    await request(app).get("/api/events/nc26566?source=USGS");
    expect(service.getEventById).toHaveBeenCalledWith("nc26566", "USGS");
  });

  it("404 when the service returns null", async () => {
    const { app } = makeApp({
      getEventById: jest.fn().mockResolvedValue(null),
    });
    await request(app).get("/api/events/unknown?source=USGS").expect(404);
  });
});

describe("GET /api/events/:id — 400 via HTTP", () => {
  it("400 when source query param is missing", async () => {
    const { app } = makeApp();
    await request(app).get("/api/events/nc123").expect(400);
  });

  it("400 when id contains special characters", async () => {
    const { app } = makeApp();
    await request(app).get("/api/events/nc123;DROP?source=USGS").expect(400);
  });

  it("400 when source contains a MongoDB operator", async () => {
    const { app } = makeApp();
    await request(app).get("/api/events/nc123?source=$where").expect(400);
  });
});

describe("GET /api/events/:id — 500 via HTTP", () => {
  it("500 when service throws and does not leak error details", async () => {
    const { app } = makeApp({
      getEventById: jest
        .fn()
        .mockRejectedValue(new Error("connection string leaked")),
    });
    const res = await request(app)
      .get("/api/events/nc123?source=USGS")
      .expect(500);
    expect(JSON.stringify(res.body)).not.toContain("connection string leaked");
  });
});

// â”€â”€â”€ GET /api/health â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe("GET /api/health", () => {
  it("responds with 200 and Content-Type application/json", async () => {
    const { app } = makeApp();
    await request(app)
      .get("/api/health")
      .expect(200)
      .expect("Content-Type", /application\/json/);
  });

  it("reports status ok when every tracked type is ready", async () => {
    const status = new IngestionStatusService();
    status.setReady("earthquake");
    status.setReady("cyclone");
    const { app } = makeApp({}, status);

    const res = await request(app).get("/api/health").expect(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.ingestion.earthquake.state).toBe("ready");
    expect(res.body.ingestion.cyclone.state).toBe("ready");
  });

  it("reports status degraded (still 200) when a type has failed", async () => {
    const status = new IngestionStatusService();
    status.setReady("earthquake");
    status.setFailed("cyclone", new Error("NOAA unreachable"));
    const { app } = makeApp({}, status);

    const res = await request(app).get("/api/health").expect(200);
    expect(res.body.status).toBe("degraded");
    expect(res.body.ingestion.cyclone).toMatchObject({
      state: "failed",
      error: "NOAA unreachable",
    });
  });

  it("includes a live per-type document count alongside the load state", async () => {
    const status = new IngestionStatusService();
    status.setReady("earthquake");
    const countByType = jest.fn().mockResolvedValue(4242);
    const app = express();
    app.use(express.json());
    app.use(
      "/api/",
      createRouter(
        new GeoEventController(
          makeRegistry(),
          { searchEvents: jest.fn(), getEventById: jest.fn() } as unknown as EventSearchService,
        ),
        status,
        makeRepo(countByType),
      ),
    );

    const res = await request(app).get("/api/health").expect(200);
    expect(res.body.ingestion.earthquake.count).toBe(4242);
  });

  it("body has status ok", async () => {
    const { app } = makeApp();
    const res = await request(app).get("/api/health").expect(200);
    expect(res.body.status).toBe("ok");
  });

  it("body includes a numeric uptime", async () => {
    const { app } = makeApp();
    const res = await request(app).get("/api/health").expect(200);
    expect(typeof res.body.uptime).toBe("number");
    expect(res.body.uptime).toBeGreaterThanOrEqual(0);
  });

  it("body includes a version string", async () => {
    const { app } = makeApp();
    const res = await request(app).get("/api/health").expect(200);
    expect(typeof res.body.version).toBe("string");
    expect(res.body.version.length).toBeGreaterThan(0);
  });
});

// â”€â”€â”€ Easter egg and unknown routes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe("Easter egg and unknown routes", () => {
  it("GET /api/brew_coffee responds with 418", async () => {
    const { app } = makeApp();
    await request(app).get("/api/brew_coffee").expect(418);
  });

  it("unknown route under /api/ responds with 404", async () => {
    const { app } = makeApp();
    await request(app).get("/api/unknown-endpoint").expect(404);
  });
});
