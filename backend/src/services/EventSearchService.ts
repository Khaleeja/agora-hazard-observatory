/**
 * EventSearchService.ts
 * Validates and executes search queries and single-event lookups against the read repository.
 */

import data from "../../package.json";
import { RESTConfig } from "../configs/RESTConfig";
import { GeoJSONCollectionDto } from "../dtos/GeoJSONCollectionDto";
import { SearchValidationError } from "../errors/SearchValidationError";
import { createModuleLogger } from "../logger/logger";
import { PhenomenonRegistry } from "../plugins/PhenomenonRegistry";
import { IEventReadRepository } from "../repositories/IEventReadRepository";
import { EventSearchParams } from "../types/EventSearchParams";
import { GeoJSONFeature } from "../types/GeoJSONFeature";
import { GeoJSONFeatures } from "../types/GeoJSONFeatures";

export class EventSearchService {
  private readonly _logger = createModuleLogger("EventSearch Service");

  constructor(
    private readonly _registry: PhenomenonRegistry,
    private readonly _repository: IEventReadRepository,
    private readonly _dto: GeoJSONCollectionDto,
  ) {}

  private _validate(params: EventSearchParams): void {
    if (params.from !== undefined && params.from >= Date.now())
      params.from = Date.now() - RESTConfig.MIN_TIME;
    if (params.to !== undefined && params.to >= Date.now())
      params.to = Date.now();
    if (
      params.from !== undefined &&
      params.to !== undefined &&
      params.from >= params.to
    ) {
      this._logger.warn("Requested search with time from >= end");
      throw new SearchValidationError(
        "Search parameters provided are incorrect (time from >= end)",
      );
    }

    if (
      params.minmag !== undefined &&
      (params.minmag >= RESTConfig.MAG_MAX ||
        params.minmag < RESTConfig.MAG_MIN)
    )
      params.minmag = RESTConfig.MAG_MIN;
    if (
      params.maxmag !== undefined &&
      (params.maxmag >= RESTConfig.MAG_MAX ||
        params.maxmag < RESTConfig.MAG_MIN)
    )
      params.maxmag = RESTConfig.MAG_MAX;
    if (
      params.minmag !== undefined &&
      params.maxmag !== undefined &&
      params.minmag >= params.maxmag
    ) {
      this._logger.warn("Requested search with magnitude min >= max");
      throw new SearchValidationError(
        "Search parameters provided are incorrect (magnitude min >= max)",
      );
    }

    if (
      params.minwind !== undefined &&
      (params.minwind >= RESTConfig.WIND_MAX ||
        params.minwind < RESTConfig.WIND_MIN)
    )
      params.minwind = RESTConfig.WIND_MIN;
    if (
      params.maxwind !== undefined &&
      (params.maxwind >= RESTConfig.WIND_MAX ||
        params.maxwind < RESTConfig.WIND_MIN)
    )
      params.maxwind = RESTConfig.WIND_MAX;
    if (
      params.minwind !== undefined &&
      params.maxwind !== undefined &&
      params.minwind >= params.maxwind
    ) {
      this._logger.warn("Requested search with wind speed min >= max");
      throw new SearchValidationError(
        "Search parameters provided are incorrect (wind speed min >= max)",
      );
    }

    if (
      params.position?.lat !== undefined &&
      (params.position?.lat >= 90 || params.position?.lat < -90)
    )
      params.position.lat = 0;
    if (
      params.position?.lon !== undefined &&
      (params.position?.lon >= 180 || params.position?.lon < -180)
    )
      params.position.lon = 0;

    if (params.orderby === undefined || ![1, -1].includes(params.orderby))
      params.orderby = -1;

    if (params.limit === undefined || params.limit > RESTConfig.LIMIT)
      params.limit = RESTConfig.LIMIT;
    else if (params.limit < 1) params.limit = 1;

    // Per-phenomenon clamps (today: no-ops on both plugins — the RESTConfig
    // based clamps above still do the real work). Left wired in now so that
    // moving minmag/maxmag/minwind/maxwind clamping into
    // EarthquakePlugin/CyclonePlugin.validateSearchParams later is a pure
    // move, not a new integration point to add.
    for (const plugin of this._registry.all()) plugin.validateSearchParams(params);
  }

  public async getEventById(
    id: string,
    source: string,
  ): Promise<GeoJSONFeature | null> {
    return this._repository.findById(id, source);
  }

  public async searchEvents(
    params: EventSearchParams,
  ): Promise<GeoJSONFeatures> {
    this._validate(params);
    const limit = params.limit!;
    const total = await this._repository.getSearchEventsCount(params);
    const feat = await this._repository.getSearchEvents(params);
    const features = this._dto.toCollection(feat, total, limit, data.version);

    return features;
  }
}
