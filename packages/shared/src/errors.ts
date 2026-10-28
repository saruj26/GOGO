/**
 * The error shape the backend's exception filter always returns.
 * Clients switch on `code`; `message` is safe to show a user; `reference`
 * correlates with the server log when somebody reports a problem.
 */
export interface ApiErrorBody {
  code: string;
  message: string;
  details?: unknown;
  reference?: string;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
    readonly reference?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** The session is gone; the caller should send the user to sign in. */
  get isAuthError(): boolean {
    return this.status === 401;
  }

  get isForbidden(): boolean {
    return this.status === 403;
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }

  /** Somebody else got there first — a seat, a delivery, a promotion. */
  get isConflict(): boolean {
    return this.status === 409;
  }

  /** Transient: the right response is to offer a retry, not to blame the user. */
  get isRetryable(): boolean {
    return this.status === 0 || this.status === 429 || this.status >= 500;
  }
}

/** Raised when a request exceeds its time budget or the network is unreachable. */
export class NetworkError extends ApiError {
  constructor(message = 'We could not reach the service. Check your connection and try again.') {
    super(0, 'NETWORK_ERROR', message);
    this.name = 'NetworkError';
  }
}

/**
 * A user-facing sentence for any failure.
 *
 * The backend already writes messages meant for people, so those are used
 * as-is; this only covers the cases where there is no body to read.
 */
export function messageFor(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof DOMException && error.name === 'AbortError') return 'Request cancelled.';
  return 'Something went wrong. Please try again.';
}
