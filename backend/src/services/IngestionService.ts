/**
 * IngestionService.ts
 * Orchestrates batch ingestion using a strategy: iterates time-window batches and persists results to the DB.
 */

import { createModuleLogger, serializeError } from "../logger/logger";
import { IEventWriteRepository } from "../repositories/IEventWriteRepository";
import { IEventIngestionStrategy } from "../strategies/IEventIngestionStrategy";

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export class IngestionService {
  private readonly _logger = createModuleLogger("Ingestion Service");

  constructor(private readonly _dbWrite: IEventWriteRepository) {}

  private _estimateTotalBatches(
    strategy: IEventIngestionStrategy,
    start: number,
    end: number,
  ): number {
    let cursor = start;
    let count = 0;
    while (cursor < end) {
      cursor = strategy.getNextBatchEnd(cursor, end);
      count++;
    }
    return count;
  }

  public async collectNewData(
    strategy: IEventIngestionStrategy,
    start: number,
    end: number,
  ): Promise<void> {
    this._logger.info("New task started!", {
      name: strategy.getName(),
      event: strategy.getEventType(),
      from: start,
      to: end,
    });

    let cursor = start;
    const totalBatches = this._estimateTotalBatches(strategy, start, end);
    let batchIndex = 0;
    let eventCounter = 0;

    while (cursor < end) {
      const batchEnd = strategy.getNextBatchEnd(cursor, end);
      batchIndex++;
      this._logger.verbose("New batch!", {
        name: strategy.getName(),
        event: strategy.getEventType(),
        from: cursor,
        to: batchEnd,
      });
      try {
        const feature = await strategy.fetch(cursor, batchEnd);

        const progress = ((batchIndex / totalBatches) * 100).toFixed(1);
        this._logger.verbose("Progress...", {
          name: strategy.getName(),
          event: strategy.getEventType(),
          date: new Date(cursor).toISOString(),
          progress: progress,
          batchIndex: batchIndex,
          totalBatches: totalBatches,
          nEvents: feature.length,
        });
        const saved = await this._dbWrite.insertBatchEvents(
          strategy.getEventType(),
          feature,
        );
        eventCounter += saved;
      } catch (error) {
        this._logger.warn("Batch failed! Skipping...", {
          name: strategy.getName(),
          event: strategy.getEventType(),
          from: cursor,
          to: batchEnd,
          error: serializeError(error),
        });
      }

      await sleep(strategy.getDelay());
      cursor = batchEnd;
    }

    this._logger.info("Task completed!", {
      name: strategy.getName(),
      event: strategy.getEventType(),
      totalEvents: eventCounter,
    });
  }
}
