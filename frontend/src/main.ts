import { bootstrapApplication } from '@angular/platform-browser';
import { isDevMode } from '@angular/core';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import type { AxeResults, Result } from 'axe-core';

bootstrapApplication(App, appConfig)
  .then(() => {
    if (isDevMode()) {
      // Accessibility audit — violations logged to console (dev only)
      import('axe-core').then(({ default: axe }) => {
        setTimeout(() => {
          axe.run(document, { reporter: 'v2' }).then((results: AxeResults) => {
            if (results.violations.length === 0) {
              console.info('[axe] No accessibility violations found.');
              return;
            }
            console.group(`%c[axe] ${results.violations.length} violation(s)`, 'color:#d97706;font-weight:bold');
            results.violations.forEach((v: Result) => {
              console.warn(`[${v.impact}] ${v.id}: ${v.description}`);
              v.nodes.forEach((n) => console.log(' ', n.html));
            });
            console.groupEnd();
          });
        }, 2000);
      });
    }
  })
  .catch((err) => console.error(err));
