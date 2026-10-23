import {
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { GeoJSONFeature } from '../../types/GeoJSONFeature';
import { EventService } from '../../services/event';
import { FilterService } from '../../services/filter';
import { EventDetailPanel } from '../event-detail-panel/event-detail-panel';
import { catchError } from 'rxjs';
import type { Subscription } from 'rxjs';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { MessageService } from 'primeng/api';
import { environment } from '../../../environments/environment';
import { EVENT_TYPE_REGISTRY } from '../../strategies/event-type.registry';
import { pointAsOf } from '../../strategies/cyclone.strategy';

(window as unknown as { CESIUM_BASE_URL: string }).CESIUM_BASE_URL = 'assets/cesium/';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const Cesium: any;

type MapState = 'placeholder' | 'loading-assets' | 'cesium' | 'error';


@Component({
  selector: 'app-map',
  imports: [EventDetailPanel, DecimalPipe],
  templateUrl: './map.html',
  styleUrl: './map.scss',
})
export class MapComponent {
  private readonly _eventService = inject(EventService);
  private readonly _filterService = inject(FilterService);
  private readonly _messageService = inject(MessageService);
  private readonly _destroyRef = inject(DestroyRef);

  private readonly _eventItems = signal<GeoJSONFeature[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _viewer: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _pinBuilder: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _dataSource: any;
  // Separate, transient overlay for the currently-selected event's extra
  // detail (e.g. a cyclone's full track) — kept apart from _dataSource so
  // clearing/redrawing it never disturbs the clustered marker set.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _detailDataSource: any;
  private readonly _pinCache = new Map<string, string>();
  private readonly _clusterPinCache = new Map<number, string>();
  private _detailSub: Subscription | null = null;

  readonly pendingSelect = input<{ event: GeoJSONFeature; ts: number } | null>(null);
  readonly popupClosed = output<void>();

  private readonly _meta = toSignal(this._eventService.getSearchMeta(), { initialValue: null });
  private readonly _asOf = toSignal(this._eventService.getAsOf(), { initialValue: Date.now() });
  private readonly _mapState = signal<MapState>('placeholder');

  protected readonly mapState = this._mapState.asReadonly();
  protected readonly loadingState = signal<'loading' | 'success' | 'error'>('loading');
  protected readonly selectedEvent = signal<GeoJSONFeature | null>(null);
  protected readonly popupLoading = signal(false);
  protected readonly isPicking = toSignal(this._filterService.isPickingLocation(), { initialValue: false });
  protected readonly visibleCount = signal(0);
  protected readonly totalLoaded = computed(() => this._meta()?.retrieved ?? 0);
  protected readonly scaleLabel = signal('');
  protected readonly scaleWidth = signal(100);
  protected readonly isClustered = signal(true);

  constructor() {
    // Auto-open when the user explicitly requests to view an event or pick a location
    effect(() => {
      const triggered = (this.pendingSelect() || this.isPicking()) && this._mapState() === 'placeholder';
      if (triggered) untracked(() => this.openMap());
    });

    effect(() => {
      const events = this._eventItems();
      if (!this._viewer) return;
      this._refreshMarkers(events);
    });

    effect(() => {
      const pending = this.pendingSelect();
      if (!pending || this.loadingState() !== 'success') return;
      untracked(() => this._handleExternalSelect(pending.event, true));
    });

    effect(() => {
      if (this.selectedEvent()) {
        setTimeout(() => {
          document.querySelector<HTMLElement>('.popup-close')?.focus();
        }, 80);
      }
    });

    // Extra map content for the selected event only (e.g. a cyclone's full
    // track) — separate from the passive per-event marker in _refreshMarkers.
    effect(() => {
      const event = this.selectedEvent();
      if (!this._detailDataSource) return;
      this._detailDataSource.entities.removeAll();
      if (event) {
        const strategy = EVENT_TYPE_REGISTRY.get(event.properties.eventType);
        strategy?.renderDetail?.(event, Cesium, this._detailDataSource);
      }
      this._viewer?.scene.requestRender();
    });

    effect(() => {
      if (this.isPicking()) {
        setTimeout(() => {
          document.querySelector<HTMLElement>('.map-pick-cancel')?.focus();
        }, 100);
      }
    });
  }

  protected openMap(): void {
    const state = this._mapState();
    if (state === 'loading-assets' || state === 'cesium') return;
    this._mapState.set('loading-assets');
    this._loadCesiumAssets()
      .then(() => {
        this._mapState.set('cesium');
        // Two frames: first for Angular to update the DOM, second for layout to settle
        requestAnimationFrame(() =>
          requestAnimationFrame(() => this._initCesium()),
        );
      })
      .catch(() => this._mapState.set('error'));
  }

  private _loadCesiumAssets(): Promise<void> {
    return new Promise((resolve, reject) => {
      if ((window as Window & { Cesium?: unknown }).Cesium) { resolve(); return; }

      if (!document.querySelector('link[href*="cesium/Widgets/widgets.css"]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'assets/cesium/Widgets/widgets.css';
        document.head.appendChild(link);
      }

      // Remove any previously failed script before retrying
      document.querySelector('script[src*="cesium/Cesium.js"]')?.remove();

      const script = document.createElement('script');
      script.src = 'assets/cesium/Cesium.js';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load Cesium'));
      document.head.appendChild(script);
    });
  }

  private _initCesium(): void {
    Cesium.Ion.defaultAccessToken = undefined;
    Cesium.ArcGisMapService.defaultAccessToken = environment.arcgisApiKey;
    this._pinBuilder = new Cesium.PinBuilder();

    const allModels = Cesium.createDefaultImageryProviderViewModels();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filtered = allModels.filter((m: any) => {
      const name = (m.name as string).replace(/\p{Cf}/gu, '');
      return name === 'OpenStreetMap' || name === 'ArcGIS World Imagery';
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const initialModel = filtered.find((m: any) => m.name === 'OpenStreetMap') ?? filtered[0];

    this._viewer = new Cesium.Viewer('cesiumContainer', {
      baseLayerPicker: true,
      imageryProviderViewModels: filtered,
      selectedImageryProviderViewModel: initialModel,
      terrainProviderViewModels: [],
      geocoder: false,
      timeline: false,
      animation: false,
      infoBox: false,
      requestRenderMode: true,
      maximumRenderTimeChange: Infinity,
    });

    const scene = this._viewer.scene;
    scene.fxaa = false;
    scene.fog.enabled = false;
    scene.globe.enableLighting = false;
    scene.skyAtmosphere.show = false;
    scene.sun.show = false;
    scene.moon.show = false;
    scene.skyBox.show = false;

    const controller = scene.screenSpaceCameraController;
    controller.enableTilt = false;
    controller.minimumZoomDistance = 500;
    controller.maximumZoomDistance = 20_000_000;

    scene.morphComplete.addEventListener(() => {
      if (scene.mode === Cesium.SceneMode.COLUMBUS_VIEW) {
        scene.morphTo3D(0);
        return;
      }
      // In 2D the flat projection needs ~35-40 Mm to show the full world
      controller.maximumZoomDistance =
        scene.mode === Cesium.SceneMode.SCENE2D ? 40_000_000 : 20_000_000;
    });

    this._dataSource = new Cesium.CustomDataSource('events');
    this._viewer.dataSources.add(this._dataSource);
    this._dataSource.clustering.enabled = true;
    this._dataSource.clustering.pixelRange = 60;
    this._dataSource.clustering.minimumClusterSize = 2;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this._dataSource.clustering.clusterEvent.addEventListener((clusteredEntities: any[], cluster: any) => {
      cluster.label.show = false;
      cluster.billboard.show = true;
      cluster.billboard.image = this._getClusterPin(clusteredEntities.length);
      cluster.billboard.verticalOrigin = Cesium.VerticalOrigin.BOTTOM;
    });

    this._detailDataSource = new Cesium.CustomDataSource('event-detail');
    this._viewer.dataSources.add(this._detailDataSource);

    this._destroyRef.onDestroy(() => this._detailSub?.unsubscribe());

    // Remove Cesium's internal UI widgets from keyboard/AT navigation
    // and patch accessibility attributes that Cesium does not provide
    setTimeout(() => {
      const container = document.getElementById('cesiumContainer');
      if (!container) return;

      container.querySelectorAll<HTMLElement>('button, a, input, select, [tabindex]')
        .forEach(el => el.setAttribute('tabindex', '-1'));
      container.querySelectorAll<HTMLAnchorElement>('a:not([href])')
        .forEach(el => el.setAttribute('href', '#'));

      // Decorative widget icons — empty alt suppresses WAVE "missing alt" errors
      container.querySelectorAll<HTMLImageElement>(
        '.cesium-baseLayerPicker-selected, .cesium-baseLayerPicker-itemIcon, .cesium-navigation-button-icon'
      ).forEach(img => { if (!img.hasAttribute('alt')) img.alt = ''; });

      // Navigation help modal images — descriptive alt based on filename
      container.querySelectorAll<HTMLImageElement>('img[src*="NavigationHelp"]').forEach(img => {
        if (img.hasAttribute('alt')) return;
        const src = img.getAttribute('src') ?? '';
        if (src.includes('MouseLeft'))   img.alt = 'Left mouse button';
        else if (src.includes('MouseMiddle')) img.alt = 'Middle mouse button / scroll wheel';
        else if (src.includes('MouseRight'))  img.alt = 'Right mouse button';
        else if (src.includes('Mouse'))       img.alt = 'Mouse';
        else if (src.includes('TouchDrag'))   img.alt = 'Two-finger drag gesture';
        else if (src.includes('Touch'))       img.alt = 'Touch gesture';
        else img.alt = '';
      });

      // Cesium ion credit — move title to alt and remove title to avoid redundant-title WAVE alert
      container.querySelectorAll<HTMLImageElement>('img[src*="ion-credit"]').forEach(img => {
        if (!img.hasAttribute('alt')) img.alt = img.getAttribute('title') ?? 'Cesium ion';
        img.removeAttribute('title');
      });

      // Navigation help table — mark as layout table, not data table
      container.querySelectorAll<HTMLTableElement>('table').forEach(t => {
        t.setAttribute('role', 'presentation');
      });
    }, 2000);

    this._flyToUserLocation();

    this._viewer.camera.moveEnd.addEventListener(() => {
      this._updateVisibleCount();
      this._updateScale();
    });

    const handler = new Cesium.ScreenSpaceEventHandler(this._viewer.canvas);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    handler.setInputAction((click: any) => {
      if (this.isPicking()) {
        const cartesian = this._viewer.camera.pickEllipsoid(click.position);
        if (!cartesian) return;
        const carto = Cesium.Ellipsoid.WGS84.cartesianToCartographic(cartesian);
        const lat = parseFloat(Cesium.Math.toDegrees(carto.latitude).toFixed(4));
        const lon = parseFloat(Cesium.Math.toDegrees(carto.longitude).toFixed(4));
        this._filterService.confirmLocationPick(lat, lon);
        return;
      }
      const picked = this._viewer.scene.pick(click.position);
      if (!Cesium.defined(picked)) {
        this.selectedEvent.set(null);
        return;
      }
      const entity = picked.id;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const feature = entity instanceof Cesium.Entity ? (entity as any)._feature as GeoJSONFeature | undefined : undefined;
      if (!feature) {
        this.selectedEvent.set(null);
        return;
      }
      this._handleExternalSelect(feature);
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    this._eventService
      .getEventList()
      .pipe(
        takeUntilDestroyed(this._destroyRef),
        catchError((err) => {
          this.loadingState.set('error');
          console.error('Error loading events:', err);
          throw err;
        }),
      )
      .subscribe((data) => {
        this._eventItems.set(data);
        this.loadingState.set('success');
      });
  }

  private _getPinImage(event: GeoJSONFeature): string {
    const sev = event.properties.severity;
    // Cyclones have no magnitude at all — the Saffir-Simpson category (TD,
    // TS, 1-5) is the closer analogue and far more legible on a pin than '?'.
    const label =
      event.properties.category ??
      (event.properties.magnitude != null
        ? Math.min(Math.floor(+event.properties.magnitude), 10).toString()
        : '?');
    const key = `${sev}-${label}`;
    if (!this._pinCache.has(key)) {
      this._pinCache.set(key, this._pinBuilder.fromText(label, this._severityColor(sev), 48).toDataURL());
    }
    return this._pinCache.get(key)!;
  }

  private _refreshMarkers(events: GeoJSONFeature[]): void {
    this._dataSource.entities.removeAll();
    const asOf = this._asOf();

    for (const event of events) {
      const strategy = EVENT_TYPE_REGISTRY.get(event.properties.eventType);
      if (!strategy) continue;
      const entity = strategy.renderOnMap(event, Cesium, this._dataSource, (f) => this._getPinImage(f), asOf);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (entity) (entity as any)._feature = event;
    }

    this._viewer.scene.requestRender();
    this._updateVisibleCount();
    this._updateScale();
  }

  private _updateVisibleCount(): void {
    if (!this._viewer || !this._dataSource) return;
    const camera = this._viewer.camera;
    const scene = this._viewer.scene;
    const is3D = scene.mode === Cesium.SceneMode.SCENE3D;
    const cullingVolume = camera.frustum.computeCullingVolume(
      camera.position,
      camera.direction,
      camera.up,
    );
    const toCamera = new Cesium.Cartesian3();
    const surfaceNormal = new Cesium.Cartesian3();
    let count = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const entities = this._dataSource.entities.values as any[];
    for (const entity of entities) {
      const pos = entity.position?.getValue(Cesium.JulianDate.now());
      if (!pos) continue;
      const sphere = new Cesium.BoundingSphere(pos, 0);
      if (cullingVolume.computeVisibility(sphere) === Cesium.Intersect.OUTSIDE) continue;
      if (is3D) {
        Cesium.Cartesian3.normalize(pos, surfaceNormal);
        Cesium.Cartesian3.subtract(camera.position, pos, toCamera);
        Cesium.Cartesian3.normalize(toCamera, toCamera);
        if (Cesium.Cartesian3.dot(surfaceNormal, toCamera) <= 0) continue;
      }
      count++;
    }
    this.visibleCount.set(count);
  }

  private _getClusterPin(count: number): string {
    const key = Math.min(count, 999);
    if (this._clusterPinCache.has(key)) return this._clusterPinCache.get(key)!;
    const size = 48;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
    ctx.fillStyle = '#06B6D4';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${count > 99 ? 11 : 13}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(count > 999 ? '999+' : String(count), size / 2, size / 2);
    const url = canvas.toDataURL();
    this._clusterPinCache.set(key, url);
    return url;
  }

  private _handleExternalSelect(event: GeoJSONFeature, fromList = false): void {
    this._flyToEvent(event, fromList);
    if (fromList) {
      // Selection from the list: Cesium's own click handler hasn't fired, so set selectedEntity
      // manually so the selection indicator appears on the correct pin.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const entity = (this._dataSource?.entities?.values as any[] | undefined)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ?.find((e: any) => e._feature?.properties?.id === event.properties.id);
      if (entity) this._viewer.selectedEntity = entity;
    }
    this._detailSub?.unsubscribe();
    this.selectedEvent.set(null);
    this.popupLoading.set(true);

    this._detailSub = this._eventService
      .getDetail(event.properties.id, event.properties.source)
      .subscribe({
        next: (full) => {
          this.selectedEvent.set(full);
          this.popupLoading.set(false);
        },
        error: () => {
          this.selectedEvent.set(event);
          this.popupLoading.set(false);
          this._messageService.add({
            severity: 'warn',
            summary: 'Partial data',
            detail: 'Could not load full event details.',
            icon: 'pi pi-exclamation-triangle',
            life: 4000,
          });
        },
      });
  }

  private _flyToEvent(event: GeoJSONFeature, fromList = false): void {
    if (!this._viewer) return;

    if (event.geometry.type === 'LineString') {
      // A cyclone's track can span thousands of km — flying to a single
      // point at a fixed close-up altitude only shows a fragment of it.
      // Fit the whole path (the same one renderDetail draws) on screen
      // instead of picking an arbitrary zoom level.
      const coords = event.geometry.coordinates as number[][];
      const positions = coords.map(([lon, lat]) => Cesium.Cartesian3.fromDegrees(lon, lat));
      const sphere = Cesium.BoundingSphere.fromPoints(positions);
      sphere.radius *= 1.3; // padding so the track isn't flush against the screen edges
      this._viewer.camera.flyToBoundingSphere(sphere, {
        duration: fromList ? 1.5 : 1.0,
      });
      return;
    }

    // Same "as of the search" resolution as the passive pin (pointAsOf), so
    // flying to an event lands exactly where its marker was drawn.
    const target = pointAsOf(event, this._asOf());
    if (!target) return;
    const [lon, lat] = target;
    let altitude: number;
    if (fromList) {
      altitude = 500_000;
    } else {
      // Clicked directly on the map: keep the current altitude so the user
      // doesn't lose the zoom level they used to isolate the pin. Cap at 2 Mm
      // so an extreme zoom-out still gives a reasonable view of the area.
      altitude = Math.min(this._viewer.camera.positionCartographic.height, 2_000_000);
    }
    this._viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(lon, lat, altitude),
      duration: fromList ? 1.5 : 1.0,
    });
  }

  protected toggleClusterMode(): void {
    const next = !this.isClustered();
    this.isClustered.set(next);
    if (this._dataSource) {
      this._dataSource.clustering.enabled = next;
      this._viewer.scene.requestRender();
    }
  }

  protected cancelPick(): void {
    this._filterService.cancelLocationPick();
  }

  protected closePopup(): void {
    this.selectedEvent.set(null);
    this.popupLoading.set(false);
    if (this._viewer) this._viewer.selectedEntity = null;
    this.popupClosed.emit();
  }

  protected onPopupKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      this.closePopup();
      return;
    }
    if (e.key !== 'Tab') return;

    const popup = document.querySelector<HTMLElement>('.event-popup');
    const focusable = Array.from(
      popup?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])'
      ) ?? []
    );
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last.focus(); }
    } else {
      if (document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }

  private _updateScale(): void {
    if (!this._viewer) return;
    const scene = this._viewer.scene;
    const canvas = this._viewer.canvas;
    const cx = canvas.clientWidth / 2;
    const cy = canvas.clientHeight / 2;
    const p1 = scene.camera.pickEllipsoid(new Cesium.Cartesian2(cx - 50, cy));
    const p2 = scene.camera.pickEllipsoid(new Cesium.Cartesian2(cx + 50, cy));
    if (!p1 || !p2) return;
    const c1 = Cesium.Ellipsoid.WGS84.cartesianToCartographic(p1);
    const c2 = Cesium.Ellipsoid.WGS84.cartesianToCartographic(p2);
    const geodesic = new Cesium.EllipsoidGeodesic(c1, c2);
    const metersFor100px = geodesic.surfaceDistance;
    const { meters, label } = this._niceDistance(metersFor100px);
    this.scaleWidth.set(Math.round((meters / metersFor100px) * 100));
    this.scaleLabel.set(label);
  }

  private _niceDistance(meters: number): { meters: number; label: string } {
    const steps: [number, string][] = [
      [10, '10 m'], [20, '20 m'], [50, '50 m'],
      [100, '100 m'], [200, '200 m'], [500, '500 m'],
      [1_000, '1 km'], [2_000, '2 km'], [5_000, '5 km'],
      [10_000, '10 km'], [20_000, '20 km'], [50_000, '50 km'],
      [100_000, '100 km'], [200_000, '200 km'], [500_000, '500 km'],
      [1_000_000, '1000 km'], [2_000_000, '2000 km'], [5_000_000, '5000 km'],
    ];
    const [m, label] = steps.find(([m]) => m >= meters) ?? steps[steps.length - 1];
    return { meters: m, label };
  }

  private _flyToUserLocation(): void {
    // ipwho.is: free, CORS-enabled, no auth required
    fetch('https://ipwho.is/')
      .then((r) => r.json())
      .then((data: { success?: boolean; latitude?: number; longitude?: number }) => {
        if (!data.success || data.latitude == null || data.longitude == null) return;
        this._viewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(data.longitude, data.latitude, 4_000_000),
          duration: 2,
        });
      })
      .catch(() => undefined);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _severityColor(severity: string): any {
    if (severity === 'Low') return Cesium.Color.GREEN;
    if (severity === 'Medium') return Cesium.Color.ORANGE;
    return Cesium.Color.RED;
  }
}
