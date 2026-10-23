import { Request, Response } from "express";
import { GeoEventController } from "../controllers/GeoEventController";
import { makeRegistry } from "./helpers/makeRegistry";
import { SearchValidationError } from "../errors/SearchValidationError";
import { EventSearchService } from "../services/EventSearchService";
import { GeoJSONFeature } from "../types/GeoJSONFeature";
const makeReq = (query: Record<string, unknown> = {}, params: Record<string, string> = {}): Request =>
  ({ query, params } as unknown as Request);

const makeRes = (): { res: Response; json: jest.Mock; status: jest.Mock } => {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const res = { status, json } as unknown as Response;
  return { res, json, status };
};

const makeService = (result = {}): EventSearchService =>
  ({ searchEvents: jest.fn().mockResolvedValue(result) } as unknown as EventSearchService);

const makeEventReq = (id: string, source?: string): Request =>
  makeReq(source ? { source } : {}, { id });

const makeFullService = (overrides: Partial<EventSearchService> = {}): EventSearchService =>
  ({
    searchEvents: jest.fn().mockResolvedValue({}),
    getEventById: jest.fn().mockResolvedValue(null),
    ...overrides,
  }) as unknown as EventSearchService;

describe("GeoEventController.getEventById - valid input", () => {
  it("responds with 200 and the event when found", async () => {
    const event = { type: "Feature" } as unknown as GeoJSONFeature;
    const service = makeFullService({ getEventById: jest.fn().mockResolvedValue(event) });
    const controller = new GeoEventController(makeRegistry(), service);
    const { res, status, json } = makeRes();

    await controller.getEventById(makeEventReq("nc26566", "USGS"), res);

    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith(event);
  });

  it("responds with 404 when event is not found", async () => {
    const service = makeFullService({ getEventById: jest.fn().mockResolvedValue(null) });
    const controller = new GeoEventController(makeRegistry(), service);
    const { res, status } = makeRes();

    await controller.getEventById(makeEventReq("unknown", "USGS"), res);

    expect(status).toHaveBeenCalledWith(404);
  });

  it("passes id and source to the service", async () => {
    const getEventById = jest.fn().mockResolvedValue(null);
    const service = makeFullService({ getEventById });
    const controller = new GeoEventController(makeRegistry(), service);
    const { res } = makeRes();

    await controller.getEventById(makeEventReq("nc26566", "USGS"), res);

    expect(getEventById).toHaveBeenCalledWith("nc26566", "USGS");
  });
});

describe("GeoEventController.getEventById - 400 for invalid input", () => {
  it("400 when id is missing", async () => {
    const controller = new GeoEventController(makeRegistry(), makeFullService());
    const { res, status } = makeRes();
    await controller.getEventById(makeReq({ source: "USGS" }, {}), res);
    expect(status).toHaveBeenCalledWith(400);
  });

  it("400 when source is missing", async () => {
    const controller = new GeoEventController(makeRegistry(), makeFullService());
    const { res, status } = makeRes();
    await controller.getEventById(makeEventReq("nc26566"), res);
    expect(status).toHaveBeenCalledWith(400);
  });

  it("400 when id contains invalid characters", async () => {
    const controller = new GeoEventController(makeRegistry(), makeFullService());
    const { res, status } = makeRes();
    await controller.getEventById(makeEventReq("nc265; DROP TABLE", "USGS"), res);
    expect(status).toHaveBeenCalledWith(400);
  });

  it("400 when source contains invalid characters", async () => {
    const controller = new GeoEventController(makeRegistry(), makeFullService());
    const { res, status } = makeRes();
    await controller.getEventById(makeEventReq("nc26566", "$where"), res);
    expect(status).toHaveBeenCalledWith(400);
  });
});

