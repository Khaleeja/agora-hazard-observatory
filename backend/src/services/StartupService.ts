/**
 * StartupService.ts
 * StartupService class for the initialization of the backend application.
 */

import express from "express";
import { StartupConfig } from "../configs/StartupConfig";
import { createModuleLogger, serializeError } from "../logger/logger";
import { IngestionService } from "./IngestionService";
import { IngestionStatusService } from "./IngestionStatusService";
import { SchedulerService } from "./SchedulerService";
import { IEventIngestionStrategy } from "../strategies/IEventIngestionStrategy";
import { IEventReadRepository } from "../repositories/IEventReadRepository";
import { PhenomenonRegistry } from "../plugins/PhenomenonRegistry";

function toISODuration(startMs: number, endMs: number): string {
  let totalSeconds = Math.floor(Math.abs(endMs - startMs) / 1000);

  const days = Math.floor(totalSeconds / 86400);
  totalSeconds %= 86400;
  const hours = Math.floor(totalSeconds / 3600);
  totalSeconds %= 3600;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  let duration = "P";
  if (days > 0) duration += `${days}D`;

  if (hours > 0 || minutes > 0 || seconds > 0) {
    duration += "T";
    if (hours > 0) duration += `${hours}H`;
    if (minutes > 0) duration += `${minutes}M`;
    if (seconds > 0) duration += `${seconds}S`;
  }

  return duration === "P" ? "P0D" : duration;
}

export class StartupService {
  private readonly _logger = createModuleLogger("Startup Service");

  constructor(
    private readonly _registry: PhenomenonRegistry,
    private readonly _scheduler: SchedulerService,
    private readonly _ingestion: IngestionService,
    private readonly _db: IEventReadRepository,
    private readonly _status: IngestionStatusService,
  ) {}

  private async _reconstructDB(
    strategy: IEventIngestionStrategy,
  ): Promise<void> {
    const from = strategy.getTimeOrigin();
    const to = Date.now().valueOf();
    this._logger.verbose("DB is empty", {
      event: strategy.getEventType(),
      period: toISODuration(to, from),
    });
    await this._ingestion.collectNewData(strategy, from, to);
  }

  private async _updateDB(strategy: IEventIngestionStrategy): Promise<void> {
    let from = await this._db.getLastEventTime(strategy.getEventType());
    if (from !== null) {
      from = Math.ceil((from + 1) / 1000) * 1000;
    } else {
      this._logger.error(
        "Inconsistency: collection not empty but no last event found",
        {
          name: strategy.getName(),
          event: strategy.getEventType(),
        },
      );
      throw new Error(`DB State inconsistent for ${strategy.getEventType()}`);
    }
    const to = Date.now().valueOf();
    this._logger.verbose("DB needs update", {
      event: strategy.getName(),
      period: toISODuration(to, from),
    });
    await this._ingestion.collectNewData(strategy, from, to);
  }

  private async _loadStrategy(strategy: IEventIngestionStrategy): Promise<void> {
    const type = strategy.getEventType();
    this._status.setLoading(type);
    try {
      const dbStatus = await this._db.isEmpty(type);
      if (dbStatus) await this._reconstructDB(strategy);
      else await this._updateDB(strategy);
      this._status.setReady(type);
    } catch (error) {
      // Deliberately not rethrown: one phenomenon's failed initial load
      // must not prevent the others from loading, or take the already-
      // listening server down with it. /health reports it as "failed" —
      // see IngestionStatusService.
      this._logger.error("Initial data load failed for this type", {
        name: strategy.getName(),
        event: type,
        error: serializeError(error),
      });
      this._status.setFailed(type, error);
    }
  }

  private async _forEveryStrategy(): Promise<void> {
    const strategies = this._scheduler.getStrategies();
    for (const strategy of strategies) {
      await this._loadStrategy(strategy);
    }
  }

  public async start(app: express.Application): Promise<void> {
    this._logger.info("System booting...");

    app.listen(StartupConfig.PORT);
    this._logger.info(
      "Server listening — search results will grow as the initial data load proceeds (see /health)",
    );

    // Not awaited: the API must be reachable immediately, not only once
    // every registered type has finished its (potentially hours-long)
    // initial load. The scheduler only starts afterwards, so its periodic
    // timers can't race a type's initial load and trigger a second,
    // concurrent run for the same type.
    this._forEveryStrategy()
      .then(() => {
        this._scheduler.scheduleIngestion();
        this._logger.info(
          "Initial data load pass complete (a type may still show 'failed' in /health). Scheduler started.",
        );
      })
      .catch((error) => {
        // _loadStrategy already contains per-strategy failures — this would
        // only fire on a genuine bug in the loop itself, not a data-source
        // error. The server stays up regardless; the scheduler simply never
        // starts, which is surfaced through /health staying non-"ok".
        this._logger.error("Unexpected error while loading initial data", {
          error: serializeError(error),
        });
      });
  }
}
