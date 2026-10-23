export interface EventSearchParams {
  from?: number;
  to?: number;
  minmag?: number;
  maxmag?: number;
  // Cyclone-specific — mirror minmag/maxmag's role but on windSpeed, since
  // magnitude is reserved for USGS (see GeoJSONFeature.properties).
  minwind?: number;
  maxwind?: number;
  category?: string[];
  basin?: string[];
  severity?: ("Low" | "Medium" | "High")[];
  position?: { lon: number; lat: number; radius: number };
  type?: string[];
  orderby: 1 | -1;
  limit?: number;
}
