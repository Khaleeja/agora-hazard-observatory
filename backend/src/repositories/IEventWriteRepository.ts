/**
 * IEventWriteRepository.ts
 * IEventWriteRepository interface for GeoEventRepository.
 */

import { GeoJSONFeature } from "../types/GeoJSONFeature";

export interface IEventWriteRepository {
  insertBatchEvents(type: string, data: GeoJSONFeature[]): Promise<number>;
}
