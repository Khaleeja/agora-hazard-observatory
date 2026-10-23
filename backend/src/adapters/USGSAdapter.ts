/**
 * USGSAdapter.ts
 * USGSAdapter class convert USGS API response into Feature[].
 */

import { createModuleLogger } from "../logger/logger";
import { GeoJSONFeature } from "../types/GeoJSONFeature";
import { USGSResponse } from "../types/USGSResponse";
import { Adapter } from "./Adapter";

export class USGSAdapter extends Adapter<USGSResponse> {
  protected readonly _type: string = "earthquake";
  private readonly _logger = createModuleLogger("USGS Adapter");

  private _getSeverity(mag: number): "Low" | "Medium" | "High" {
    if (mag < 4.0) return "Low";
    if (mag < 6.0) return "Medium";
    return "High";
  }

  public toGeoJSON(data: USGSResponse): GeoJSONFeature[] {
    return data.features.reduce<GeoJSONFeature[]>((acc, f) => {
      if (!f.id || !f.properties) {
        this._logger.error("Feature discarded: missing id or properties", { feature: f });
        return acc;
      }

      const validFeature: GeoJSONFeature = {
        type: "Feature",
        properties: {
          id: f.id,
          title: f.properties.title ?? "missing-title",
          eventType: this._type,
          //description: "",
          //accessibility: "",
          source: "USGS",
          sourceURL: f.properties.url,
          severity: this._getSeverity(f.properties.mag ?? 0),
          timestamp: f.properties.time ?? "missing-time",
          magnitude: f.properties.mag ?? "missing-mag",
          location: f.properties.place ?? "missing-place",
        },
        geometry: f.geometry,
      };
      acc.push(validFeature);
      return acc;
    }, []);
  }
}
