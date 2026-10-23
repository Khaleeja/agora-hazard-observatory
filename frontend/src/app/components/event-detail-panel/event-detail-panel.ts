import { Component, input } from '@angular/core';
import { CycloneTrackPoint, GeoJSONFeature } from '../../types/GeoJSONFeature';
import { TimeFormatPipe } from '../../pipes/time-format.pipe';

@Component({
  selector: 'app-event-detail-panel',
  imports: [TimeFormatPipe],
  templateUrl: './event-detail-panel.html',
  styleUrl: './event-detail-panel.scss',
})
export class EventDetailPanel {
  readonly event = input.required<GeoJSONFeature>();

  protected severityIcon(severity: string): string {
    if (severity === 'Low')  return 'pi pi-info-circle';
    if (severity === 'High') return 'pi pi-times-circle';
    return 'pi pi-exclamation-triangle';
  }

  // GeoJSON stores [longitude, latitude]; display convention is lat first
  protected formatLat(lat: number): string {
    return `${Math.abs(lat).toFixed(5)}° ${lat >= 0 ? 'N' : 'S'}`;
  }

  protected formatLon(lon: number): string {
    return `${Math.abs(lon).toFixed(5)}° ${lon >= 0 ? 'E' : 'W'}`;
  }

  protected lastCoordinate(): number[] | undefined {
    const geom = this.event().geometry;
    if (geom.type === 'Point') return geom.coordinates as number[];
    if (geom.type === 'LineString') return (geom.coordinates as number[][]).at(-1);
    return undefined;
  }

  // track[] is index-aligned with geometry.coordinates (see IBTrACSAdapter);
  // reversed here so the panel reads most-recent-first, like the rest of the app.
  protected trackChronological(): (CycloneTrackPoint & { lon: number; lat: number })[] {
    const geom = this.event().geometry;
    const track = this.event().properties.track;
    if (!track || geom.type !== 'LineString') return [];
    const coords = geom.coordinates as number[][];
    return track
      .map((p, i) => ({ ...p, lon: coords[i]?.[0], lat: coords[i]?.[1] }))
      .reverse();
  }
}
