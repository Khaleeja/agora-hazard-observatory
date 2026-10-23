/**
 * GeoEventController.ts
 * HTTP controller for geo-event endpoints: filtered search and single-event lookup.
 */

import { Request, Response } from "express";
import { SearchValidationError } from "../errors/SearchValidationError";
import { createModuleLogger } from "../logger/logger";
import { EventSearchService } from "../services/EventSearchService";
import { EventSearchParams } from "../types/EventSearchParams";
import { BadRequestError } from "../errors/BadRequestError";
import {
  parseNumber,
  parseSeverity,
  parseTimestamp,
  parseType,
} from "../util/queryParsing";
import { PhenomenonRegistry } from "../plugins/PhenomenonRegistry";

export class GeoEventController {
  private readonly _logger = createModuleLogger("GeoEvent Controller");

  constructor(
    private readonly _registry: PhenomenonRegistry,
    private readonly _searchService: EventSearchService,
  ) {}

  private _parseParams(req: Request): EventSearchParams {
    const q = req.query;
    const type = parseType(q.type);
    // Every registered plugin gets a chance to read its own fields out of
    // the query — not just the ones in `type` — so an unfiltered search
    // (no explicit type) still picks up e.g. a magnitude filter, mirroring
    // how GeoEventRepository._buildQuery falls back to every registered
    // type when none is specified.
    const activeTypes =
      type ?? this._registry.all().map((p) => p.getEventType());
    const typeSpecific = activeTypes
      .map((t) => this._registry.get(t)?.parseSearchParams(q))
      .reduce((acc, p) => ({ ...acc, ...p }), {});

    const lat = parseNumber(q.lat, "lat");
    const lon = parseNumber(q.lon, "lon");
    const radius = parseNumber(q.radius, "radius");

    if (
      (q.lat !== undefined || q.lon !== undefined || q.radius !== undefined) &&
      (lat === undefined || lon === undefined || radius === undefined)
    )
      throw new BadRequestError(
        "'lat', 'lon' and 'radius' must all be provided together",
      );

    if (radius !== undefined && radius <= 0)
      throw new BadRequestError("'radius' must be a positive number");

    return {
      from: parseTimestamp(q.from, "from"),
      to: parseTimestamp(q.to, "to"),
      limit: parseNumber(q.limit, "limit"),
      type,
      severity: parseSeverity(q.severity),
      orderby: q.orderby === "asc" ? 1 : -1,
      position:
        lat !== undefined && lon !== undefined && radius !== undefined
          ? { lat, lon, radius }
          : undefined,
      ...typeSpecific,
    };
  }

  public async getEventById(req: Request, res: Response): Promise<void> {
    const id = typeof req.params.id === "string" ? req.params.id.trim() : "";
    const source =
      typeof req.query.source === "string" ? req.query.source.trim() : "";

    if (!id || !source) {
      res
        .status(400)
        .json({ error: "'id' (path) and 'source' (query) are required" });
      return;
    }

    if (
      !/^[a-zA-Z0-9_-]{1,100}$/.test(id) ||
      !/^[a-zA-Z0-9_-]{1,50}$/.test(source)
    ) {
      res
        .status(400)
        .json({ error: "'id' and 'source' must be alphanumeric identifiers" });
      return;
    }

    try {
      const event = await this._searchService.getEventById(id, source);
      if (!event) {
        res.status(404).json({ error: "Event not found" });
        return;
      }
      res.status(200).json(event);
    } catch (error) {
      this._logger.error("GET /events/:id failed", { error });
      res.status(500).json({ error: "internal server error" });
    }
  }

  public async getSearchEvents(req: Request, res: Response): Promise<void> {
    let params: EventSearchParams;
    try {
      params = this._parseParams(req);
    } catch (error) {
      if (error instanceof BadRequestError) {
        res.status(400).json({ error: error.message });
        return;
      }
      res.status(500).json({ error: "internal server error" });
      return;
    }

    try {
      res.status(200).json(await this._searchService.searchEvents(params));
    } catch (error) {
      if (error instanceof SearchValidationError) {
        res.status(422).json({ error: error.message });
        return;
      }
      this._logger.error("GET /events/search failed", { error });
      res.status(500).json({ error: "internal server error" });
    }
  }
}
