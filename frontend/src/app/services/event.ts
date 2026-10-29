import { inject, Injectable } from '@angular/core';
import { BehaviorSubject, catchError, combineLatest, Observable, of, TimeoutError, timeout } from 'rxjs';
import { GeoJSONCollection, GeoJSONFeature } from '../types/GeoJSONFeature';
import { HttpClient } from '@angular/common/http';
import { FilterService } from './filter';
import { HealthService, IngestionStatus } from './health';
import { EventSearchParams } from '../types/EventSearchParams';

@Injectable({
  providedIn: 'root',
})
export class EventService {
  private readonly _http = inject(HttpClient);
  private readonly _filter = inject(FilterService);
  private readonly _health = inject(HealthService);
  private readonly _listEvents = new BehaviorSubject<GeoJSONFeature[]>([]);
  private readonly _error = new BehaviorSubject<string | null>(null);
  private readonly _loading = new BehaviorSubject<boolean>(false);
  private readonly _searchMeta = new BehaviorSubject<{
    total: number;
    retrieved: number;
    limit: number;
  } | null>(null);
  // The 'to' boundary of the current search, or now() if unbounded. Consumers
  // use this to pick which historical point of a cyclone's track to show as
  // its "current" position/data — not always the absolute last point, since
  // a past search should show the storm as it was as of that search, not as
  // of today (see EventTypeStrategy.renderOnMap and EventDetail).
  private readonly _asOf = new BehaviorSubject<number>(Date.now());

  constructor() {
    combineLatest({
      params: this._filter.getCommitted(),
      types: this._filter.getType(),
    }).subscribe(({ params, types }) => {
      this._newSearch(params, types);
    });
  }

  getEventList(): Observable<GeoJSONFeature[]> {
    return this._listEvents.asObservable();
  }

  getDetail(id: string, source: string): Observable<GeoJSONFeature> {
    const url = new URL(`/api/events/${id}`, window.location.origin);
    url.searchParams.append('source', source);
    return this._http.get<GeoJSONFeature>(url.toString()).pipe(timeout(10_000));
  }

  getError(): Observable<string | null> {
    return this._error.asObservable();
  }

  getLoading(): Observable<boolean> {
    return this._loading.asObservable();
  }

  getSearchMeta(): Observable<{ total: number; retrieved: number; limit: number } | null> {
    return this._searchMeta.asObservable();
  }

  getAsOf(): Observable<number> {
    return this._asOf.asObservable();
  }

  /**
   * A 502/503/504/0 on its own just means "no usable response came back" —
   * it looks the same whether the server is genuinely down or simply still
   * loading its initial data after a (re)start (which can take a while, see
   * StartupService on the backend). Consulting the last known /health
   * snapshot lets us tell the user which one it actually is, instead of
   * always implying an outage.
   */
  private _describeUnreachable(status: number, types: string[]): string {
    const health = this._health.snapshot();
    const relevant = types
      .map((t) => health?.ingestion[t])
      .filter((s): s is IngestionStatus => s !== undefined);

    if (relevant.some((s) => s.state === 'loading')) {
      return 'The server is still loading its initial data — this is expected right after a restart, not an outage. Results will fill in over the next few minutes.';
    }
    const failed = relevant.find((s) => s.state === 'failed');
    if (failed) {
      return `This data source is currently unavailable (${failed.error ?? 'unknown error'}). Last successful update: ${failed.lastUpdated ? new Date(failed.lastUpdated).toLocaleString() : 'never'}.`;
    }

    if (status === 0) return 'Cannot reach the server. Check your connection or try again later.';
    if (status === 503) return 'The service is temporarily unavailable. Try again shortly.';
    return `Gateway error (${status}) — the server may be restarting. Try again shortly.`;
  }

  private _newSearch(params: EventSearchParams, types: string[]): void {
    this._loading.next(true);
    this._error.next(null);
    const url = new URL('/api/events/search', window.location.origin);
    if (params.limit) url.searchParams.set('limit', String(params.limit));
    if (params.severity?.length) params.severity.forEach(s => url.searchParams.append('severity', s));
    // Repeated params, not a comma-joined value: the backend's type validator
    // (GeoEventController._parseType) accepts either form for a single type,
    // but rejects a comma inside one value — only ever exercised once a
    // second type (cyclone) became selectable alongside earthquake.
    types.forEach(t => url.searchParams.append('type', t));
    if (params.category?.length) params.category.forEach(c => url.searchParams.append('category', c));

    if (params.from) url.searchParams.set('from', params.from);
    if (params.to) url.searchParams.set('to', params.to);

    // minmag/maxmag, the time window, and the cyclone-only fields
    // (category/minwind/maxwind/basin) are always sent as-is — the backend
    // scopes each to the phenomenon it actually applies to (an earthquake
    // bound exactly to [from, to] vs. a cyclone counted as active if its
    // track overlaps it, with tolerance for IBTrACS's reporting lag; a
    // magnitude filter only ever constrains earthquake-shaped documents,
    // never silently excluding cyclones from a mixed search, and vice
    // versa for category). See GeoEventRepository._buildQuery on the
    // backend, which builds one query branch per phenomenon type.
    if (params.minmag != null) url.searchParams.set('minmag', String(params.minmag));
    if (params.maxmag != null) url.searchParams.set('maxmag', String(params.maxmag));
    this._asOf.next(params.to ? new Date(params.to).getTime() : Date.now());

    if (params.position) {
      url.searchParams.set('lat', String(params.position.lat));
      url.searchParams.set('lon', String(params.position.lon));
      url.searchParams.set('radius', String(params.position.radius));
    }
    url.searchParams.set('orderby', params.orderby === 1 ? 'asc' : 'desc');

    this._http.get<GeoJSONCollection>(url.toString())
      .pipe(
        timeout(15_000),
        catchError((err) => {
          if (err instanceof TimeoutError) {
            this._error.next('Request timed out. The server is not responding.');
          } else if (err.status === 400) {
            this._error.next('Invalid search parameters.');
          } else if (err.status === 422) {
            const detail = err.error?.message ?? err.error?.detail ?? '';
            this._error.next(
              detail
                ? `Invalid filters: ${detail}`
                : 'Invalid filter combination — check date range and magnitude values.',
            );
          } else if (err.status === 500) {
            this._error.next('The server encountered an internal error. Try again in a moment.');
          } else if (err.status === 0 || err.status === 502 || err.status === 503 || err.status === 504) {
            this._error.next(this._describeUnreachable(err.status, types));
          } else {
            this._error.next(`Unexpected error (${err.status ?? 'unknown'}). Refresh the page or try again.`);
          }
          this._loading.next(false);
          return of(null as GeoJSONCollection | null);
        }),
      )
      .subscribe((collection: GeoJSONCollection | null) => {
        this._listEvents.next(collection?.features ?? []);
        this._searchMeta.next(
          collection
            ? {
                total: collection.metadata.total,
                retrieved: collection.metadata.count,
                limit: collection.metadata.limit,
              }
            : null,
        );
        this._loading.next(false);
      });
  }
}
