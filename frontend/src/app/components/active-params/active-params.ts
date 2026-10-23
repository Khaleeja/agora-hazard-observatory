import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Popover } from 'primeng/popover';
import { FilterService } from '../../services/filter';
import { EventService } from '../../services/event';

@Component({
  selector: 'app-active-params',
  imports: [Popover],
  templateUrl: './active-params.html',
  styleUrl: './active-params.scss',
})
export class ActiveParams {
  private readonly _filter = inject(FilterService);
  private readonly _eventService = inject(EventService);

  protected readonly isOpen = signal(false);

  private readonly _committed = toSignal(this._filter.getCommitted(), { requireSync: true });
  private readonly _meta = toSignal(this._eventService.getSearchMeta(), { initialValue: null });

  protected readonly eventCount = computed(() => {
    const m = this._meta();
    if (!m) return null;
    const truncated = m.total > m.retrieved || m.retrieved >= m.limit;
    const text = truncated
      ? `${m.retrieved.toLocaleString()} / ${m.total.toLocaleString()} events`
      : `${m.retrieved.toLocaleString()} events`;
    return { text, truncated };
  });

  protected readonly filterSummary = computed(() => {
    const c = this._committed();
    const parts: string[] = [];

    const fmt = (d: Date) =>
      d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    const todayStr = new Date().toDateString();

    const from = c.from ? new Date(c.from) : null;
    const to = c.to ? new Date(c.to) : null;

    if (from && to) {
      const toLabel = to.toDateString() === todayStr ? 'now' : fmt(to);
      parts.push(`${fmt(from)} → ${toLabel}`);
    } else if (from) {
      parts.push(`From ${fmt(from)}`);
    } else if (to) {
      parts.push(`Until ${to.toDateString() === todayStr ? 'now' : fmt(to)}`);
    }

    if (c.minmag != null && c.maxmag != null) {
      parts.push(`M ${c.minmag}–${c.maxmag}`);
    } else if (c.minmag != null) {
      parts.push(`M ≥ ${c.minmag}`);
    } else if (c.maxmag != null) {
      parts.push(`M ≤ ${c.maxmag}`);
    }

    if (c.severity?.length) {
      parts.push(c.severity.join(' / '));
    }

    if (c.limit) parts.push(`${c.limit.toLocaleString()} max`);

    if (c.position) {
      const lat = c.position.lat.toFixed(2);
      const lon = c.position.lon.toFixed(2);
      parts.push(`near ${lat}°, ${lon}° ±${c.position.radius} km`);
    }

    return parts.join(' · ');
  });
}
