export interface GeoJSONGeometry {
  type: 'Point' | 'LineString' | 'Polygon';
  coordinates: number[] | number[][] | number[][][];
}

export interface CycloneTrackPoint {
  timestamp: number;
  windSpeed?: number;
  pressure?: number;
  radiusOfMaxWind?: number;
}

export interface GeoJSONProperties {
  id: string;
  title: string;
  eventType: string;
  source: string;
  severity: 'Low' | 'Medium' | 'High';
  timestamp: number | string;
  magnitude?: number;
  location: string;
  sourceURL?: string;
  description?: string;
  accessibility?: string;
  // Cyclone-specific (see IBTrACSAdapter on the backend)
  windSpeed?: number;
  pressure?: number;
  basin?: string;
  category?: string;
  track?: CycloneTrackPoint[];
}

export interface GeoJSONFeature {
  type: 'Feature';
  geometry: GeoJSONGeometry;
  properties: GeoJSONProperties;
}

export interface GeoJSONCollection {
  type: 'FeatureCollection';
  features: GeoJSONFeature[];
  metadata: {
    count: number; // features actually returned
    total: number; // total records matching the filters
    limit: number; // limit applied
    api: string; // API version
  };
}
