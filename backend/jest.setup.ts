// jest.setup.ts
// Runs once, before any test file (or the modules it imports) loads —
// redirects Winston's file logging (see src/logger/logger.ts, which reads
// this at module-load time) to a disposable, gitignored location, instead
// of backend/logs/, which `npm run dev` and the Docker container both
// write real/live log entries into. Without this, running the test suite
// pollutes the same files someone would actually be reading to check on
// their running server.
process.env.LOG_FILE_PATH = ".jest-logs/error.log";
