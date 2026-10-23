/**
 * IEventReadRepository.ts
 * IEventReadRepository interface for GeoEventRepository.
 */

import { EventSearchParams } from "../types/EventSearchParams";
import { GeoJSONFeature } from "../types/GeoJSONFeature";

export interface IEventReadRepository {
  isEmpty(type: string): Promise<boolean>;
  findById(id: string, source: string): Promise<GeoJSONFeature | null>;
  count(): Promise<number>;
  countByType(type: string): Promise<number>;
  getLastEvent(type: string): Promise<GeoJSONFeature | null>;
  getLastEventTime(type: string): Promise<number | null>;
  getDailyEvents(): Promise<GeoJSONFeature[]>;
  getSearchEvents(params: EventSearchParams): Promise<GeoJSONFeature[]>;
  getSearchEventsCount(params: EventSearchParams): Promise<number>;
}
