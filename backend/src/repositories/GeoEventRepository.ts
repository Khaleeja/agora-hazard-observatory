/**
 * GeoEventRepository.ts
 * GeoEventRepository class is the middleman between MongoDB and the logic of the software.
 */

import { Db, Document, Filter } from "mongodb";
import { GeoJSONFeature } from "../types/GeoJSONFeature";
import { IEventReadRepository } from "./IEventReadRepository";
import { IEventWriteRepository } from "./IEventWriteRepository";
import { EventSearchParams } from "../types/EventSearchParams";
import { createModuleLogger } from "../logger/logger";
import { PhenomenonRegistry } from "../plugins/PhenomenonRegistry";

export class GeoEventRepository
  implements IEventReadRepository, IEventWriteRepository
{
  private readonly _db: Db;
  private readonly _logger = createModuleLogger("Database");

  constructor(
    private readonly _registry: PhenomenonRegistry,
    db: Db,
  ) {
    this._db = db;
  }

  private _buildQuery(params: EventSearchParams): Filter<GeoJSONFeature> {
    const query: Filter<GeoJSONFeature> = {};
    const explicitTypes = params.type?.length ? params.type : undefined;
    const types = explicitTypes ?? this._registry.all().map((p) => p.getEventType());

    const fragments = types
      .map((t) => this._registry.get(t)?.buildQueryFragment(params))
      .filter((f): f is Filter<GeoJSONFeature> => f !== undefined);

    // The part of each fragment beyond its own eventType match — i.e.
    // whatever is actually phenomenon-specific about this search. Whether
    // $or is needed at all comes down to whether there's really something
    // here to reconcile between types, not just how many types were asked
    // for — a plain multi-type filter with nothing else set doesn't need
    // the complexity of $or any more than a single-type one does.
    const extras = fragments.map((f) => {
      const rest = { ...f };
      delete rest["properties.eventType"];
      return rest;
    });
    const hasExtras = extras.some((e) => Object.keys(e).length > 0);

    if (!explicitTypes) {
      // No type was actually requested — "every registered type" is not a
      // real *restriction* on the result set, but each kept branch still
      // carries its own eventType match (the full fragment, not the
      // eventType-stripped `extras`): every compound index this repository
      // maintains (ensureIndexes) leads with properties.eventType, so a
      // branch without it can't be bounded by any of them and degenerates
      // into a collection scan — costly once a data source holds enough
      // history that "search a wide time range across every type" (the
      // common case: no type filter is the frontend's default view) means
      // scanning a large fraction of the collection on every request. A
      // branch with nothing beyond eventType is still dropped: unlike
      // `{eventType: {$in:[...]}}`, a bare `{}` would match every document
      // and silently undo whatever another branch restricted.
      const branches = fragments.filter((_, i) => Object.keys(extras[i]).length > 0);
      if (branches.length === 1) Object.assign(query, branches[0]);
      else if (branches.length > 1) query.$or = branches;
    } else if (!hasExtras) {
      // Nothing phenomenon-specific to reconcile — a plain type filter
      // needs nothing fancier than a flat $in.
      query["properties.eventType"] = { $in: explicitTypes };
    } else if (fragments.length === 1) {
      Object.assign(query, fragments[0]);
    } else {
      // Genuinely mixed, with something that only means something for one
      // phenomenon: keep eventType scoped per branch so a filter meaningful
      // to only one phenomenon can't leak into another's otherwise-matching
      // documents.
      query.$or = fragments;
    }

    if (params.severity?.length)
      query["properties.severity"] = { $in: params.severity };

    if (params.position) {
      query.geometry = {
        $geoWithin: {
          $centerSphere: [
            [params.position.lon, params.position.lat],
            params.position.radius / 6371,
          ],
        },
      };
    }
    this._logger.debug("Query built", { query });
    return query;
  }

  private _projection(): Document {
    // Generic fields every phenomenon has, regardless of type — not plugin
    // knowledge, so listed here directly rather than via getProjectionFields.
    const projection: Document = {
      _id: 0,
      type: 1,
      geometry: 1,
      "properties.id": 1,
      "properties.title": 1,
      "properties.source": 1,
      "properties.sourceURL": 1,
      "properties.eventType": 1,
      "properties.severity": 1,
      "properties.timestamp": 1,
    };
    for (const plugin of this._registry.all()) {
      for (const field of plugin.getProjectionFields())
        projection[`properties.${field}`] = 1;
    }
    return projection;
  }

  public async ensureIndexes(): Promise<void> {
    const collection = this._db.collection("events");

    await collection.createIndex(
      { "properties.source": 1, "properties.id": 1 },
      { unique: true },
    );

    await collection.createIndex({ "properties.timestamp": -1 });

    await collection.createIndex({ geometry: "2dsphere" });

    await collection.createIndex({
      "properties.eventType": 1,
      "properties.timestamp": -1,
    });

    // Supports IBTrACSStrategy.buildQueryFragment: an equality match on
    // eventType, then a range bound on startTimestamp (the query's most
    // selective range there), with timestamp available as a covered
    // secondary filter without a second index lookup.
    await collection.createIndex({
      "properties.eventType": 1,
      "properties.startTimestamp": 1,
      "properties.timestamp": 1,
    });
  }

  /*------------------------
       ***** READ *****
 ---------------------------*/

  public async isEmpty(type: string): Promise<boolean> {
    const count = await this.countByType(type);
    return count === 0;
  }

  public async findById(
    id: string,
    source: string,
  ): Promise<GeoJSONFeature | null> {
    return await this._db
      .collection<GeoJSONFeature>("events")
      .findOne({ "properties.id": id, "properties.source": source });
  }

  public async count(): Promise<number> {
    return await this._db.collection<GeoJSONFeature>("events").countDocuments();
  }

  public async countByType(type: string): Promise<number> {
    return await this._db
      .collection<GeoJSONFeature>("events")
      .countDocuments({ "properties.eventType": type });
  }

  public async getLastEvent(type: string): Promise<GeoJSONFeature | null> {
    return await this._db
      .collection<GeoJSONFeature>("events")
      .findOne(
        { "properties.eventType": type },
        { sort: { "properties.timestamp": -1 } },
      );
  }

  public async getLastEventTime(type: string): Promise<number | null> {
    const time = await this._db.collection<GeoJSONFeature>("events").findOne(
      { "properties.eventType": type },
      {
        sort: { "properties.timestamp": -1 },
        projection: { "properties.timestamp": 1 },
      },
    );
    return time?.properties.timestamp ?? null;
  }

  public async getDailyEvents(): Promise<GeoJSONFeature[]> {
    const now = Date.now();
    return await this._db
      .collection<GeoJSONFeature>("events")
      .find(
        {
          "properties.timestamp": {
            $lte: now,
            $gte: now - 86400000,
          },
        },
        {
          projection: {
            _id: 0,
            type: 1,
            geometry: 1,
            "properties.id": 1,
            "properties.source": 1,
            "properties.eventType": 1,
            "properties.severity": 1,
            "properties.magnitude": 1,
          },
        },
      )
      .sort({ "properties.timestamp": -1 })
      .toArray();
  }

  public async getSearchEvents(
    params: EventSearchParams,
  ): Promise<GeoJSONFeature[]> {
    const query = this._buildQuery(params);

    return await this._db
      .collection<GeoJSONFeature>("events")
      .find(query, { projection: this._projection() })
      .sort({ "properties.timestamp": params.orderby })
      .limit(params.limit ?? 10000)
      .toArray();
  }

  public async getSearchEventsCount(
    params: EventSearchParams,
  ): Promise<number> {
    const query = this._buildQuery(params);

    if (Object.keys(query).length === 0) {
      return this._db.collection("events").estimatedDocumentCount();
    }

    return await this._db
      .collection<GeoJSONFeature>("events")
      .countDocuments(query, {});
  }

  /*------------------------
       ***** WRITE *****
 ---------------------------*/

  public async insertBatchEvents(
    type: string,
    data: GeoJSONFeature[],
  ): Promise<number> {
    if (data.length === 0) return 0;

    const operations = data.map((f) => ({
      updateOne: {
        filter: {
          "properties.source": f.properties.source,
          "properties.id": f.properties.id,
        },
        update: {
          $set: {
            type: f.type,
            properties: f.properties,
            geometry: f.geometry,
          },
        },
        upsert: true,
      },
    }));
    const result = await this._db
      .collection<GeoJSONFeature>("events")
      .bulkWrite(operations);
    const saved = result.upsertedCount + result.modifiedCount;
    this._logger.debug("Batch write complete", {
      type,
      upserted: result.upsertedCount,
      modified: result.modifiedCount,
      matched: result.matchedCount,
    });
    return saved;
  }
}
