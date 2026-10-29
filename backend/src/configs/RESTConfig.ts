// Generic knowledge only — nothing phenomenon-specific belongs here, in
// principle: WIND_MIN/MAX and MAG_MIN/MAX are actually earthquake/cyclone-
// specific (the valid category/basin sets live in IBTrACSConfig instead,
// next to the rest of what that plugin owns, for exactly this reason).
// They stay here only until EventSearchService's validation itself moves
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
