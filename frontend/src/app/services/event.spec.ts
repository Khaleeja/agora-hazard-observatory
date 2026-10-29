import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { firstValueFrom, of } from 'rxjs';
import { EventService } from './event';
import { FilterService } from './filter';
import { HealthService, HealthResponse } from './health';
import { GeoJSONFeature } from '../types/GeoJSONFeature';

const mockFeature = (): GeoJSONFeature => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [12.4964, 41.9028] },
  properties: {
    id: 'usgs-test-1',
    title: 'M 4.2 - Central Italy',
    eventType: 'earthquake',
    source: 'usgs',
    severity: 'Medium',
    timestamp: Date.now(),
    location: 'Central Italy',
    magnitude: 4.2,
  },
});

const mockCollection = (features: GeoJSONFeature[] = [mockFeature()]) => ({
  type: 'FeatureCollection',
  features,
  metadata: { count: features.length, total: features.length, limit: 500, api: '1.0.0' },
});

describe('EventService', () => {
  let service: EventService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(EventService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    httpMock.expectOne((r) => r.url.includes('/api/events/search')).flush(mockCollection([]));
    expect(service).toBeTruthy();
  });

  it('starts with an empty event list before the first response', async () => {
    const events = await firstValueFrom(service.getEventList());
    expect(events).toEqual([]);
    httpMock.expectOne((r) => r.url.includes('/api/events/search')).flush(mockCollection([]));
  });

  it('starts with a null error state', async () => {
    const error = await firstValueFrom(service.getError());
    expect(error).toBeNull();
    httpMock.expectOne((r) => r.url.includes('/api/events/search')).flush(mockCollection([]));
  });

  it('populates the event list after a successful response', async () => {
    const feature = mockFeature();
    httpMock
      .expectOne((r) => r.url.includes('/api/events/search'))
      .flush(mockCollection([feature]));

    const events = await firstValueFrom(service.getEventList());
    expect(events.length).toBe(1);
    expect(events[0].properties.id).toBe('usgs-test-1');
  });

  it('sends filter params as query string', () => {
    const req = httpMock.expectOne((r) => r.url.includes('/api/events/search'));
    expect(req.request.url).toContain('from=');
    expect(req.request.url).toContain('to=');
    req.flush(mockCollection([]));
  });

  it('returns empty list and sets error message on 400', async () => {
    httpMock
      .expectOne((r) => r.url.includes('/api/events/search'))
      .flush({ error: 'Bad Request' }, { status: 400, statusText: 'Bad Request' });

    const events = await firstValueFrom(service.getEventList());
    const error = await firstValueFrom(service.getError());
    expect(events).toEqual([]);
    expect(error).toBe('Invalid search parameters.');
  });

  it('returns empty list and sets error message on 500', async () => {
    httpMock
      .expectOne((r) => r.url.includes('/api/events/search'))
      .flush({}, { status: 500, statusText: 'Server Error' });

    const events = await firstValueFrom(service.getEventList());
    const error = await firstValueFrom(service.getError());
    expect(events).toEqual([]);
    expect(error).toContain('internal error');
  });

  describe('cyclone-aware filtering', () => {
    // Every registered type (earthquake + cyclone) is active by default
    // (see FilterService) — so the very first request already reflects
    // both being active, no toggle step needed to get there. Cyclones lack
    // magnitude, and their timestamp is "last update" (which IBTrACS can
    // lag by days), not "when it happened" — so the earthquake daily-digest
    // defaults (minmag, 24h window) must not silently hide them.

    it('both types active by default, with minmag and the 24h daily window (unchanged behaviour)', () => {
      const req = httpMock.expectOne((r) => r.url.includes('/api/events/search'));
      const types = new URL(req.request.url).searchParams.getAll('type');
      expect(types).toEqual(['earthquake', 'cyclone']);
      expect(req.request.url).toContain('minmag=');
      const from = new URL(req.request.url).searchParams.get('from');
      expect(from).not.toBeNull();
      expect(Date.now() - new Date(from!).getTime()).toBeLessThan(25 * 3_600_000);
      req.flush(mockCollection([]));
    });

    it('still sends minmag/maxmag with cyclone active — the backend scopes it, not the frontend', () => {
      // minmag/maxmag only means something for earthquakes, but the
      // frontend doesn't need to omit it just because cyclone is also
      // active: the backend's USGSStrategy.buildQueryFragment folds
      // magnitude into the earthquake-only branch of the query, so sending
      // it alongside an active cyclone filter never wrongly excludes
      // cyclones.
      httpMock.expectOne((r) => r.url.includes('/api/events/search')).flush(mockCollection([]));

      const filter = TestBed.inject(FilterService);
      filter.updateDraft({ orderby: -1, minmag: 5, maxmag: 8 });
      filter.commit();

      const req = httpMock.expectOne((r) => r.url.includes('/api/events/search'));
      expect(req.request.url).toContain('minmag=5');
      expect(req.request.url).toContain('maxmag=8');
      req.flush(mockCollection([]));
    });

    it('sends from/to unchanged with cyclone active — overlap tolerance is a backend concern', () => {
      // IBTrACSStrategy.buildQueryFragment on the backend decides how a
      // cyclone's overlap/lag tolerance interacts with the requested window,
      // not the frontend — so the 24h default reaches the server as-is.
      const req = httpMock.expectOne((r) => r.url.includes('/api/events/search'));
      const from = new URL(req.request.url).searchParams.get('from');
      expect(from).not.toBeNull();
      expect(Date.now() - new Date(from!).getTime()).toBeLessThan(25 * 3_600_000);
      req.flush(mockCollection([]));
    });

    it('sends no from at all when "All time" is selected, even with cyclone active', () => {
      httpMock.expectOne((r) => r.url.includes('/api/events/search')).flush(mockCollection([]));

      const filter = TestBed.inject(FilterService);
      filter.updateDraft({ orderby: -1, from: undefined, to: undefined });
      filter.commit();

      const req = httpMock.expectOne((r) => r.url.includes('/api/events/search'));
      expect(new URL(req.request.url).searchParams.has('from')).toBe(false);
      req.flush(mockCollection([]));
    });

    it('sends an explicit user-selected from date through unchanged', () => {
      httpMock.expectOne((r) => r.url.includes('/api/events/search')).flush(mockCollection([]));

      const filter = TestBed.inject(FilterService);
      const explicitFrom = new Date(Date.now() - 60 * 86_400_000).toISOString();
      filter.updateDraft({ orderby: -1, from: explicitFrom });
      filter.commit();

      const req = httpMock.expectOne((r) => r.url.includes('/api/events/search'));
      expect(new URL(req.request.url).searchParams.get('from')).toBe(explicitFrom);
      req.flush(mockCollection([]));
    });

    it('sends multiple active types as repeated params, not a comma-joined value', () => {
      // Regression: the backend's type validator rejects a comma inside a
      // single value (only ever exercised once cyclone became a second
      // selectable type alongside earthquake).
      const req = httpMock.expectOne((r) => r.url.includes('/api/events/search'));
      const types = new URL(req.request.url).searchParams.getAll('type');
      expect(types).toEqual(['earthquake', 'cyclone']);
      req.flush(mockCollection([]));
    });

    it('forwards category as repeated query params', () => {
      httpMock.expectOne((r) => r.url.includes('/api/events/search')).flush(mockCollection([]));

      const filter = TestBed.inject(FilterService);
      filter.updateDraft({ orderby: -1, category: ['4', '5'] });
      filter.commit();

      const req = httpMock.expectOne((r) => r.url.includes('/api/events/search'));
      const categories = new URL(req.request.url).searchParams.getAll('category');
      expect(categories).toEqual(['4', '5']);
      req.flush(mockCollection([]));
    });

    it('turning cyclone off (both start active) removes it from the request and refetches', () => {
      httpMock.expectOne((r) => r.url.includes('/api/events/search')).flush(mockCollection([]));

      TestBed.inject(FilterService).toggleEventType({ name: 'cyclone', status: false });

      const req = httpMock.expectOne((r) => r.url.includes('/api/events/search'));
      expect(new URL(req.request.url).searchParams.getAll('type')).toEqual(['earthquake']);
      req.flush(mockCollection([]));
    });

    it('turning cyclone back on after switching it off adds it back and refetches', () => {
      httpMock.expectOne((r) => r.url.includes('/api/events/search')).flush(mockCollection([]));

      const filter = TestBed.inject(FilterService);
      filter.toggleEventType({ name: 'cyclone', status: false });
      httpMock.expectOne((r) => r.url.includes('/api/events/search')).flush(mockCollection([]));

      filter.toggleEventType({ name: 'cyclone', status: true });

      const req = httpMock.expectOne((r) => r.url.includes('/api/events/search'));
      expect(new URL(req.request.url).searchParams.getAll('type')).toEqual(['earthquake', 'cyclone']);
      req.flush(mockCollection([]));
    });
  });

  describe('getAsOf', () => {
    it('reflects the committed "to" of the last search', async () => {
      const filter = TestBed.inject(FilterService);
      httpMock.expectOne((r) => r.url.includes('/api/events/search')).flush(mockCollection([]));

      const to = new Date('2023-06-15T00:00:00.000Z').toISOString();
      filter.updateDraft({ orderby: -1, from: '2023-06-01T00:00:00.000Z', to });
      filter.commit();
      httpMock.expectOne((r) => r.url.includes('/api/events/search')).flush(mockCollection([]));

      const asOf = await firstValueFrom(service.getAsOf());
      expect(asOf).toBe(new Date(to).getTime());
    });
  });
});

