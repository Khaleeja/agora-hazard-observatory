import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { EventService } from './event';
import { FilterService } from './filter';
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
    // Cyclones lack magnitude, and their timestamp is "last update" (which
    // IBTrACS can lag by days), not "when it happened" — so the earthquake
    // daily-digest defaults (minmag, 24h window) must not silently hide them.

    it('earthquake-only view keeps minmag and the 24h daily window (unchanged behaviour)', () => {
      const req = httpMock.expectOne((r) => r.url.includes('/api/events/search'));
      expect(req.request.url).toContain('minmag=');
      const from = new URL(req.request.url).searchParams.get('from');
      expect(from).not.toBeNull();
      expect(Date.now() - new Date(from!).getTime()).toBeLessThan(25 * 3_600_000);
      req.flush(mockCollection([]));
    });

    it('still sends minmag/maxmag once cyclone is among the active types — the backend scopes it, not the frontend', () => {
      // Regression: this used to be omitted client-side to avoid silently
      // excluding cyclones, but that meant magnitude filtering was
      // unavailable the moment cyclone was toggled on. The backend now
      // folds magnitude into the earthquake-only branch of the query (see
      // GeoEventRepository._applyPerPhenomenonFilters), so it's always
      // safe to send as-is.
      httpMock.expectOne((r) => r.url.includes('/api/events/search')).flush(mockCollection([]));

      const filter = TestBed.inject(FilterService);
      filter.toggleEventType({ name: 'cyclone', status: true });
      httpMock.expectOne((r) => r.url.includes('/api/events/search')).flush(mockCollection([]));

      filter.updateDraft({ orderby: -1, minmag: 5, maxmag: 8 });
      filter.commit();

      const req = httpMock.expectOne((r) => r.url.includes('/api/events/search'));
      expect(req.request.url).toContain('minmag=5');
      expect(req.request.url).toContain('maxmag=8');
      req.flush(mockCollection([]));
    });

    it('sends from/to unchanged when cyclone is active — overlap tolerance is a backend concern', () => {
      // See GeoEventRepository._applyPerPhenomenonFilters: the server decides how a
      // cyclone's overlap/lag tolerance interacts with the requested window,
      // not the frontend — so the 24h default reaches the server as-is.
      httpMock.expectOne((r) => r.url.includes('/api/events/search')).flush(mockCollection([]));

      TestBed.inject(FilterService).toggleEventType({ name: 'cyclone', status: true });

      const req = httpMock.expectOne((r) => r.url.includes('/api/events/search'));
      const from = new URL(req.request.url).searchParams.get('from');
      expect(from).not.toBeNull();
      expect(Date.now() - new Date(from!).getTime()).toBeLessThan(25 * 3_600_000);
      req.flush(mockCollection([]));
    });

    it('sends no from at all when "All time" is selected, even with cyclone active', () => {
      httpMock.expectOne((r) => r.url.includes('/api/events/search')).flush(mockCollection([]));

      const filter = TestBed.inject(FilterService);
      filter.toggleEventType({ name: 'cyclone', status: true });
      httpMock.expectOne((r) => r.url.includes('/api/events/search')).flush(mockCollection([]));

      filter.updateDraft({ orderby: -1, from: undefined, to: undefined });
      filter.commit();

      const req = httpMock.expectOne((r) => r.url.includes('/api/events/search'));
      expect(new URL(req.request.url).searchParams.has('from')).toBe(false);
      req.flush(mockCollection([]));
    });

    it('sends an explicit user-selected from date through unchanged', () => {
      httpMock.expectOne((r) => r.url.includes('/api/events/search')).flush(mockCollection([]));

      const filter = TestBed.inject(FilterService);
      filter.toggleEventType({ name: 'cyclone', status: true });
      httpMock.expectOne((r) => r.url.includes('/api/events/search')).flush(mockCollection([]));

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
      httpMock.expectOne((r) => r.url.includes('/api/events/search')).flush(mockCollection([]));

      TestBed.inject(FilterService).toggleEventType({ name: 'cyclone', status: true });

      const req = httpMock.expectOne((r) => r.url.includes('/api/events/search'));
      const types = new URL(req.request.url).searchParams.getAll('type');
      expect(types).toEqual(['earthquake', 'cyclone']);
      req.flush(mockCollection([]));
    });

    it('forwards category as repeated query params', () => {
      httpMock.expectOne((r) => r.url.includes('/api/events/search')).flush(mockCollection([]));

      const filter = TestBed.inject(FilterService);
      filter.toggleEventType({ name: 'cyclone', status: true });
      httpMock.expectOne((r) => r.url.includes('/api/events/search')).flush(mockCollection([]));

      filter.updateDraft({ orderby: -1, category: ['4', '5'] });
      filter.commit();

      const req = httpMock.expectOne((r) => r.url.includes('/api/events/search'));
      const categories = new URL(req.request.url).searchParams.getAll('category');
      expect(categories).toEqual(['4', '5']);
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
