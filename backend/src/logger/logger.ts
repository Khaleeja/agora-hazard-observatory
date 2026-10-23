/**
 * logger.ts
 * Shared Winston logger with module-scoped child loggers and helpers for HTTP and network error logging.
 */

import winston, { createLogger, format, transports } from "winston";

const stripHtml = (html: string): string =>
  html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const readableFormat = format.printf(
  ({ level, message, timestamp, module, ...meta }) => {
    const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : "";
    return `${timestamp} [${level.toUpperCase()}] (${module ?? "-"}) ${message} ${metaStr}`;
  },
);

const logLevel = process.env.LOG_LEVEL || "debug";
const logFilePath = process.env.LOG_FILE_PATH || "logs/error.log";

export const logger = createLogger({
  level: logLevel,
  format: format.combine(
    format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  ),
  transports: [
    new transports.Console({
      format: format.combine(
        format.colorize(),
        readableFormat,
      ),
    }),
    new transports.File({
      filename: logFilePath,
      level: "error",
      format: readableFormat,
    }),
    new transports.File({
      filename: "logs/combined.log",
      format: readableFormat,
    }),
  ],
});

export const createModuleLogger = (module: string) => logger.child({ module });

export function logNetworkError(
  log: winston.Logger,
  source: string,
  url: URL | string,
  error: unknown,
): void {
  log.error(`${source} network error`, {
    url: url.toString(),
    error:
      error instanceof Error
        ? { message: error.message, stack: error.stack }
        : error,
  });
}

export function logHttpError(
  log: winston.Logger,
  source: string,
  url: URL | string,
  status: number,
  body: string,
  reason: string,
): void {
  log.error(`${source} API error`, {
    status,
    reason,
    url: url.toString(),
  });
  log.warn(`${source} API response body`, {
    body: stripHtml(body).slice(0, 150),
  });
  log.debug(`${source} API raw body`, {
    body: stripHtml(body).slice(0, 500) + "…",
  });
}

export function serializeError(error: unknown): Record<string, unknown> | unknown {
  return error instanceof Error
    ? { message: error.message, name: error.name, stack: error.stack }
    : error;
}