describe("GeoEventController.getEventById - 500 on service error", () => {
  it("responds with 500 when the service throws", async () => {
    const service = makeFullService({
      getEventById: jest.fn().mockRejectedValue(new Error("db crash")),
    });
    const controller = new GeoEventController(makeRegistry(), service);
    const { res, status } = makeRes();

    await controller.getEventById(makeEventReq("nc26566", "USGS"), res);

    expect(status).toHaveBeenCalledWith(500);
  });
});

describe("GeoEventController.getSearchEvents - valid input", () => {
  it("responds with 200 and service data", async () => {
    const data = { type: "FeatureCollection", features: [] };
    const service = makeService(data);
    const controller = new GeoEventController(makeRegistry(), service);
    const { res, status } = makeRes();

    await controller.getSearchEvents(makeReq(), res);

    expect(status).toHaveBeenCalledWith(200);
    expect(service.searchEvents).toHaveBeenCalled();
  });

  it("correctly passes numeric parameters to the service", async () => {
    const service = makeService();
    const controller = new GeoEventController(makeRegistry(), service);
    const { res } = makeRes();

    await controller.getSearchEvents(
      makeReq({ from: "2020-01-01", to: "2020-12-31", minmag: "3", maxmag: "7", limit: "50" }),
      res,
    );

    expect(service.searchEvents).toHaveBeenCalledWith(
      expect.objectContaining({ from: new Date("2020-01-01").getTime(), to: new Date("2020-12-31").getTime(), minmag: 3, maxmag: 7, limit: 50 }),
    );
  });

  it("sets orderby to 1 when 'asc' is provided", async () => {
    const service = makeService();
    const controller = new GeoEventController(makeRegistry(), service);
    const { res } = makeRes();
    await controller.getSearchEvents(makeReq({ orderby: "asc" }), res);
    expect(service.searchEvents).toHaveBeenCalledWith(expect.objectContaining({ orderby: 1 }));
  });

  it("defaults orderby to -1 for any other value", async () => {
    const service = makeService();
    const controller = new GeoEventController(makeRegistry(), service);
    const { res } = makeRes();
    await controller.getSearchEvents(makeReq({ orderby: "desc" }), res);
    expect(service.searchEvents).toHaveBeenCalledWith(expect.objectContaining({ orderby: -1 }));
  });

  it("accepts type as a single string", async () => {
    const service = makeService();
    const controller = new GeoEventController(makeRegistry(), service);
    const { res } = makeRes();
    await controller.getSearchEvents(makeReq({ type: "earthquake" }), res);
    expect(service.searchEvents).toHaveBeenCalledWith(
      expect.objectContaining({ type: ["earthquake"] }),
    );
  });

  it("accepts type as an array of strings", async () => {
    const service = makeService();
    const controller = new GeoEventController(makeRegistry(), service);
    const { res } = makeRes();
    await controller.getSearchEvents(makeReq({ type: ["earthquake", "flood"] }), res);
    expect(service.searchEvents).toHaveBeenCalledWith(
      expect.objectContaining({ type: ["earthquake", "flood"] }),
    );
  });

  it("builds position when lat, lon and radius are all present", async () => {
    const service = makeService();
    const controller = new GeoEventController(makeRegistry(), service);
    const { res } = makeRes();
    await controller.getSearchEvents(makeReq({ lat: "45", lon: "12", radius: "100" }), res);
    expect(service.searchEvents).toHaveBeenCalledWith(
      expect.objectContaining({ position: { lat: 45, lon: 12, radius: 100 } }),
    );
  });

  it("leaves position undefined when lat/lon/radius are absent", async () => {
    const service = makeService();
    const controller = new GeoEventController(makeRegistry(), service);
    const { res } = makeRes();
    await controller.getSearchEvents(makeReq({}), res);
    expect(service.searchEvents).toHaveBeenCalledWith(
      expect.objectContaining({ position: undefined }),
    );
  });
});

