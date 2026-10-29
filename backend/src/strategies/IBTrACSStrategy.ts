/**
 * IBTrACSStrategy.ts
 * Concrete ingestion strategy for IBTrACS tropical cyclone data, read
 * directly from NOAA's bulk CSV distribution (see IBTrACSConfig for why
 * this project moved off ERDDAP).
 *
 * No more per-storm HTTP round trips: the whole relevant file (full archive
 * for a fresh DB, the small rolling recent-window file otherwise) is
 * streamed and parsed in one pass, grouped by storm locally. Simpler than
 * both USGSStrategy (no count-then-split dance — there is no API row cap to
 * work around) and the earlier ERDDAP version of this class (no discovery
 * query + N per-storm queries).
 *
 * Memory/resilience trade-offs, deliberate:
 *  - The CSV is streamed and only the ~12 columns this project actually
 *    uses are kept per row (out of ~170 in the file) — the dominant memory
 *    cost, not the raw byte size, so this matters far more than streaming
 *    alone would.
 *  - A failed download of the ~140MB full archive is retried a couple of
 *    times, but a full reconstruction that still fails restarts from
 *    scratch — there is no partial resume. True resumability would mean
 *    letting this class write to the DB incrementally as it streams
 *    (finalizing a storm's Feature the moment its rows end, since the file
 *    is sorted by storm), instead of returning one array at the end — a
 *    real change to the Strategy/Repository boundary, not done here.
 */

import { IBTrACSAdapter } from "../adapters/IBTrACSAdapter";
import {
  IBTrACSConfig,
  VALID_BASINS,
  VALID_CATEGORIES,
} from "../configs/IBTrACSConfig";
import {
  createModuleLogger,
  logHttpError,
  logNetworkError,
} from "../logger/logger";
import { IPhenomenonPlugin } from "../plugins/IPhenomenonPlugin";
import { EventSearchParams } from "../types/EventSearchParams";
import { GeoJSONFeature } from "../types/GeoJSONFeature";
import { IBTrACSCsvRow } from "../types/IBTrACSCsv";
import { parseEnumSet, parseNumber } from "../util/queryParsing";
import { Filter } from "mongodb";

const DOWNLOAD_ATTEMPTS = 3;
const RETRY_DELAY_MS = 5000;

export class IBTrACSStrategy implements IPhenomenonPlugin {
  private readonly _logger = createModuleLogger("IBTrACS API Strategy");
  private readonly _myIBTrACSAdapter = new IBTrACSAdapter();
  private readonly _name = "IBTrACS API";
  private readonly _origin = IBTrACSConfig.TimeOrigin;
  private readonly _wantedColumns = Object.values(IBTrACSConfig.Columns);
  private readonly _validCategorySet = new Set<string>(VALID_CATEGORIES);
  private readonly _validBasinSet = new Set<string>(VALID_BASINS);

  // IBTrACS is refreshed by NOAA only ~3x/week (Sun/Tue/Thu), with up to ~1
  // day of lag before posting — so a cyclone's last recorded point can be a
  // few days stale even while the real storm is still active. This grace
  // period is subtracted from `from`, so a "last 24h" search doesn't wrongly
  // treat a genuinely active-but-stale storm as gone. It's a property of
  // this data source's own update cadence, not of "now" — applies the same
  // way to a historical window as to a live one.
  private static readonly CYCLONE_UPDATE_LAG_MS = 10 * 24 * 60 * 60 * 1000;

