/**
 * GeoJSONCollectionDto.ts
 * Assembles a GeoJSON FeatureCollection response with pagination metadata.
 */

import { GeoJSONFeature } from "../types/GeoJSONFeature";
import { GeoJSONFeatures } from "../types/GeoJSONFeatures";

export class GeoJSONCollectionDto {
  toCollection(
    feature: GeoJSONFeature[],
    total: number,
    limit: number,
    api: string,
  ): GeoJSONFeatures {
    const data: GeoJSONFeatures = {
      type: "FeatureCollection",
      metadata: {
        total: total,
        count: feature.length,
        limit: limit,
        api: api,
      },
      features: feature,
    };
    return data;
  }
}
