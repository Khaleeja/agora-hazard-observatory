import { Injectable, signal } from '@angular/core';

const STORAGE_KEY = 'agora-theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly _theme = signal<'dark' | 'light'>('dark');
  readonly theme = this._theme.asReadonly();

  constructor() {
    const saved = localStorage.getItem(STORAGE_KEY) as 'dark' | 'light' | null;
    if (saved) {
      this._apply(saved);
    } else if (typeof window.matchMedia === 'function') {
      // Follow OS preference when no manual override is saved
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      this._apply(mq.matches ? 'dark' : 'light');
      mq.addEventListener('change', (e) => {
        // Only react to OS changes if the user hasn't set a manual preference
        if (!localStorage.getItem(STORAGE_KEY)) {
          this._apply(e.matches ? 'dark' : 'light');
        }
      });
    }
  }

  toggle(): void {
    const next = this._theme() === 'dark' ? 'light' : 'dark';
    this._apply(next);
    localStorage.setItem(STORAGE_KEY, next);
  }

  private _apply(t: 'dark' | 'light'): void {
    this._theme.set(t);
    document.documentElement.setAttribute('data-theme', t);
  }
}