describe('EventService — messaging when the server is unreachable (502/503/504/0)', () => {
  // A stub, not the real timer-driven HealthService, so each test controls
  // exactly what "the last known health snapshot" was — no async timing to
  // fight with. A standalone top-level describe (not nested under the main
  // one above) so it owns its own TestBed lifecycle from scratch instead of
  // fighting that suite's own beforeEach/afterEach.
  const makeFakeHealth = (snapshot: HealthResponse | null) => ({
    getHealth: () => of(snapshot),
    snapshot: () => snapshot,
  });

  // There's exactly one search request — fired once, synchronously, by
  // EventService's constructor (FilterService's BehaviorSubjects emit their
  // current value immediately on subscribe). Each test flushes that single
  // request with whatever response it wants to test against.
  const setup = (snapshot: HealthResponse | null) => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: HealthService, useValue: makeFakeHealth(snapshot) },
      ],
    });
    const svc = TestBed.inject(EventService);
    const mock = TestBed.inject(HttpTestingController);
    return { svc, mock };
  };

  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
  });

  it('explains "still loading" instead of implying an outage when the active type is loading', async () => {
    const { svc, mock } = setup({
      status: 'degraded',
      uptime: 1,
      version: '1.2.0',
      ingestion: { earthquake: { state: 'loading' } },
    });

    mock
      .expectOne((r) => r.url.includes('/api/events/search'))
      .flush({}, { status: 502, statusText: 'Bad Gateway' });

    const error = await firstValueFrom(svc.getError());
    expect(error).toContain('still loading its initial data');
    expect(error).not.toContain('restarting');
  });

  it('surfaces the last-known error when the active type has failed', async () => {
    const { svc, mock } = setup({
      status: 'degraded',
      uptime: 1,
      version: '1.2.0',
      ingestion: { earthquake: { state: 'failed', error: 'NOAA unreachable', lastUpdated: 1700000000000 } },
    });

    mock
      .expectOne((r) => r.url.includes('/api/events/search'))
      .flush({}, { status: 503, statusText: 'Service Unavailable' });

    const error = await firstValueFrom(svc.getError());
    expect(error).toContain('NOAA unreachable');
    expect(error).toContain('currently unavailable');
  });

  it('falls back to the generic gateway message when health says the type is ready', async () => {
    const { svc, mock } = setup({
      status: 'ok',
      uptime: 1,
      version: '1.2.0',
      ingestion: { earthquake: { state: 'ready', lastUpdated: Date.now() } },
    });

    mock
      .expectOne((r) => r.url.includes('/api/events/search'))
      .flush({}, { status: 502, statusText: 'Bad Gateway' });

    const error = await firstValueFrom(svc.getError());
    expect(error).toContain('Gateway error (502)');
  });

  it('falls back to the generic gateway message when no health snapshot is known yet', async () => {
    const { svc, mock } = setup(null);

    mock
      .expectOne((r) => r.url.includes('/api/events/search'))
      .flush({}, { status: 504, statusText: 'Gateway Timeout' });

    const error = await firstValueFrom(svc.getError());
    expect(error).toContain('Gateway error (504)');
  });
});
