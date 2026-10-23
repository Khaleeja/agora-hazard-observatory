import { GeoJSONGeometry } from "./GeoJSONGeometry";

export interface USGSFeature {
  type: "Feature";
  properties: {
    id: string;
    title: string;
    url: string;
    mag: number;
    time: number;
    place: string;
  };
  geometry: GeoJSONGeometry;
  id: string;
}

export interface USGSResponse {
  type: "FeatureCollection";
  metadata: unknown;
  features: USGSFeature[];
  bbox: [number, number, number, number, number, number];
}
