import { Component, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms'; // needed for ngModel directive on p-togglebutton
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ButtonModule } from 'primeng/button';
import { DrawerModule } from 'primeng/drawer';
import { FilterComponent } from '../filter/filter';
import { ToggleButton } from 'primeng/togglebutton';
import { ToolbarModule } from 'primeng/toolbar';
import { FilterService } from '../../services/filter';
import { ActiveParams } from '../active-params/active-params';
import { EVENT_TYPES } from '../../strategies/event-type.registry';

@Component({
  selector: 'app-filter-bar',
  imports: [FormsModule, DrawerModule, ButtonModule, FilterComponent, ToggleButton, ToolbarModule, ActiveParams],
  templateUrl: './filter-bar.html',
  styleUrl: './filter-bar.scss',
})
export class FilterBar {
  private readonly _filter = inject(FilterService);

  protected readonly visible = signal(false);
  protected readonly eventTypes = EVENT_TYPES;

  private readonly _isPicking = toSignal(this._filter.isPickingLocation(), { initialValue: false });
  protected readonly activeTypes = toSignal(this._filter.getType(), { initialValue: ['earthquake'] });

  private _triggerEl: HTMLElement | null = null;
  private _returnFocusOnClose = false;

  constructor() {
    effect(() => {
      if (this._isPicking()) {
        // Picking was triggered from inside the drawer: suppress focus return so
        // focus stays on the map while the user picks a location.
        this._returnFocusOnClose = false;
        untracked(() => this.visible.set(false));
      }
    });
    this._filter.onLocationPicked()
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.visible.set(true));
  }

  openDrawer(): void {
    this._triggerEl = document.activeElement as HTMLElement;
    this._returnFocusOnClose = true;
    this.visible.set(true);
  }

  protected onDrawerHide(): void {
    this.visible.set(false);
    if (this._returnFocusOnClose) {
      this._returnFocusOnClose = false;
      setTimeout(() => this._triggerEl?.focus({ preventScroll: true }), 50);
    }
  }

  protected focusFirstInFilter(): void {
    setTimeout(() => {
      const drawer = document.querySelector<HTMLElement>('.p-drawer');
      if (!drawer) return;
      drawer.querySelector<HTMLButtonElement>('[data-pc-name="pcclosebutton"]')
        ?.setAttribute('aria-label', 'Close filters panel');
      const first = drawer.querySelector<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      first?.focus({ preventScroll: true });
    }, 100);
  }

  protected daily(): void {
    this._filter.commitDaily();
  }

  protected isTypeActive(name: string): boolean {
    return this.activeTypes().includes(name);
  }

  protected toggleType(name: string): void {
    this._filter.toggleEventType({ name, status: !this.isTypeActive(name) });
  }
}
