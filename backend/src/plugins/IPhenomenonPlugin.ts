import { Filter } from "mongodb";
import { GeoJSONFeature } from "../types/GeoJSONFeature";
import { EventSearchParams } from "../types/EventSearchParams";
import { IEventIngestionStrategy } from "../strategies/IEventIngestionStrategy";

export interface IPhenomenonPlugin extends IEventIngestionStrategy {
  getProjectionFields(): string[];
  parseSearchParams(query: Record<string, unknown>): Partial<EventSearchParams>;
  validateSearchParams(params: EventSearchParams): void;
  buildQueryFragment(params: EventSearchParams): Filter<GeoJSONFeature>;
}
