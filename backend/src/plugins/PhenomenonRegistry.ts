import { IPhenomenonPlugin } from "./IPhenomenonPlugin";

export class PhenomenonRegistry {
  private readonly _plugins = new Map<string, IPhenomenonPlugin>();
  public register(plugin: IPhenomenonPlugin) {
    this._plugins.set(plugin.getEventType(), plugin);
  }

  public get(eventType: string): IPhenomenonPlugin | undefined {
    return this._plugins.get(eventType);
  }

  public all(): IPhenomenonPlugin[] {
    return [...this._plugins.values()];
  }
}
