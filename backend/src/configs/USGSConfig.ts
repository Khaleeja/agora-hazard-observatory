export const USGSConfig = {
  URL: "https://earthquake.usgs.gov/fdsnws/event/1/",
  RequestDelay: 1000,
  Format: "geojson",
  SoftLimit: 15000,
  HardLimit: 20000,
  TimeOrigin: -14831768935000,
  // Minutes between scheduled checks when SCHEDULER_USGS_INTERVAL isn't set
  // in the environment — see IBTrACSConfig.DefaultRefreshRateMinutes for why
  // this lives here rather than only as an env default.
  DefaultRefreshRateMinutes: 5,
};
