import { Component, ElementRef, inject, input, output } from '@angular/core';
import { EventDetail } from '../event-detail/event-detail';
import { GeoJSONFeature } from '../../types/GeoJSONFeature';

@Component({
  selector: 'app-event-list',
  imports: [EventDetail],
  templateUrl: './event-list.html',
  styleUrl: './event-list.scss',
})
export class EventListComponent {
  private readonly _host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly events = input<GeoJSONFeature[]>([]);
  readonly isLoading = input(false);
  readonly asOf = input<number>(Date.now());
  readonly eventSelected = output<GeoJSONFeature>();

  protected backToTop(): void {
    this._host.nativeElement.querySelector<HTMLElement>('.list-wrapper')
      ?.scrollTo({ top: 0, behavior: 'smooth' });
    document.getElementById('events-list')?.focus({ preventScroll: true });
  }
}
