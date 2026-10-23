import { BadRequestError } from "../errors/BadRequestError";
import { GeoJSONFeature } from "../types/GeoJSONFeature";

// Allowed characters for event type strings — prevents NoSQL operator injection
const TYPE_PATTERN = /^[a-zA-Z0-9_-]{1,50}$/;

const VALID_SEVERITIES = new Set<GeoJSONFeature["properties"]["severity"]>([
  "Low",
  "Medium",
  "High",
]);

export function parseTimestamp(
  val: unknown,
  field: string,
): number | undefined {
  if (val === undefined || val === "") return undefined;
  const d = new Date(String(val));
  if (isNaN(d.getTime()))
    throw new BadRequestError(
      `'${field}' must be a valid ISO 8601 date (e.g. 2024-01-01 or 2024-01-01T00:00:00Z)`,
    );
  return d.getTime();
}

/**
 * Parses a query param as a finite number. Returns undefined if absent.
 * Throws BadRequestError if present but not a valid finite number.
 */
export function parseNumber(val: unknown, field: string): number | undefined {
  if (val === undefined || val === "") return undefined;
  const n = Number(val);
  if (!Number.isFinite(n))
    throw new BadRequestError(`'${field}' must be a finite number`);
  return n;
}

/**
 * Normalises the 'type' query param (single string or array of strings).
 * Rejects any value that doesn't match the safe-identifier pattern.
 */
export function parseType(val: unknown): string[] | undefined {
  if (val === undefined) return undefined;
  const arr = Array.isArray(val) ? val : [val];
  const types = arr.map((v) => String(v));
  if (types.some((t) => !TYPE_PATTERN.test(t)))
    throw new BadRequestError(
      "'type' values must be alphanumeric identifiers (max 50 chars)",
    );
  return types;
}

/**
 * Normalises the 'severity' query param. Accepts any capitalisation.
 * Rejects values not in the allowed set (Low | Medium | High).
 */
export function parseSeverity(
  val: unknown,
): GeoJSONFeature["properties"]["severity"][] | undefined {
  if (val === undefined) return undefined;
  const arr = Array.isArray(val) ? val : [val];
  const normalised = arr.map((v) => {
    const s = String(v);
    return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  });
  const invalid = normalised.filter(
    (s) => !VALID_SEVERITIES.has(s as GeoJSONFeature["properties"]["severity"]),
  );
  if (invalid.length > 0)
    throw new BadRequestError(
      `Invalid severity values: ${invalid.join(", ")}. Allowed: Low, Medium, High`,
    );
  return normalised as GeoJSONFeature["properties"]["severity"][];
}

/**
 * Normalises a query param against a fixed allowed set of strings (case
 * as given — category/basin codes are already fixed-case in IBTrACS).
 */
export function parseEnumSet(
  val: unknown,
  field: string,
  allowed: Set<string>,
): string[] | undefined {
  if (val === undefined) return undefined;
  const arr = Array.isArray(val) ? val : [val];
  const values = arr.map((v) => String(v));
  const invalid = values.filter((v) => !allowed.has(v));
  if (invalid.length > 0)
    throw new BadRequestError(
      `Invalid ${field} values: ${invalid.join(", ")}. Allowed: ${[...allowed].join(", ")}`,
    );
  return values;
}
