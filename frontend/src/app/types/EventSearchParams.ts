export interface EventSearchParams {
  type?: string[];
  severity?: ("Low" | "Medium" | "High")[];
  from?: string;
  to?: string;
  minmag?: number;
  maxmag?: number;
  // Cyclone-specific — see EventTypeStrategy.filterFields
  category?: string[];
  position?: { lon: number; lat: number; radius: number };
  limit?: number;
  orderby?: 1 | -1;
}
