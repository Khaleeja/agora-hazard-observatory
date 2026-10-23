import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { EventSearchParams } from '../types/EventSearchParams';

@Injectable({
  providedIn: 'root',
})
export class FilterService {
  private readonly _typeList = new BehaviorSubject<string[]>(['earthquake']);
  private readonly _severityList = new BehaviorSubject<('Low' | 'Medium' | 'High')[]>([]);
  private readonly _categoryList = new BehaviorSubject<string[]>([]);
  private readonly _draft = new BehaviorSubject<EventSearchParams>({});
  private readonly _committed = new BehaviorSubject<EventSearchParams>({});
  private readonly _pickingLocation = new BehaviorSubject<boolean>(false);
  private readonly _locationPicked = new Subject<{ lat: number; lon: number }>();

  constructor() {
    this.commitDaily();
    this._draft.next({ ...this._committed.value });
  }

  getCommitted(): Observable<EventSearchParams> {
    return this._committed.asObservable();
  }

  getType(): Observable<string[]> {
    return this._typeList.asObservable();
  }

  updateDraft(params: EventSearchParams): void {
    this._draft.next({ ...params });
  }

  commit(): void {
    this._committed.next({ ...this._draft.value });
  }

  commitDaily(): void {
    this._committed.next({
      ...this._committed.value,
      to: new Date().toISOString(),
      from: new Date(Date.now() - 86_400_000).toISOString(),
      limit: 20000,
      orderby: -1,
      minmag: 2,
      maxmag: undefined,
      position: undefined,
      severity: undefined,
    });
  }

  startLocationPick(): void {
    this._pickingLocation.next(true);
  }

  cancelLocationPick(): void {
    this._pickingLocation.next(false);
  }

  confirmLocationPick(lat: number, lon: number): void {
    this._pickingLocation.next(false);
    this._locationPicked.next({ lat, lon });
  }

  isPickingLocation(): Observable<boolean> {
    return this._pickingLocation.asObservable();
  }

  onLocationPicked(): Observable<{ lat: number; lon: number }> {
    return this._locationPicked.asObservable();
  }

  getSeverity(): Observable<('Low' | 'Medium' | 'High')[]> {
    return this._severityList.asObservable();
  }

  toggleSeverity(sev: 'Low' | 'Medium' | 'High'): void {
    const current = this._severityList.value;
    if (current.includes(sev)) {
      this._severityList.next(current.filter((s) => s !== sev));
    } else {
      this._severityList.next([...current, sev]);
    }
  }

  clearSeverity(): void {
    this._severityList.next([]);
  }

  getCategory(): Observable<string[]> {
    return this._categoryList.asObservable();
  }

  toggleCategory(cat: string): void {
    const current = this._categoryList.value;
    if (current.includes(cat)) {
      this._categoryList.next(current.filter((c) => c !== cat));
    } else {
      this._categoryList.next([...current, cat]);
    }
  }

  clearCategory(): void {
    this._categoryList.next([]);
  }

  toggleEventType(type: { name: string; status: boolean }): void {
    const current = this._typeList.value;
    if (type.status && !current.includes(type.name)) {
      this._typeList.next([...current, type.name]);
    } else if (!type.status) {
      this._typeList.next(current.filter((t) => t !== type.name));
    }
  }
}
