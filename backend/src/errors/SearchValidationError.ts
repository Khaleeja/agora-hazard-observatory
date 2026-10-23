/**
 * SearchValidationError.ts
 * Thrown by EventSearchService when query parameters are syntactically valid but semantically inconsistent (e.g. fromtime >= totime).
 * Mapped to HTTP 422 by the controller.
 */
export class SearchValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SearchValidationError";
  }
}
