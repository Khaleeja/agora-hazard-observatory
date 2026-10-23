// Generic knowledge only — nothing phenomenon-specific belongs here. The
// wind range and valid category/basin sets used to live here too, but
// they're exclusively cyclone knowledge (same shape of problem as MAG_MIN/
// MAG_MAX being earthquake-only), so they moved to IBTrACSConfig/
// IBTrACSStrategy, next to the rest of what that plugin owns. WIND_MIN/MAX
// stays here only until EventSearchService's validation is itself moved
// into the (future) EarthquakePlugin/CyclonePlugin's validateSearchParams.
export const RESTConfig = {
  LIMIT: parseInt(process.env.MAX_EVENTS_LIMIT || "20000", 10),
  MAG_MIN: -5,
  MAG_MAX: 12,
  // Wind speed range (kt). 0 = calm; 185kt is roughly the highest sustained
  // wind ever recorded for a tropical cyclone, so 250 leaves headroom
  // without accepting nonsense input.
  WIND_MIN: 0,
  WIND_MAX: 250,
  MIN_TIME: 1200000,
};
