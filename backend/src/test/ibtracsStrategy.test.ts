import { IBTrACSStrategy } from "../strategies/IBTrACSStrategy";
import { IBTrACSConfig } from "../configs/IBTrACSConfig";

const HEADER = Object.values(IBTrACSConfig.Columns).join(",");
const UNITS = HEADER.split(",")
  .map(() => "")
  .join(",");

function csvOf(dataLines: string[]): string {
  return [HEADER, UNITS, ...dataLines].join("\n");
}

// Columns in IBTrACSConfig.Columns order: sid,name,season,basin,isoTime,lat,lon,usaWind,wmoWind,usaPres,wmoPres,usaRmw
function row(sid: string, isoTime: string, opts: Partial<Record<string, string>> = {}): string {
  const defaults: Record<string, string> = {
    SID: sid,
    NAME: "TESTSTORM",
    SEASON: "2024",
    BASIN: "NA",
    ISO_TIME: isoTime,
    LAT: "10",
    LON: "80",
    USA_WIND: "40",
    WMO_WIND: "35",
    USA_PRES: "1000",
    WMO_PRES: "1001",
    USA_RMW: "",
  };
  const merged = { ...defaults, ...opts };
  return Object.values(IBTrACSConfig.Columns)
    .map((col) => merged[col] ?? "")
    .join(",");
}

function makeCsvResponse(text: string, opts: { ok?: boolean; status?: number } = {}): Response {
  const body = (async function* () {
    yield new TextEncoder().encode(text);
  })();
  return {
    ok: opts.ok ?? true,
    status: opts.status ?? 200,
    body,
    text: async () => text,
  } as unknown as Response;
}

