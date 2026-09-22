export type ID = string;

export type Currency = "AED" | "USD";

export interface Money {
  amount: number;
  currency: Currency;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export type SortDirection = "asc" | "desc";

export interface ListQuery {
  search?: string;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortDirection?: SortDirection;
}

/**
 * Error DTO shape a real backend is expected to return. Mock services never
 * reject with this today, but every call site that reads `isError` from
 * TanStack Query is already written against it, so swapping in a real API
 * client only means throwing/rejecting with this shape.
 */
export interface ApiError {
  message: string;
  code?: string;
  status?: number;
  /** Which fields were wrong (a validation error). `path` is the field, for example "password" or "context.id". */
  fieldErrors?: { path: string; message: string }[];
  /** The server's reference for this request, to quote to support. */
  requestId?: string;
  /** From the Retry-After header, when the server asks the client to wait. */
  retryAfterSeconds?: number;
}
