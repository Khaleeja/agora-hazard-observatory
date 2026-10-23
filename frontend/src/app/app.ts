import { Component, inject, signal, ViewChild } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { filter, fromEvent, debounceTime } from 'rxjs';
import { MessageService } from 'primeng/api';
import { ToastModule } from 'primeng/toast';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { ToggleButton } from 'primeng/togglebutton';

import { EventListComponent } from './components/event-list/event-list';
import { EventDetailPanel } from './components/event-detail-panel/event-detail-panel';
import { FilterBar } from './components/filter-bar/filter-bar';
import { FilterComponent } from './components/filter/filter';
import { MapComponent } from './components/map/map';
import { ActiveParams } from './components/active-params/active-params';
import { EventService } from './services/event';
import { FilterService } from './services/filter';
import { ThemeService } from './services/theme';
import { GeoJSONFeature } from './types/GeoJSONFeature';
import { EVENT_TYPES } from './strategies/event-type.registry';

@Component({
  selector: 'app-root',
  imports: [
    RouterOutlet, FormsModule,
    FilterBar, EventListComponent, MapComponent, ToastModule,
    EventDetailPanel, DialogModule, FilterComponent, ToggleButton, ActiveParams, ButtonModule,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private readonly _eventService = inject(EventService);
  private readonly _filterService = inject(FilterService);
  private readonly _messageService = inject(MessageService);
  protected readonly theme = inject(ThemeService);

  protected readonly title = signal('AGORA Monitoring App');
  protected readonly events = toSignal(this._eventService.getEventList(), { initialValue: [] });
  protected readonly isLoading = toSignal(this._eventService.getLoading(), { initialValue: false });
  protected readonly asOf = toSignal(this._eventService.getAsOf(), { initialValue: Date.now() });

  private readonly _mapSelection = signal<{ event: GeoJSONFeature; ts: number } | null>(null);
  protected readonly mapSelection = this._mapSelection.asReadonly();

  private readonly _isMobile = signal(window.innerWidth < 768);
  protected readonly isMobile = this._isMobile.asReadonly();
  protected readonly mobileTab = signal<'list' | 'filter' | 'map'>('list');
  protected readonly mobileDialogEvent = signal<GeoJSONFeature | null>(null);

  protected readonly eventTypes = EVENT_TYPES;
  protected readonly activeTypes = toSignal(this._filterService.getType(), { initialValue: ['earthquake'] });

  @ViewChild(FilterBar) private _filterBar?: FilterBar;

  private _lastFocusedCard: HTMLElement | null = null;

  constructor() {
    this._eventService.getError()
      .pipe(
        filter((e): e is string => e !== null),
        takeUntilDestroyed(),
      )
      .subscribe((message) => {
        this._messageService.add({
          severity: 'error',
          summary: 'Search failed',
          detail: message,
          icon: 'pi pi-exclamation-circle',
          life: 6000,
        });
      });

    fromEvent(window, 'resize').pipe(
      takeUntilDestroyed(),
      debounceTime(150),
    ).subscribe(() => {
      const w = window.innerWidth;
      this._isMobile.set(w < 768);
      if (w >= 768) this.mobileDialogEvent.set(null);
    });

    // On mobile: switch to map tab when "Pick from map" is pressed in filter
    this._filterService.isPickingLocation().pipe(
      takeUntilDestroyed(),
      filter(picking => picking),
    ).subscribe(() => {
      if (this._isMobile()) this.mobileTab.set('map');
    });

    // Return to filter tab after location is picked
    this._filterService.onLocationPicked().pipe(
      takeUntilDestroyed(),
    ).subscribe(() => {
      if (this._isMobile()) this.mobileTab.set('filter');
    });
  }

  protected dailyAndSwitchTab(): void {
    this._filterService.commitDaily();
    this.mobileTab.set('list');
  }

  protected onEventSelected(event: GeoJSONFeature): void {
    this._lastFocusedCard = document.activeElement as HTMLElement;
    if (this._isMobile()) {
      this.mobileDialogEvent.set(event);
      setTimeout(() => document.querySelector<HTMLElement>('.mobile-dialog-close')?.focus(), 100);
    } else {
      this._mapSelection.set({ event, ts: Date.now() });
    }
  }

  protected closeMobileDialog(): void {
    this.mobileDialogEvent.set(null);
    setTimeout(() => this._lastFocusedCard?.focus(), 50);
  }

  protected returnFocusToLastCard(): void {
    setTimeout(() => this._lastFocusedCard?.focus(), 50);
  }

  protected skipToFilterForm(event: Event): void {
    event.preventDefault();
    if (this._isMobile()) {
      this.mobileTab.set('filter');
      setTimeout(() => {
        const el = document.getElementById('main-filter-region');
        const first = el?.querySelector<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        first?.focus({ preventScroll: true });
      }, 50);
    } else {
      this._filterBar?.openDrawer();
      // focusFirstInFilter() is triggered by (onShow) on the drawer
    }
  }

  protected skipTo(event: Event, id: string): void {
    event.preventDefault();
    const el = document.getElementById(id);
    if (!el) return;
    // Elements with an explicit tabindex (even -1) can be focused programmatically
    const target: HTMLElement | null = el.hasAttribute('tabindex')
      ? el
      : el.querySelector<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
    target?.focus({ preventScroll: true });
  }

  protected viewOnMap(): void {
    const ev = this.mobileDialogEvent();
    if (!ev) return;
    this.mobileDialogEvent.set(null);
    this.mobileTab.set('map');
    this._mapSelection.set({ event: ev, ts: Date.now() });
  }

  protected isTypeActive(name: string): boolean {
    return this.activeTypes()?.includes(name) ?? false;
  }

  protected toggleType(name: string): void {
    this._filterService.toggleEventType({ name, status: !this.isTypeActive(name) });
  }
}
