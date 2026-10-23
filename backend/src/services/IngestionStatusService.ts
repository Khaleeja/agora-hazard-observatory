/**
 * IngestionStatusService.ts
 * Tracks, per event type, whether its data is still loading, ready, or
 * failed — shared in-memory state read by the /health endpoint and written
 * by StartupService (initial load) and SchedulerService (periodic cycles),
 * so a client can tell "no results yet" (still loading) apart from "this
 * source is broken" (failed) instead of seeing an empty search either way.
 */

export type IngestionState = "loading" | "ready" | "failed";

export interface IngestionStatus {
  state: IngestionState;
  // Epoch ms of the last cycle that completed successfully for this type —
  // kept even after a later failure, so /health can still show "last good
  // data from X" instead of just "failed, no further info".
  lastUpdated?: number;
  // Present only while state === "failed".
  error?: string;
}

export class IngestionStatusService {
  private readonly _status = new Map<string, IngestionStatus>();

  public setLoading(type: string): void {
    const previous = this._status.get(type);
    this._status.set(type, { state: "loading", lastUpdated: previous?.lastUpdated });
  }

  public setReady(type: string): void {
    this._status.set(type, { state: "ready", lastUpdated: Date.now() });
  }

  public setFailed(type: string, error: unknown): void {
    const previous = this._status.get(type);
    this._status.set(type, {
      state: "failed",
      lastUpdated: previous?.lastUpdated,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  public getAll(): Record<string, IngestionStatus> {
    return Object.fromEntries(this._status);
  }
}