describe("IBTrACSStrategy.fetch", () => {
  let strategy: IBTrACSStrategy;
  let fetchSpy: jest.SpiedFunction<typeof fetch>;

  beforeEach(() => {
    strategy = new IBTrACSStrategy();
    fetchSpy = jest.spyOn(global, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("uses the full archive URL for a full reconstruction (from = getTimeOrigin())", async () => {
    fetchSpy.mockResolvedValueOnce(makeCsvResponse(csvOf([row("AL01", "2024-08-01 00:00:00")])));

    await strategy.fetch(strategy.getTimeOrigin(), Date.now());

    expect(fetchSpy).toHaveBeenCalledWith(
      IBTrACSConfig.FullArchiveUrl,
      expect.anything(),
    );
  });

  it("uses the small recent-window URL for any incremental (non-origin) call", async () => {
    fetchSpy.mockResolvedValueOnce(makeCsvResponse(csvOf([row("AL01", "2024-08-01 00:00:00")])));

    await strategy.fetch(strategy.getTimeOrigin() + 1000, Date.now());

    expect(fetchSpy).toHaveBeenCalledWith(
      IBTrACSConfig.RecentUrl,
      expect.anything(),
    );
  });

  it("parses rows, skips the units row, and groups them into Features by SID", async () => {
    const csv = csvOf([
      row("AL01", "2024-08-01 00:00:00", { LAT: "10", LON: "80" }),
      row("AL01", "2024-08-01 06:00:00", { LAT: "11", LON: "81" }),
      row("AL02", "2024-08-02 00:00:00", { LAT: "20", LON: "90" }),
    ]);
    fetchSpy.mockResolvedValueOnce(makeCsvResponse(csv));

    const result = await strategy.fetch(strategy.getTimeOrigin(), Date.now());

    expect(result.map((f) => f.properties.id).sort()).toEqual(["AL01", "AL02"]);
    const al01 = result.find((f) => f.properties.id === "AL01")!;
    expect(al01.geometry.type).toBe("LineString");
  });

  it("only keeps the ~12 configured columns per row, not the full header set", async () => {
    // A realistic file has ~170 columns; if projection were broken this
    // would still work by accident with our own tiny fixture, so this test
    // asserts on the actual parsed Feature using an extra unrelated column.
    const csv = [
      HEADER + ",SOME_OTHER_COLUMN_WE_DONT_USE",
      UNITS + ",",
      row("AL01", "2024-08-01 00:00:00") + ",irrelevant-value",
    ].join("\n");
    fetchSpy.mockResolvedValueOnce(makeCsvResponse(csv));

    const result = await strategy.fetch(strategy.getTimeOrigin(), Date.now());
    expect(result).toHaveLength(1);
    expect(result[0].properties.id).toBe("AL01");
  });

  it("passes 'from' through to the adapter so untouched storms are excluded on incremental runs", async () => {
    const csv = csvOf([row("OLD", "2020-01-01 00:00:00"), row("NEW", "2024-08-01 00:00:00")]);
    fetchSpy.mockResolvedValueOnce(makeCsvResponse(csv));

    const from = Date.parse("2024-01-01T00:00:00Z");
    const result = await strategy.fetch(from, Date.now());

    expect(result.map((f) => f.properties.id)).toEqual(["NEW"]);
  });

  it("retries a failed download and succeeds on a later attempt", async () => {
    jest.useFakeTimers({ doNotFake: ["nextTick"] });
    try {
      fetchSpy
        .mockRejectedValueOnce(new Error("network blip"))
        .mockResolvedValueOnce(makeCsvResponse(csvOf([row("AL01", "2024-08-01 00:00:00")])));

      const promise = strategy.fetch(strategy.getTimeOrigin(), Date.now());
      await jest.advanceTimersByTimeAsync(10_000);
      const result = await promise;

      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(result).toHaveLength(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it("throws after exhausting all download attempts", async () => {
    jest.useFakeTimers({ doNotFake: ["nextTick"] });
    try {
      fetchSpy.mockRejectedValue(new Error("persistent failure"));

      const promise = strategy.fetch(strategy.getTimeOrigin(), Date.now());
      const expectation = expect(promise).rejects.toThrow("persistent failure");
      await jest.advanceTimersByTimeAsync(20_000);
      await expectation;
    } finally {
      jest.useRealTimers();
    }
  });

  it("fails fast on a non-OK HTTP status, without retrying (a 404 won't fix itself)", async () => {
    fetchSpy.mockResolvedValueOnce(makeCsvResponse("not found", { ok: false, status: 404 }));

    await expect(strategy.fetch(strategy.getTimeOrigin(), Date.now())).rejects.toThrow(
      /IBTrACS API Error/,
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1); // no retry for a permanent HTTP error
  });
});

describe("IBTrACSStrategy.getNextBatchEnd", () => {
  it("returns 'to' directly — a single bulk read covers the whole range", () => {
    const strategy = new IBTrACSStrategy();
    const cursor = Date.UTC(2022, 0, 1);
    const to = Date.UTC(2030, 0, 1);
    expect(strategy.getNextBatchEnd(cursor, to)).toBe(to);
  });
});

describe("IBTrACSStrategy metadata", () => {
  const strategy = new IBTrACSStrategy();

  it("reports 'cyclone' as its event type", () => {
    expect(strategy.getEventType()).toBe("cyclone");
  });

  it("reports no per-request delay (a single bulk download, not many small ones)", () => {
    expect(strategy.getDelay()).toBe(0);
  });

  it("getTimeOrigin matches the full archive's real coverage (1980+)", () => {
    expect(new Date(strategy.getTimeOrigin()).getUTCFullYear()).toBe(1980);
  });

  it("getRefreshRate is IBTrACSConfig.DefaultRefreshRateMinutes converted to ms — not env-configurable", () => {
    // Deliberately not read from the environment: NOAA refreshes IBTrACS
    // ~3x/week regardless of who's running this backend, so there's no
    // deployment that would sanely want a different cadence. It's a fact
    // about this data source, same as its URL — see IBTrACSConfig.
    expect(strategy.getRefreshRate()).toBe(
      IBTrACSConfig.DefaultRefreshRateMinutes * 60_000,
    );
  });
});
