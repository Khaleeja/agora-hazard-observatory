import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { HealthService, HealthResponse } from './health';

const mockHealth = (overrides: Partial<HealthResponse> = {}): HealthResponse => ({
  status: 'ok',
  uptime: 123,
  version: '1.2.0',
  ingestion: {
    earthquake: { state: 'ready', lastUpdated: Date.now(), count: 100 },
  },
  ...overrides,
});

// This project is zoneless (see README), so Angular's zone.js-based
// fakeAsync()/tick() aren't available here — timer(0, ...)'s first emission
// is a real macrotask, let it flush with a real (zero-delay) setTimeout
// instead of faking time.
const flushMacrotasks = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('HealthService', () => {
  let service: HealthService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(HealthService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('has no snapshot before the first poll resolves', async () => {
    expect(service.snapshot()).toBeNull();
    await flushMacrotasks();
    httpMock.expectOne((r) => r.url.includes('/api/health')).flush(mockHealth());
  });

  it('exposes the response via getHealth() once the first poll resolves', async () => {
    const promise = firstValueFrom(service.getHealth());
    await flushMacrotasks();
    httpMock.expectOne((r) => r.url.includes('/api/health')).flush(mockHealth());

    const health = await promise;
    expect(health?.version).toBe('1.2.0');
  });

  it('updates snapshot() after the first poll resolves', async () => {
    await flushMacrotasks();
    httpMock.expectOne((r) => r.url.includes('/api/health')).flush(mockHealth());
    await flushMacrotasks();

    expect(service.snapshot()?.version).toBe('1.2.0');
    expect(service.snapshot()?.ingestion['earthquake'].state).toBe('ready');
  });

  it('resolves to null (not an error) when the poll fails', async () => {
    await flushMacrotasks();
    httpMock
      .expectOne((r) => r.url.includes('/api/health'))
      .flush({}, { status: 500, statusText: 'Server Error' });
    await flushMacrotasks();

    expect(service.snapshot()).toBeNull();
  });
});
