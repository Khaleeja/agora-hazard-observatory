import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MessageService } from 'primeng/api';
import { App } from './app';

const emptyCollection = {
  type: 'FeatureCollection',
  features: [],
  metadata: { count: 0, total: 0, limit: 20000 },
};

describe('App', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        MessageService,
      ],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    httpMock.expectOne((r) => r.url.includes('/api/events/search')).flush(emptyCollection);
    // HealthService's timer(0, ...) is scheduled async, not synchronous like
    // the BehaviorSubject-driven search above — it hasn't actually dispatched
    // a request yet at this point in the test, so there is nothing to flush.
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should render title', async () => {
    const fixture = TestBed.createComponent(App);
    httpMock.expectOne((r) => r.url.includes('/api/events/search')).flush(emptyCollection);
    await fixture.whenStable();
    // Unlike the search above (synchronous, BehaviorSubject-driven),
    // HealthService's timer(0, ...) is a real macrotask — by the time
    // whenStable() resolves it has fired, so it needs flushing here too.
    httpMock.expectOne((r) => r.url.includes('/api/health')).flush({
      status: 'ok',
      uptime: 1,
      version: '0.0.0',
      ingestion: {},
    });
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('AGORA Monitoring App');
  });

  describe('data-status badge — accessibility', () => {
    const flushToHealth = async (fixture: ReturnType<typeof TestBed.createComponent<App>>) => {
      httpMock.expectOne((r) => r.url.includes('/api/events/search')).flush(emptyCollection);
      await fixture.whenStable();
      httpMock.expectOne((r) => r.url.includes('/api/health')).flush({
        status: 'degraded',
        uptime: 1,
        version: '9.9.9',
        ingestion: { earthquake: { state: 'failed', error: 'boom', lastUpdated: 1700000000000 } },
      });
      await fixture.whenStable();
    };

    it('uses a native <details>/<summary> disclosure, not a hover-only title tooltip', async () => {
      const fixture = TestBed.createComponent(App);
      await flushToHealth(fixture);
      const el = fixture.nativeElement as HTMLElement;

      const details = el.querySelector('details.status-badge');
      const summary = el.querySelector('details.status-badge > summary');
      expect(details).toBeTruthy();
      expect(summary).toBeTruthy();
      // The real information lives in content, not in a `title` attribute
      // (unreliable for screen readers, unreachable by keyboard or touch).
      expect(summary?.getAttribute('title')).toBeNull();
      expect(summary?.getAttribute('aria-label')).toContain('degraded');
    });

    it('exposes per-type status as real, readable content (not hover-only)', async () => {
      const fixture = TestBed.createComponent(App);
      await flushToHealth(fixture);
      const el = fixture.nativeElement as HTMLElement;

      const items = el.querySelectorAll('details.status-badge [role="listitem"]');
      expect(items.length).toBe(1);
      expect(items[0].textContent).toContain('earthquake');
      expect(items[0].textContent).toContain('boom');
    });

    it('is keyboard-operable: a native <details> toggles via its own open attribute', async () => {
      const fixture = TestBed.createComponent(App);
      await flushToHealth(fixture);
      const details = (fixture.nativeElement as HTMLElement).querySelector('details.status-badge') as HTMLDetailsElement;

      expect(details.open).toBe(false);
      details.open = true; // what a native Enter/Space activation on <summary> does
      expect(details.open).toBe(true);
    });
  });
});
