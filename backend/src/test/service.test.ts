import { RESTConfig } from "../configs/RESTConfig";
import { GeoJSONCollectionDto } from "../dtos/GeoJSONCollectionDto";
import { SearchValidationError } from "../errors/SearchValidationError";
import { IEventReadRepository } from "../repositories/IEventReadRepository";
import { EventSearchService } from "../services/EventSearchService";
import { makeRegistry } from "./helpers/makeRegistry";
import { EventSearchParams } from "../types/EventSearchParams";
import { GeoJSONFeature } from "../types/GeoJSONFeature";

const makeRepo = (
  overrides: Partial<IEventReadRepository> = {},
): IEventReadRepository => ({
  isEmpty: jest.fn().mockResolvedValue(false),
  findById: jest.fn().mockResolvedValue(null),
  count: jest.fn().mockResolvedValue(0),
  countByType: jest.fn().mockResolvedValue(0),
  getLastEvent: jest.fn().mockResolvedValue(null),
  getLastEventTime: jest.fn().mockResolvedValue(null),
  getDailyEvents: jest.fn().mockResolvedValue([]),
  getSearchEvents: jest.fn().mockResolvedValue([]),
  getSearchEventsCount: jest.fn().mockResolvedValue(0),
  ...overrides,
});

const makeDto = (): GeoJSONCollectionDto =>
  ({
    toCollection: jest.fn().mockReturnValue({
      type: "FeatureCollection",
      metadata: { total: 0, count: 0, limit: 0, api: "0.0.0" },
      features: [],
    }),
  }) as unknown as GeoJSONCollectionDto;

const params = (
  overrides: Partial<EventSearchParams> = {},
): EventSearchParams => ({
  orderby: -1,
  ...overrides,
});

describe("EventSearchService - limit validation", () => {
  it("caps limit to maximum when exceeded", async () => {
    const repo = makeRepo();
    const service = new EventSearchService(makeRegistry(), repo, makeDto());
    await service.searchEvents(params({ limit: 999999 }));
    expect(repo.getSearchEvents).toHaveBeenCalledWith(
      expect.objectContaining({ limit: RESTConfig.LIMIT }),
    );
  });

  it("sets limit to 1 when below 1", async () => {
    const repo = makeRepo();
    const service = new EventSearchService(makeRegistry(), repo, makeDto());
    await service.searchEvents(params({ limit: 0 }));
    expect(repo.getSearchEvents).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 1 }),
    );
  });

  it("sets limit to maximum when undefined", async () => {
    const repo = makeRepo();
    const service = new EventSearchService(makeRegistry(), repo, makeDto());
    await service.searchEvents(params({ limit: undefined }));
    expect(repo.getSearchEvents).toHaveBeenCalledWith(
      expect.objectContaining({ limit: RESTConfig.LIMIT }),
    );
  });
});

describe("EventSearchService - orderby validation", () => {
  it("defaults orderby to -1 when undefined", async () => {
    const repo = makeRepo();
    const service = new EventSearchService(makeRegistry(), repo, makeDto());
    await service.searchEvents({ orderby: undefined as unknown as 1 | -1 });
    expect(repo.getSearchEvents).toHaveBeenCalledWith(
      expect.objectContaining({ orderby: -1 }),
    );
  });

  it("preserves orderby 1 when explicitly set", async () => {
    const repo = makeRepo();
    const service = new EventSearchService(makeRegistry(), repo, makeDto());
    await service.searchEvents(params({ orderby: 1 }));
    expect(repo.getSearchEvents).toHaveBeenCalledWith(
      expect.objectContaining({ orderby: 1 }),
    );
  });

  it("preserves orderby -1 when explicitly set", async () => {
    const repo = makeRepo();
    const service = new EventSearchService(makeRegistry(), repo, makeDto());
    await service.searchEvents(params({ orderby: -1 }));
    expect(repo.getSearchEvents).toHaveBeenCalledWith(
      expect.objectContaining({ orderby: -1 }),
    );
  });
});

describe("EventSearchService - time range validation", () => {
  it("throws SearchValidationError when from equals to", async () => {
    const service = new EventSearchService(makeRegistry(), makeRepo(), makeDto());
    await expect(
      service.searchEvents(params({ from: 1000, to: 1000 })),
    ).rejects.toThrow(SearchValidationError);
  });

  it("throws SearchValidationError when from is greater than to", async () => {
    const service = new EventSearchService(makeRegistry(), makeRepo(), makeDto());
    await expect(
      service.searchEvents(params({ from: 2000, to: 1000 })),
    ).rejects.toThrow(SearchValidationError);
  });
});

describe("EventSearchService - magnitude validation", () => {
  it("throws SearchValidationError when minmag >= maxmag", async () => {
    const service = new EventSearchService(makeRegistry(), makeRepo(), makeDto());
    await expect(
      service.searchEvents(params({ minmag: 5, maxmag: 3 })),
    ).rejects.toThrow(SearchValidationError);
  });

  it("throws SearchValidationError when minmag equals maxmag", async () => {
    const service = new EventSearchService(makeRegistry(), makeRepo(), makeDto());
    await expect(
      service.searchEvents(params({ minmag: 5, maxmag: 5 })),
    ).rejects.toThrow(SearchValidationError);
  });

  it("clamps minmag to MAG_MIN when negative", async () => {
    const repo = makeRepo();
    const service = new EventSearchService(makeRegistry(), repo, makeDto());
    await service.searchEvents(params({ minmag: -5 }));
    expect(repo.getSearchEvents).toHaveBeenCalledWith(
      expect.objectContaining({ minmag: RESTConfig.MAG_MIN }),
    );
  });

  it("clamps maxmag to MAG_MAX when above the limit", async () => {
    const repo = makeRepo();
    const service = new EventSearchService(makeRegistry(), repo, makeDto());
    await service.searchEvents(params({ maxmag: 999 }));
    expect(repo.getSearchEvents).toHaveBeenCalledWith(
      expect.objectContaining({ maxmag: RESTConfig.MAG_MAX }),
    );
  });
});

