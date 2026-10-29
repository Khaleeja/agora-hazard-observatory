import { USGSStrategy } from "../strategies/USGSStrategy";
import { USGSConfig } from "../configs/USGSConfig";

const MONTH = 30 * 24 * 60 * 60 * 1000;
const YEAR = 365 * 24 * 60 * 60 * 1000;

describe("USGSStrategy.getNextBatchEnd", () => {
  let strategy: USGSStrategy;

  beforeEach(() => {
    strategy = new USGSStrategy();
  });

  it("uses 100-year step for years < 1920", () => {
    const cursor = Date.UTC(1800, 0, 1);
    const to = Date.UTC(2030, 0, 1);
    const result = strategy.getNextBatchEnd(cursor, to);
    expect(new Date(result).getUTCFullYear()).toBeLessThanOrEqual(1920);
  });

  it("uses 10-year step for years 1920-1960", () => {
    const cursor = Date.UTC(1930, 0, 1);
    const to = Date.UTC(2030, 0, 1);
    const result = strategy.getNextBatchEnd(cursor, to);
    expect(result).toBe(Math.min(cursor + 10 * YEAR, Date.UTC(1960, 0, 1), to));
  });

  it("uses 2-year step for years 1960-1980", () => {
    const cursor = Date.UTC(1965, 0, 1);
    const to = Date.UTC(2030, 0, 1);
    const result = strategy.getNextBatchEnd(cursor, to);
    expect(result).toBe(Math.min(cursor + 2 * YEAR, Date.UTC(1980, 0, 1), to));
  });

  it("uses 4-month step for years 1980-1990", () => {
    const cursor = Date.UTC(1985, 0, 1);
    const to = Date.UTC(2030, 0, 1);
    const result = strategy.getNextBatchEnd(cursor, to);
    expect(result).toBe(Math.min(cursor + 4 * MONTH, Date.UTC(1990, 0, 1), to));
  });

  it("uses 2-month step for years 1990-2010", () => {
    const cursor = Date.UTC(2000, 0, 1);
    const to = Date.UTC(2030, 0, 1);
    const result = strategy.getNextBatchEnd(cursor, to);
    expect(result).toBe(Math.min(cursor + 2 * MONTH, Date.UTC(2010, 0, 1), to));
  });

  it("uses 1-month step for years >= 2010", () => {
    const cursor = Date.UTC(2020, 0, 1);
    const to = Date.UTC(2030, 0, 1);
    const result = strategy.getNextBatchEnd(cursor, to);
    expect(result).toBe(cursor + MONTH);
  });

  it("never exceeds the 'to' parameter", () => {
    const to = Date.UTC(2020, 5, 1);
    const cursor = to - 1000;
    const result = strategy.getNextBatchEnd(cursor, to);
    expect(result).toBeLessThanOrEqual(to);
  });

  it("never exceeds the STEP_TABLE interval breakpoint (pre-1920)", () => {
    const cursor = Date.UTC(1899, 11, 31);
    const to = Date.UTC(2026, 0, 1);
    const result = strategy.getNextBatchEnd(cursor, to);
    expect(new Date(result).getUTCFullYear()).toBeLessThanOrEqual(1920);
  });

  it("stops exactly at the interval breakpoint when the step would overshoot it", () => {
    // 1958 + 10y = 1968, but the 1920-1960 interval closes at 1960
    const cursor = Date.UTC(1958, 0, 1);
    const to = Date.UTC(2030, 0, 1);
    const result = strategy.getNextBatchEnd(cursor, to);
    expect(result).toBe(Date.UTC(1960, 0, 1));
  });

  it("returns exactly 'to' when cursor is just before it", () => {
    const to = Date.UTC(2024, 6, 15);
    const cursor = to - 100;
    const result = strategy.getNextBatchEnd(cursor, to);
    expect(result).toBe(to);
  });
});

describe("USGSStrategy - getter methods", () => {
  let strategy: USGSStrategy;

  beforeEach(() => {
    strategy = new USGSStrategy();
  });

  it("getDelay returns a number", () => {
    expect(typeof strategy.getDelay()).toBe("number");
  });

  it("getName returns 'USGS API'", () => {
    expect(strategy.getName()).toBe("USGS API");
  });

  it("getEventType returns 'earthquake'", () => {
    expect(strategy.getEventType()).toBe("earthquake");
  });

  it("getTimeOrigin returns a numeric timestamp", () => {
    expect(typeof strategy.getTimeOrigin()).toBe("number");
  });

  it("getRefreshRate is USGSConfig.DefaultRefreshRateMinutes converted to ms — not env-configurable", () => {
    expect(strategy.getRefreshRate()).toBe(USGSConfig.DefaultRefreshRateMinutes * 60_000);
  });
});
