/**
 * USGSStrategy.ts
 * Concrete ingestion strategy for the USGS Earthquake API.
 * Pre-batches time ranges via STEP_TABLE, then recursively splits any batch that exceeds the 20k API limit.
 */

import { USGSAdapter } from "../adapters/USGSAdapter";
import { USGSConfig } from "../configs/USGSConfig";
import {
  createModuleLogger,
  logHttpError,
  logNetworkError,
} from "../logger/logger";
import { GeoJSONFeature } from "../types/GeoJSONFeature";
import { USGSResponse } from "../types/USGSResponse";
import { IPhenomenonPlugin } from "../plugins/IPhenomenonPlugin";
import { EventSearchParams } from "../types/EventSearchParams";
import { parseNumber } from "../util/queryParsing";
import { Filter } from "mongodb";

const MONTH = 30 * 24 * 60 * 60 * 1000;
const YEAR = 365 * 24 * 60 * 60 * 1000;

interface StepRule {
  fromYear: number;
  toYear: number;
  step: number;
}

const STEP_TABLE: StepRule[] = [
  { fromYear: -Infinity, toYear: 1920, step: 100 * YEAR },
  { fromYear: 1920, toYear: 1960, step: 10 * YEAR },
  { fromYear: 1960, toYear: 1980, step: 2 * YEAR },
  { fromYear: 1980, toYear: 1990, step: 4 * MONTH },
  { fromYear: 1990, toYear: 2010, step: 2 * MONTH },
  { fromYear: 2010, toYear: Infinity, step: MONTH },
];

export class USGSStrategy implements IPhenomenonPlugin {
  private readonly _logger = createModuleLogger("USGS API Strategy");
  private readonly _myUSGSAdapter = new USGSAdapter();
  private readonly _name = "USGS API";
  private readonly _delay = USGSConfig.RequestDelay;
  private readonly _baseURL = USGSConfig.URL;
  private readonly _limit = USGSConfig.HardLimit;
  private readonly _format = USGSConfig.Format;
  private readonly _origin = USGSConfig.TimeOrigin;

  private async _request<T>(
    operation: string,
    from: number,
    to: number,
  ): Promise<T> {
    let res: Response;
    const url = new URL(this._baseURL + operation);
    url.searchParams.append("starttime", new Date(from).toISOString());
    url.searchParams.append("endtime", new Date(to).toISOString());
    url.searchParams.append("format", this._format);
    if (operation === "query") {
      url.searchParams.append("limit", this._limit.toString());
      url.searchParams.append("orderby", "time-asc");
    }
    this._logger.http(`${this._name} request`, {
      operation,
      url: url.toString(),
    });
    try {
      res = await fetch(url);
    } catch (error) {
      logNetworkError(this._logger, this._name, url, error);
      throw error;
    }
    this._logger.http(`${this._name} response`, {
      operation,
      status: res.status,
    });

    if (!res.ok) {
      const body = await res.text();
      logHttpError(
        this._logger,
        this._name,
        url,
        res.status,
        body,
        `HTTP ${res.status}`,
      );
      throw new Error(
        `USGS API Error - Status: ${res.status}\n ${url.toJSON()}`,
      );
    }

    if (!res.headers.get("content-type")?.includes("application/json")) {
      const body = await res.text();
      logHttpError(
        this._logger,
        this._name,
        url,
        res.status,
        body,
        "unexpected content-type",
      );
      throw new Error(
        `${this._name} unexpected content-type: ${res.headers.get("content-type")}`,
      );
    }

    return (await res.json()) as T;
  }

  private async _getCount(from: number, to: number): Promise<number> {
    const res = await this._request<{ count: number; maxAllowed: number }>(
      "count",
      from,
      to,
    );
    return res.count;
  }

  public async fetch(from: number, to: number): Promise<GeoJSONFeature[]> {
    /**
     * ALGORITHM:
     * fetch(from, to):
     *  count = getCount(from, to)
     *  IF !count THEN :
     *    RETURN []
     *  IF count > limit THEN :
     *    middle = from + ceil(to-from)/2
     *    a = fetch(from, middle)
     *    b = fetch(middle+1, to)
     *    RETURN append(a, b)
     *  ELSE :
     *    url = buildURL(base, from, to)
     *    response = call(url)
     *    RETURN Adapter.toGeoJSON(response)
     * END
     */

    const count = await this._getCount(from, to);

    if (!count) return [] as GeoJSONFeature[];

    if (count > this._limit) {
      const middle = from + Math.ceil(to - from) / 2;
      const a = await this.fetch(from, middle);
      const b = await this.fetch(middle + 1, to);
      a.push(...b);
      return a;
    } else {
      const data = await this._request<USGSResponse>("query", from, to);
      return this._myUSGSAdapter.toGeoJSON(data);
    }
  }

  public getNextBatchEnd(cursor: number, to: number): number {
    const year = new Date(cursor).getUTCFullYear();

    const rule = STEP_TABLE.find((r) => year >= r.fromYear && year < r.toYear);
    if (!rule) throw new Error(`No step rule found for year ${year}`);

    const intervalEndTs = Number.isFinite(rule.toYear)
      ? Date.UTC(rule.toYear, 0, 1)
      : Infinity;
    const batchEnd = Math.min(cursor + rule.step, intervalEndTs, to);

    return batchEnd;
  }

  public getDelay(): number {
    return this._delay;
  }

  public getName(): string {
    return this._name;
  }

  public getTimeOrigin(): number {
    return this._origin;
  }

  public getRefreshRate(): number {
    // Not an env-configurable knob: earthquakes happen continuously, so
    // once this matches a satisfying polling cadence there's no reason for
    // any deployment to ever want a different value — it's a fact about
    // this data source, same as its URL.
    return USGSConfig.DefaultRefreshRateMinutes * 60_000;
  }

  public getEventType(): string {
    return this._myUSGSAdapter.getEventType();
  }

  public getProjectionFields(): string[] {
    // Document fields to project, not the search-param names (those are
    // minmag/maxmag — different thing, handled in parseSearchParams below).
    return ["magnitude", "location"];
  }

  public parseSearchParams(
    query: Record<string, unknown>,
  ): Partial<EventSearchParams> {
    return {
      minmag: parseNumber(query.minmag, "minmag"),
      maxmag: parseNumber(query.maxmag, "maxmag"),
    };
  }

  public validateSearchParams(_params: EventSearchParams): void {
    void _params; // no clamps needed today — the interface still requires the parameter
  }

  public buildQueryFragment(params: EventSearchParams): Filter<GeoJSONFeature> {
    const filter: Filter<GeoJSONFeature> = {
      "properties.eventType": { $in: [this.getEventType()] },
    };
    if (params.from !== undefined || params.to !== undefined) {
      // Exact match: an earthquake's timestamp is exactly when it happened,
      // unlike a cyclone's, which only needs to overlap the window.
      filter["properties.timestamp"] = {
        ...(params.from !== undefined && { $gte: params.from }),
        ...(params.to !== undefined && { $lte: params.to }),
      };
    }
    if (params.minmag !== undefined || params.maxmag !== undefined) {
      filter["properties.magnitude"] = {
        ...(params.minmag !== undefined && { $gte: params.minmag }),
        ...(params.maxmag !== undefined && { $lte: params.maxmag }),
      };
    }
    return filter;
  }
}