describe("EventSearchService - wind speed validation", () => {
  it("throws SearchValidationError when minwind >= maxwind", async () => {
    const service = new EventSearchService(makeRegistry(), makeRepo(), makeDto());
    await expect(
      service.searchEvents(params({ minwind: 100, maxwind: 50 })),
    ).rejects.toThrow(SearchValidationError);
  });

  it("clamps minwind to WIND_MIN when negative", async () => {
    const repo = makeRepo();
    const service = new EventSearchService(makeRegistry(), repo, makeDto());
    await service.searchEvents(params({ minwind: -10 }));
    expect(repo.getSearchEvents).toHaveBeenCalledWith(
      expect.objectContaining({ minwind: RESTConfig.WIND_MIN }),
    );
  });

  it("clamps maxwind to WIND_MAX when above the limit", async () => {
    const repo = makeRepo();
    const service = new EventSearchService(makeRegistry(), repo, makeDto());
    await service.searchEvents(params({ maxwind: 999 }));
    expect(repo.getSearchEvents).toHaveBeenCalledWith(
      expect.objectContaining({ maxwind: RESTConfig.WIND_MAX }),
    );
  });
});

describe("EventSearchService - position validation", () => {
  it("resets lat to 0 when out of range (>= 90)", async () => {
    const repo = makeRepo();
    const service = new EventSearchService(makeRegistry(), repo, makeDto());
    await service.searchEvents(
      params({ position: { lat: 200, lon: 10, radius: 100 } }),
    );
    expect(repo.getSearchEvents).toHaveBeenCalledWith(
      expect.objectContaining({
        position: expect.objectContaining({ lat: 0 }),
      }),
    );
  });

  it("resets lat to 0 when out of range (< -90)", async () => {
    const repo = makeRepo();
    const service = new EventSearchService(makeRegistry(), repo, makeDto());
    await service.searchEvents(
      params({ position: { lat: -91, lon: 10, radius: 100 } }),
    );
    expect(repo.getSearchEvents).toHaveBeenCalledWith(
      expect.objectContaining({
        position: expect.objectContaining({ lat: 0 }),
      }),
    );
  });

  it("resets lon to 0 when out of range (>= 180)", async () => {
    const repo = makeRepo();
    const service = new EventSearchService(makeRegistry(), repo, makeDto());
    await service.searchEvents(
      params({ position: { lat: 10, lon: 200, radius: 100 } }),
    );
    expect(repo.getSearchEvents).toHaveBeenCalledWith(
      expect.objectContaining({
        position: expect.objectContaining({ lon: 0 }),
      }),
    );
  });

  it("resets lon to 0 when out of range (< -180)", async () => {
    const repo = makeRepo();
    const service = new EventSearchService(makeRegistry(), repo, makeDto());
    await service.searchEvents(
      params({ position: { lat: 10, lon: -181, radius: 100 } }),
    );
    expect(repo.getSearchEvents).toHaveBeenCalledWith(
      expect.objectContaining({
        position: expect.objectContaining({ lon: 0 }),
      }),
    );
  });
});

describe("EventSearchService - searchEvents happy path", () => {
  it("calls repository and dto, returns the collection", async () => {
    const features = [{ type: "Feature" } as unknown as GeoJSONFeature];
    const repo = makeRepo({
      getSearchEvents: jest.fn().mockResolvedValue(features),
      getSearchEventsCount: jest.fn().mockResolvedValue(5),
    });
    const mockResult = {
      type: "FeatureCollection",
      metadata: { total: 5 },
      features,
    };
    const dto = {
      toCollection: jest.fn().mockReturnValue(mockResult),
    } as unknown as GeoJSONCollectionDto;

    const service = new EventSearchService(makeRegistry(), repo, dto);
    const result = await service.searchEvents(params());

    expect(repo.getSearchEventsCount).toHaveBeenCalled();
    expect(repo.getSearchEvents).toHaveBeenCalled();
    expect(dto.toCollection).toHaveBeenCalledWith(
      features,
      5,
      RESTConfig.LIMIT,
      expect.any(String),
    );
    expect(result).toBe(mockResult);
  });
});

describe("GeoJSONCollectionDto.toCollection", () => {
  it("correctly builds a FeatureCollection", () => {
    const dto = new GeoJSONCollectionDto();
    const features = [{ type: "Feature" } as unknown as GeoJSONFeature];
    const result = dto.toCollection(features, 10, 5, "1.0.0");

    expect(result.type).toBe("FeatureCollection");
    expect(result.metadata.total).toBe(10);
    expect(result.metadata.count).toBe(1);
    expect(result.metadata.limit).toBe(5);
    expect(result.metadata.api).toBe("1.0.0");
    expect(result.features).toBe(features);
  });

  it("counts features correctly", () => {
    const dto = new GeoJSONCollectionDto();
    const features = [
      { type: "Feature" },
      { type: "Feature" },
    ] as unknown as GeoJSONFeature[];
    const result = dto.toCollection(features, 100, 20, "2.0.0");
    expect(result.metadata.count).toBe(2);
  });

  it("returns empty features array when none provided", () => {
    const dto = new GeoJSONCollectionDto();
    const result = dto.toCollection([], 0, 10, "1.0.0");
    expect(result.features).toEqual([]);
    expect(result.metadata.count).toBe(0);
  });
});
