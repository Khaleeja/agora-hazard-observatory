/**
 * Adapter.ts
 * Abstract base class for source-specific adapters that convert raw API responses into GeoJSONFeature[].
 */

import { GeoJSONFeature } from "../types/GeoJSONFeature";

export abstract class Adapter<TInput> {
  protected abstract readonly _type: string;

  abstract toGeoJSON(data: TInput): GeoJSONFeature[];
  public getEventType(): string {
    return this._type;
  }
}
