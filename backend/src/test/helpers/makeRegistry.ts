import { PhenomenonRegistry } from "../../plugins/PhenomenonRegistry";
import { USGSStrategy } from "../../strategies/USGSStrategy";
import { IBTrACSStrategy } from "../../strategies/IBTrACSStrategy";

/**
 * Real plugin instances, not mocks or stubs: GeoEventController,
 * EventSearchService and GeoEventRepository all delegate phenomenon-specific
 * parsing/validation/query-building to whichever plugin is registered for a
 * given event type (see PhenomenonRegistry). A test registry has to carry
 * the real thing to exercise that logic at all — a hand-rolled fake plugin
 * would just be re-describing the production behaviour a second time, with
 * no guarantee the two stay in sync.
 */
export function makeRegistry(): PhenomenonRegistry {
  const registry = new PhenomenonRegistry();
  registry.register(new USGSStrategy());
  registry.register(new IBTrACSStrategy());
  return registry;
}
