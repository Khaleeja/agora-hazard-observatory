/**
 * SchedulerService.ts
 * Schedules and manages periodic ingestion cycles for each registered strategy.
 */

import { IngestionService } from "./IngestionService";
import { IngestionStatusService } from "./IngestionStatusService";
import { IEventIngestionStrategy } from "../strategies/IEventIngestionStrategy";
import { IEventReadRepository } from "../repositories/IEventReadRepository";
import { createModuleLogger, serializeError } from "../logger/logger";

export class SchedulerService {
  private readonly _timers: Map<string, NodeJS.Timeout> = new Map();
  private readonly _running: Set<string> = new Set();
  private readonly _logger = createModuleLogger("Scheduler service");

  constructor(
    private readonly _strategies: IEventIngestionStrategy[],
    private readonly _ingestionService: IngestionService,
    private readonly _readRepo: IEventReadRepository,
    private readonly _status: IngestionStatusService,
  ) {}

  public getStrategies(): IEventIngestionStrategy[] {
    return this._strategies;
  }

  public scheduleIngestion(): void {
    for (const strategy of this._strategies) {
      const intervalMs = strategy.getRefreshRate();

      if (intervalMs === 0) {
        this._logger.info("Ingestion disabled (interval=0)", {
          name: strategy.getName(),
          event: strategy.getEventType(),
        });
        continue;
      }

      const timer = setInterval(() => {
        this._theTimeHasCome(strategy);
      }, intervalMs);

      this._timers.set(strategy.getEventType(), timer);
      this._logger.verbose("Scheduled ingestion", {
        name: strategy.getName(),
        event: strategy.getEventType(),
        intervalMs,
      });
    }
    this._logger.info("Scheduler is up and running");
  }

  private async _theTimeHasCome(
    strategy: IEventIngestionStrategy,
  ): Promise<void> {
    const type = strategy.getEventType();

    if (this._running.has(type)) {
      this._logger.debug("Skipping cycle: previous run still in progress", {
        name: strategy.getName(),
        event: type,
      });
      return;
    }

    this._running.add(type);
    try {
      const lastTime = await this._readRepo.getLastEventTime(type);
      const from =
        lastTime !== null
          ? Math.ceil((lastTime + 1) / 1000) * 1000
          : strategy.getTimeOrigin();
      const to = Date.now();

      await this._ingestionService.collectNewData(strategy, from, to);
      this._status.setReady(type);
    } catch (error) {
      this._logger.error("Scheduled ingestion cycle failed", {
        name: strategy.getName(),
        event: type,
        error: serializeError(error),
      });
      this._status.setFailed(type, error);
    } finally {
      this._running.delete(type);
    }
  }

  public stopAll(): void {
    for (const [type, timer] of this._timers) {
      clearInterval(timer);
      this._logger.info("Stopped scheduler", { type });
    }
    this._timers.clear();
  }
}
