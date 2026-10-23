import { Component, input, output } from '@angular/core';
import { GeoJSONFeature } from '../../types/GeoJSONFeature';
import { CardModule } from 'primeng/card';
import { TimeFormatPipe } from '../../pipes/time-format.pipe';
import { pointAsOf, trackPointAsOf } from '../../strategies/cyclone.strategy';

@Component({
  selector: 'app-event-detail',
  imports: [CardModule, TimeFormatPipe],
  templateUrl: './event-detail.html',
  styleUrl: './event-detail.scss',
})
export class EventDetail {
  readonly event = input.required<GeoJSONFeature>();
  readonly position = input<{ index: number; total: number } | undefined>(undefined);
  // The search's 'to' boundary (or now, if unbounded) — see pointAsOf.
  readonly asOf = input<number>(Date.now());
  readonly selected = output<GeoJSONFeature>();

  protected severityIcon(severity: string): string {
    if (severity === 'Low')  return 'pi pi-info-circle';
    if (severity === 'High') return 'pi pi-times-circle';
    return 'pi pi-exclamation-triangle';
  }

  /**
   * The card shows the storm's position/intensity AS OF the current search
   * (asOf), never the whole path and never simply the absolute latest point
   * — properties.windSpeed/pressure are the track's peak, and for a
   * historical search the absolute latest point would show data from after
   * the period actually being viewed.
   */
  protected lastTrackPoint() {
    return trackPointAsOf(this.event(), this.asOf());
  }

  protected lastCoordinate(): number[] | undefined {
    return pointAsOf(this.event(), this.asOf());
  }

  protected cardLabel(): string {
    const pos = this.position();
    const e = this.event().properties;
    const prefix = pos ? `Event ${pos.index + 1} of ${pos.total}: ` : '';
    const mag = e.magnitude != null ? `, magnitude ${(+e.magnitude).toFixed(1)}` : '';
    const cat = e.category != null ? `, category ${e.category}` : '';
    return `${prefix}${e.location}, ${e.eventType}${mag}${cat}, ${e.severity} severity`;
  }
}
