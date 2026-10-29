import { Component, computed, inject, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputNumberModule } from 'primeng/inputnumber';
import { FilterService } from '../../services/filter';
import { EventService } from '../../services/event';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { EVENT_TYPE_REGISTRY } from '../../strategies/event-type.registry';

@Component({
  selector: 'app-filter',
  imports: [FormsModule, ButtonModule, InputNumberModule, ToggleSwitchModule],
  templateUrl: './filter.html',
  styleUrl: './filter.scss',
})
export class FilterComponent {
  private readonly _filterService = inject(FilterService);
  private readonly _eventService = inject(EventService);

  private readonly _meta = toSignal(this._eventService.getSearchMeta(), { initialValue: null });
  protected readonly isLoading = toSignal(this._eventService.getLoading(), { initialValue: true });
  protected readonly loadError = toSignal(this._eventService.getError(), { initialValue: null });
  protected readonly retrieved = computed(() => this._meta()?.retrieved ?? 0);
  protected readonly total = computed(() => this._meta()?.total ?? 0);
  protected readonly isTruncated = computed(() => {
    const m = this._meta();
    if (!m) return false;
    // backend may report total = retrieved (bug), so also check retrieved >= limit
    return m.total > m.retrieved || m.retrieved >= m.limit;
  });

  readonly searched = output<void>();

  protected readonly activeTypes = toSignal(this._filterService.getType(), {
    initialValue: ['earthquake'],
  });

  protected readonly showMagnitude = computed(() =>
    this.activeTypes().some((t) => EVENT_TYPE_REGISTRY.get(t)?.filterFields.has('magnitude')),
  );

  protected readonly showCategory = computed(() =>
    this.activeTypes().some((t) => EVENT_TYPE_REGISTRY.get(t)?.filterFields.has('category')),
  );

  protected readonly severityOptions: { value: 'Low' | 'Medium' | 'High'; label: string }[] = [
    { value: 'Low', label: 'Low' },
    { value: 'Medium', label: 'Medium' },
    { value: 'High', label: 'High' },
  ];

  // Saffir-Simpson scale, as produced by IBTrACSAdapter on the backend
  protected readonly categoryOptions: { value: string; label: string }[] = [
    { value: 'TD', label: 'TD' },
    { value: 'TS', label: 'TS' },
    { value: '1', label: 'Cat 1' },
    { value: '2', label: 'Cat 2' },
    { value: '3', label: 'Cat 3' },
    { value: '4', label: 'Cat 4' },
    { value: '5', label: 'Cat 5' },
  ];

  protected readonly activeSeverities = toSignal(this._filterService.getSeverity(), {
    initialValue: [] as ('Low' | 'Medium' | 'High')[],
  });

  protected readonly activeCategories = toSignal(this._filterService.getCategory(), {
    initialValue: [] as string[],
  });

  // Mirrors FilterService.commitDaily()'s default committed search (last
  // 24h) so the fields shown on first load already match what's actually
  // being searched, instead of sitting empty until the user touches them.
  protected fromDate = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  protected toDate = new Date().toISOString().slice(0, 10);
  protected fromAll = false;
  protected toNow = false;
  protected minMag: number | null = null;
  protected maxMag: number | null = null;
  protected limit = 500;
  protected orderBy: 1 | -1 = -1;
  protected posLat: number | null = null;
  protected posLon: number | null = null;
  protected posRadius = 500;

  constructor() {
    this._filterService.onLocationPicked()
      .pipe(takeUntilDestroyed())
      .subscribe(({ lat, lon }) => {
        this.posLat = lat;
        this.posLon = lon;
      });
  }

  protected setOrderBy(v: 1 | -1): void { this.orderBy = v; }

  protected pickFromMap(): void {
    this._filterService.startLocationPick();
  }

  protected clearLocation(): void {
    this.posLat = null;
    this.posLon = null;
  }

  protected isSeverityActive(sev: 'Low' | 'Medium' | 'High'): boolean {
    return this.activeSeverities().includes(sev);
  }

  protected toggleSeverity(sev: 'Low' | 'Medium' | 'High'): void {
    this._filterService.toggleSeverity(sev);
  }

  protected isCategoryActive(cat: string): boolean {
    return this.activeCategories().includes(cat);
  }

  protected toggleCategory(cat: string): void {
    this._filterService.toggleCategory(cat);
  }

  protected search(): void {
    this._filterService.updateDraft({
      from: this.fromAll ? undefined : (this.fromDate ? new Date(this.fromDate).toISOString() : undefined),
      to: this.toNow ? new Date().toISOString() : (this.toDate ? new Date(this.toDate).toISOString() : undefined),
      minmag: this.minMag ?? undefined,
      maxmag: this.maxMag ?? undefined,
      limit: this.limit,
      orderby: this.orderBy,
      position:
        this.posLat != null && this.posLon != null
          ? { lat: this.posLat, lon: this.posLon, radius: this.posRadius }
          : undefined,
      severity: this.activeSeverities().length > 0 ? this.activeSeverities() : undefined,
      category: this.activeCategories().length > 0 ? this.activeCategories() : undefined,
    });
    this._filterService.commit();
    this.searched.emit();
  }

  protected reset(): void {
    this.fromDate = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    this.toDate = new Date().toISOString().slice(0, 10);
    this.fromAll = false;
    this.toNow = false;
    this.minMag = null;
    this.maxMag = null;
    this.limit = 500;
    this.orderBy = -1;
    this.posLat = null;
    this.posLon = null;
    this.posRadius = 500;
    this._filterService.clearSeverity();
    this._filterService.clearCategory();
  }
}