  private _sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private _splitCsvLine(line: string): string[] {
    // Minimal RFC4180 handling. IBTrACS's own fields are plain (no commas
    // inside a name/number), but quoting is handled defensively rather than
    // assumed away.
    const cells: string[] = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        inQuotes = !inQuotes;
        continue;
      }
      if (c === "," && !inQuotes) {
        cells.push(cur);
        cur = "";
        continue;
      }
      cur += c;
    }
    cells.push(cur);
    return cells;
  }

  /**
   * Streams the response body, splitting into CSV lines as bytes arrive —
   * never holds the whole (possibly ~140MB) body as one string. For every
   * data line (skipping the header and the units row beneath it), only the
   * columns this project actually reads are kept, discarding the other
   * ~160 — that projection, not the streaming itself, is what keeps memory
   * bounded for the full archive.
   */
  private async _streamRows(res: Response): Promise<IBTrACSCsvRow[]> {
    const rows: IBTrACSCsvRow[] = [];
    const decoder = new TextDecoder();
    let buffer = "";
    let lineNo = 0;
    let wantedIndex: { name: string; index: number }[] | null = null;

    const handleLine = (line: string) => {
      if (line.length === 0) return;
      if (lineNo === 0) {
        const headers = this._splitCsvLine(line);
        wantedIndex = this._wantedColumns
          .map((name) => ({ name, index: headers.indexOf(name) }))
          .filter((c) => c.index !== -1);
      } else if (lineNo >= 2 && wantedIndex) {
        const cells = this._splitCsvLine(line);
        const row: IBTrACSCsvRow = {};
        for (const { name, index } of wantedIndex)
          row[name] = cells[index] ?? "";
        rows.push(row);
      } // lineNo === 1 is the units row — skipped
      lineNo++;
    };

    // Response.body is a WHATWG ReadableStream; Node supports async
    // iteration over it directly.
    const body = res.body as unknown as AsyncIterable<Uint8Array>;
    for await (const chunk of body) {
      buffer += decoder.decode(chunk, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf("\n")) >= 0) {
        handleLine(buffer.slice(0, idx).replace(/\r$/, ""));
        buffer = buffer.slice(idx + 1);
      }
    }
    buffer += decoder.decode(); // flush any trailing partial multi-byte char
    if (buffer.length > 0) handleLine(buffer.replace(/\r$/, ""));

    return rows;
  }

  private async _download(url: string): Promise<IBTrACSCsvRow[]> {
    // Only network-level failures (timeout, DNS, connection reset) are
    // retried — a non-OK HTTP status (e.g. a genuinely missing/renamed
    // file) is a permanent failure that retrying won't fix, so it fails
    // fast instead of wasting DOWNLOAD_ATTEMPTS rounds of delay.
    let res: Response | undefined;
    let lastError: unknown;
    for (let attempt = 1; attempt <= DOWNLOAD_ATTEMPTS; attempt++) {
      this._logger.http(`${this._name} request`, { url, attempt });
      try {
        res = await fetch(url, {
          signal: AbortSignal.timeout(IBTrACSConfig.RequestTimeout),
        });
        break;
      } catch (error) {
        lastError = error;
        logNetworkError(this._logger, this._name, url, error);
        if (attempt < DOWNLOAD_ATTEMPTS) {
          this._logger.warn(`${this._name}: retrying download`, {
            attempt,
            url,
          });
          await this._sleep(RETRY_DELAY_MS);
        }
      }
    }
    if (!res) throw lastError;

    this._logger.http(`${this._name} response`, { status: res.status });
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
      throw new Error(`IBTrACS API Error - Status: ${res.status}\n ${url}`);
    }

    return await this._streamRows(res);
  }

  public async fetch(from: number, to: number): Promise<GeoJSONFeature[]> {
    void to; // the whole file is always read; 'to' has no separate meaning here
    // Full reconstruction (DB empty, from = getTimeOrigin()) needs the whole
    // 1980+ archive; any later/incremental call only needs the small,
    // fast-refreshing recent-window file.
    const isFullReconstruction = from <= this._origin;
    const url = isFullReconstruction
      ? IBTrACSConfig.FullArchiveUrl
      : IBTrACSConfig.RecentUrl;

    this._logger.verbose(`${this._name}: downloading`, {
      url,
      mode: isFullReconstruction ? "full archive" : "recent window",
    });

    const rows = await this._download(url);
    return this._myIBTrACSAdapter.toGeoJSON({ rows, from });
  }

  public getNextBatchEnd(_cursor: number, to: number): number {
    void _cursor;
    // One bulk read covers the whole requested range — no per-row API cap
    // to work around, and nothing gained by sub-dividing a local parse.
    return to;
  }

  public getDelay(): number {
    return 0; // no repeated small requests to pace anymore — a single bulk download per run
  }

  public getName(): string {
    return this._name;
  }

  public getTimeOrigin(): number {
    return this._origin;
  }

  public getRefreshRate(): number {
    // Not an env-configurable knob: once this matches the source's own real
    // update cadence (NOAA refreshes IBTrACS ~3x/week), there's no reason
    // for any deployment to ever want a different value — it's a fact about
    // this data source, same as its URL.
    return IBTrACSConfig.DefaultRefreshRateMinutes * 60_000;
  }

  public getEventType(): string {
    return this._myIBTrACSAdapter.getEventType();
  }

  public getProjectionFields(): string[] {
    return [
      "windSpeed",
      "pressure",
      "basin",
      "category",
      "track",
      "startTimestamp",
    ];
  }

  public parseSearchParams(
    query: Record<string, unknown>,
  ): Partial<EventSearchParams> {
    return {
      minwind: parseNumber(query.minwind, "minwind"),
      maxwind: parseNumber(query.maxwind, "maxwind"),
      category: parseEnumSet(
        query.category,
        "category",
        this._validCategorySet,
      ),
      basin: parseEnumSet(query.basin, "basin", this._validBasinSet),
    };
  }

  public validateSearchParams(_params: EventSearchParams): void {
    void _params; // no clamps needed today — the interface still requires the parameter
  }

  public buildQueryFragment(params: EventSearchParams): Filter<GeoJSONFeature> {
    // Owns the whole cyclone view of the query now, not just the
    // wind/category/basin part: the eventType match and the time window
    // both need cyclone-specific semantics (overlap + lag tolerance, not an
    // exact [from,to] match), so they belong here rather than in a generic,
    // shared place that would otherwise have to special-case "cyclone".
    const filter: Filter<GeoJSONFeature> = {
      "properties.eventType": { $in: [this.getEventType()] },
    };
    if (params.from !== undefined) {
      filter["properties.timestamp"] = {
        $gte: params.from - IBTrACSStrategy.CYCLONE_UPDATE_LAG_MS,
      };
    }
    if (params.to !== undefined) {
      filter["properties.startTimestamp"] = { $lte: params.to };
    }
    if (params.minwind !== undefined || params.maxwind !== undefined) {
      filter["properties.windSpeed"] = {
        ...(params.minwind !== undefined && { $gte: params.minwind }),
        ...(params.maxwind !== undefined && { $lte: params.maxwind }),
      };
    }
    if (params.category && params.category.length > 0)
      filter["properties.category"] = { $in: params.category };
    if (params.basin && params.basin.length > 0)
      filter["properties.basin"] = { $in: params.basin };
    return filter;
  }
}
