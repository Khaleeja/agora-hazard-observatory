import { GeoJSONFeature } from "./GeoJSONFeature";

export interface GeoJSONFeatures {
  type: "FeatureCollection";
  metadata: {
    count: number;
    total: number;
    limit: number;
    api: string;
  };
  features: GeoJSONFeature[];
}