describe("GeoEventController.getSearchEvents - 400 for invalid input", () => {
  const expect400 = async (query: Record<string, unknown>) => {
    const controller = new GeoEventController(makeRegistry(), makeService());
    const { res, status } = makeRes();
    await controller.getSearchEvents(makeReq(query), res);
    expect(status).toHaveBeenCalledWith(400);
  };

  it("400 when from is not a valid date", async () => {
    await expect400({ from: "not-a-date" });
  });

  it("400 when to is not a valid date", async () => {
    await expect400({ to: "not-a-date" });
  });

  it("400 when minmag is not a number", async () => {
    await expect400({ minmag: "strong" });
  });

  it("400 when maxmag is not a number", async () => {
    await expect400({ maxmag: "NaN" });
  });

  it("400 when limit is not a number", async () => {
    await expect400({ limit: "many" });
  });

  it("400 when from is a plain number string (not ISO 8601)", async () => {
    await expect400({ from: "1704067200000" });
  });

  it("400 when type contains a MongoDB operator ($where)", async () => {
    await expect400({ type: "$where" });
  });

  it("400 when type contains special characters", async () => {
    await expect400({ type: "earthquake; DROP TABLE events" });
  });

  it("400 when type exceeds 50 characters", async () => {
    await expect400({ type: "a".repeat(51) });
  });

  it("400 when lat is present but lon and radius are missing", async () => {
    await expect400({ lat: "45" });
  });

  it("400 when radius is zero", async () => {
    await expect400({ lat: "45", lon: "12", radius: "0" });
  });

  it("400 when radius is negative", async () => {
    await expect400({ lat: "45", lon: "12", radius: "-10" });
  });

  it("400 when lat is not a number", async () => {
    await expect400({ lat: "north", lon: "12", radius: "100" });
  });

  it("400 when severity contains an invalid value", async () => {
    await expect400({ severity: "extreme" });
  });

  it("400 when severity contains a MongoDB operator", async () => {
    await expect400({ severity: "$where" });
  });

  it("400 when minwind is not a number", async () => {
    await expect400({ minwind: "strong" });
  });

  it("400 when maxwind is not a number", async () => {
    await expect400({ maxwind: "NaN" });
  });

  it("400 when category contains an invalid value", async () => {
    await expect400({ category: "super" });
  });

  it("400 when category contains a MongoDB operator", async () => {
    await expect400({ category: "$where" });
  });

  it("400 when basin contains an invalid value", async () => {
    await expect400({ basin: "ZZ" });
  });
});

describe("GeoEventController.getSearchEvents - severity filter", () => {
  it("normalises lowercase severity to proper case", async () => {
    const service = makeService();
    const controller = new GeoEventController(makeRegistry(), service);
    const { res } = makeRes();
    await controller.getSearchEvents(makeReq({ severity: "low" }), res);
    expect(service.searchEvents).toHaveBeenCalledWith(
      expect.objectContaining({ severity: ["Low"] }),
    );
  });

  it("accepts severity as an array", async () => {
    const service = makeService();
    const controller = new GeoEventController(makeRegistry(), service);
    const { res } = makeRes();
    await controller.getSearchEvents(makeReq({ severity: ["low", "HIGH"] }), res);
    expect(service.searchEvents).toHaveBeenCalledWith(
      expect.objectContaining({ severity: ["Low", "High"] }),
    );
  });

  it("passes severity undefined when not provided", async () => {
    const service = makeService();
    const controller = new GeoEventController(makeRegistry(), service);
    const { res } = makeRes();
    await controller.getSearchEvents(makeReq({}), res);
    expect(service.searchEvents).toHaveBeenCalledWith(
      expect.objectContaining({ severity: undefined }),
    );
  });
});

