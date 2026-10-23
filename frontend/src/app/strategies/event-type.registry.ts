import { EventTypeStrategy } from './event-type.strategy';
import { EarthquakeStrategy } from './earthquake.strategy';
import { CycloneStrategy } from './cyclone.strategy';
//import { VolcanoStrategy } from './volcano.strategy';
//import { FloodStrategy } from './flood.strategy';
//import { FireStrategy } from './fire.strategy';
//import { DroughtStrategy } from './drought.strategy';

const _strategies: EventTypeStrategy[] = [
  new EarthquakeStrategy(),
  new CycloneStrategy(),
  //new VolcanoStrategy(),
  //new FloodStrategy(),
  //new FireStrategy(),
  //new DroughtStrategy(),
];

export const EVENT_TYPE_REGISTRY = new Map<string, EventTypeStrategy>(
  _strategies.map((s) => [s.name, s]),
);

export const EVENT_TYPES: { name: string; label: string }[] = _strategies.map((s) => ({
  name: s.name,
  label: s.label,
}));
