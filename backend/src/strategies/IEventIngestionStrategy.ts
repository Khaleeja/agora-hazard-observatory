/**
 * IEventIngestionStrategy.ts
 * IEventIngestionStrategy interface of the Strategy pattern.
 */

import { GeoJSONFeature } from "../types/GeoJSONFeature";

export interface IEventIngestionStrategy {
  fetch(from: number, to: number): Promise<GeoJSONFeature[]>;
  getNextBatchEnd(cursor: number, to: number): number;
  getDelay(): number;
  getName(): string;
  getTimeOrigin(): number;
  getRefreshRate(): number;
  getEventType(): string;
}