describe("GeoEventController.getSearchEvents - cyclone-specific filters", () => {
  it("passes minwind/maxwind through as numbers", async () => {
    const service = makeService();
    const controller = new GeoEventController(makeRegistry(), service);
    const { res } = makeRes();
    await controller.getSearchEvents(makeReq({ minwind: "34", maxwind: "137" }), res);
    expect(service.searchEvents).toHaveBeenCalledWith(
      expect.objectContaining({ minwind: 34, maxwind: 137 }),
    );
  });

  it("accepts category as a single string or an array", async () => {
    const service = makeService();
    const controller = new GeoEventController(makeRegistry(), service);
    const { res } = makeRes();
    await controller.getSearchEvents(makeReq({ category: ["4", "5"] }), res);
    expect(service.searchEvents).toHaveBeenCalledWith(
      expect.objectContaining({ category: ["4", "5"] }),
    );
  });

  it("accepts basin as a single string", async () => {
    const service = makeService();
    const controller = new GeoEventController(makeRegistry(), service);
    const { res } = makeRes();
    await controller.getSearchEvents(makeReq({ basin: "NA" }), res);
    expect(service.searchEvents).toHaveBeenCalledWith(
      expect.objectContaining({ basin: ["NA"] }),
    );
  });

  it("passes category/basin undefined when not provided", async () => {
    const service = makeService();
    const controller = new GeoEventController(makeRegistry(), service);
    const { res } = makeRes();
    await controller.getSearchEvents(makeReq({}), res);
    expect(service.searchEvents).toHaveBeenCalledWith(
      expect.objectContaining({ category: undefined, basin: undefined }),
    );
  });
});

describe("GeoEventController.getSearchEvents - 422 on semantic validation error", () => {
  it("responds with 422 when service throws SearchValidationError", async () => {
    const service = {
      searchEvents: jest.fn().mockRejectedValue(
        new SearchValidationError("time from >= end"),
      ),
    } as unknown as EventSearchService;
    const controller = new GeoEventController(makeRegistry(), service);
    const { res, status } = makeRes();

    await controller.getSearchEvents(makeReq(), res);

    expect(status).toHaveBeenCalledWith(422);
  });

  it("includes the validation message in the 422 response", async () => {
    const service = {
      searchEvents: jest.fn().mockRejectedValue(
        new SearchValidationError("magnitude min >= max"),
      ),
    } as unknown as EventSearchService;
    const controller = new GeoEventController(makeRegistry(), service);
    const { res, json } = makeRes();

    await controller.getSearchEvents(makeReq(), res);

    const body = json.mock.calls[0][0] as Record<string, unknown>;
    expect(body.error).toContain("magnitude min >= max");
  });

  it("does not respond with 500 for a SearchValidationError", async () => {
    const service = {
      searchEvents: jest.fn().mockRejectedValue(
        new SearchValidationError("any"),
      ),
    } as unknown as EventSearchService;
    const controller = new GeoEventController(makeRegistry(), service);
    const { res, status } = makeRes();

    await controller.getSearchEvents(makeReq(), res);

    expect(status).not.toHaveBeenCalledWith(500);
  });
});

describe("GeoEventController.getSearchEvents - 500 on service error", () => {
  it("responds with 500 when the service throws an unexpected error", async () => {
    const service = {
      searchEvents: jest.fn().mockRejectedValue(new Error("db crash")),
    } as unknown as EventSearchService;
    const controller = new GeoEventController(makeRegistry(), service);
    const { res, status } = makeRes();

    await controller.getSearchEvents(makeReq(), res);

    expect(status).toHaveBeenCalledWith(500);
  });

  it("does not expose internal error details in the response", async () => {
    const service = {
      searchEvents: jest.fn().mockRejectedValue(new Error("connection string leaked")),
    } as unknown as EventSearchService;
    const controller = new GeoEventController(makeRegistry(), service);
    const { res, status, json } = makeRes();

    await controller.getSearchEvents(makeReq(), res);

    expect(status).toHaveBeenCalledWith(500);
    const body = json.mock.calls[0][0] as Record<string, unknown>;
    expect(JSON.stringify(body)).not.toContain("connection string leaked");
  });
});
