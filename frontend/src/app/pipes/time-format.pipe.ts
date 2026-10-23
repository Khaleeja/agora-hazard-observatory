import { Pipe, PipeTransform } from '@angular/core';
import { formatDate } from '@angular/common';

@Pipe({ name: 'timeFormat', standalone: true })
export class TimeFormatPipe implements PipeTransform {
  transform(time: number | string | null | undefined, mode: 'relative' | 'absolute' = 'relative'): string {
    if (time == null) return 'N/A';
    const ms = typeof time === 'string' ? new Date(time).getTime() : time;
    if (isNaN(ms)) return 'N/A';

    if (mode === 'absolute') {
      return formatDate(ms, 'yyyy/MM/dd HH:mm:ss', 'en-US') + ' UTC';
    }

    const elapsed = Date.now() - ms;
    if (elapsed < 3_600_000) {
      const minutes = Math.floor(elapsed / 60_000);
      return minutes <= 1 ? 'Now' : `${minutes} mins ago`;
    }
    if (elapsed < 25_200_000) {
      return `${Math.floor(elapsed / 3_600_000)} hours ago`;
    }
    return formatDate(ms, 'yyyy/MM/dd HH:mm', 'en-US');
  }
}
