import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, Observable, of, shareReplay, switchMap, timer } from 'rxjs';

const POLL_INTERVAL_MS = 30_000;

export interface IngestionStatus {
  state: 'loading' | 'ready' | 'failed';
  lastUpdated?: number;
  error?: string;
  count?: number;
}

export interface HealthResponse {
  status: 'ok' | 'degraded';
  uptime: number;
  version: string;
  ingestion: Record<string, IngestionStatus>;
}

/**
 * Polls GET /api/health every 30s and shares one snapshot across every
 * subscriber (header status badge, EventService's error messages) instead
 * of each issuing its own request. A failed poll yields `null`, not an
 * error — consumers treat "no health info yet" as "don't know", not as a
 * search failure in its own right.
 */
@Injectable({
  providedIn: 'root',
})
export class HealthService {
  private readonly _http = inject(HttpClient);

  private readonly _health$: Observable<HealthResponse | null> = timer(0, POLL_INTERVAL_MS).pipe(
    switchMap(() =>
      this._http.get<HealthResponse>('/api/health').pipe(
        catchError(() => of(null)),
      ),
    ),
    shareReplay({ bufferSize: 1, refCount: false }),
  );

  private _latest: HealthResponse | null = null;

  constructor() {
    this._health$.subscribe((h) => {
      this._latest = h;
    });
  }

  getHealth(): Observable<HealthResponse | null> {
    return this._health$;
  }

  /** Best-effort synchronous snapshot — null if no poll has completed yet. */
  snapshot(): HealthResponse | null {
    return this._latest;
  }
}
