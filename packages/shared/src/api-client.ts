import { ApiError, ApiErrorBody, NetworkError } from './errors';
import type { AuthTokens } from './types';

export interface TokenStore {
  read(): { accessToken: string; refreshToken: string } | null;
  write(tokens: { accessToken: string; refreshToken: string }): void;
  clear(): void;
}

export interface ApiClientOptions {
  baseUrl: string;
  tokens: TokenStore;
  /** Called when the session cannot be recovered, so the app can sign the user out. */
  onSessionExpired?: () => void;
  /** Default per-request budget. */
  timeoutMs?: number;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  /** Lets a caller cancel — a search-as-you-type superseded by the next keystroke. */
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Skips the Authorization header; used only for sign-in and registration. */
  anonymous?: boolean;
}

/**
 * The single place the applications talk to the API.
 *
 * It owns four things no component should repeat: attaching the access token,
 * recovering an expired session exactly once no matter how many requests hit
 * 401 together, turning every failure into a typed `ApiError` carrying a message
 * fit to show a person, and enforcing a time budget so a hung request cannot
 * leave a screen spinning forever.
 *
 * It holds no privileged secret. The access token lives in memory and in the
 * browser's own storage; nothing here knows a database credential or an API key.
 */
export class ApiClient {
  private readonly baseUrl: string;
  private readonly tokens: TokenStore;
  private readonly onSessionExpired?: () => void;
  private readonly timeoutMs: number;

  /**
   * In-flight refresh, shared by every request that discovers the token has
   * expired. Without this, ten concurrent 401s would fire ten refreshes and nine
   * of them would fail against the backend's rotating-token replay protection.
   */
  private refreshInFlight: Promise<boolean> | null = null;

  constructor(options: ApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.tokens = options.tokens;
    this.onSessionExpired = options.onSessionExpired;
    this.timeoutMs = options.timeoutMs ?? 20_000;
  }

  get<T>(path: string, options: Omit<RequestOptions, 'method' | 'body'> = {}) {
    return this.request<T>(path, { ...options, method: 'GET' });
  }

  post<T>(path: string, body?: unknown, options: Omit<RequestOptions, 'method' | 'body'> = {}) {
    return this.request<T>(path, { ...options, method: 'POST', body });
  }

  put<T>(path: string, body?: unknown, options: Omit<RequestOptions, 'method' | 'body'> = {}) {
    return this.request<T>(path, { ...options, method: 'PUT', body });
  }

  delete<T>(path: string, options: Omit<RequestOptions, 'method' | 'body'> = {}) {
    return this.request<T>(path, { ...options, method: 'DELETE' });
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const response = await this.send(path, options);

    // One retry, and only for an expired access token. A 401 on the retry means
    // the session is genuinely gone.
    if (response.status === 401 && !options.anonymous) {
      const recovered = await this.refreshSession();

      if (recovered) {
        const retried = await this.send(path, options);
        return this.parse<T>(retried);
      }

      this.tokens.clear();
      this.onSessionExpired?.();
      throw new ApiError(401, 'SESSION_EXPIRED', 'Your session has ended. Please sign in again.');
    }

    return this.parse<T>(response);
  }

  /** Stores a freshly issued pair after sign-in or registration. */
  setSession(tokens: AuthTokens): void {
    this.tokens.write({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken });
  }

  clearSession(): void {
    this.tokens.clear();
  }

  get hasSession(): boolean {
    return this.tokens.read() !== null;
  }

  // ------------------------------------------------------------------ internals

  private async send(path: string, options: RequestOptions): Promise<Response> {
    const url = this.buildUrl(path, options.query);
    const headers: Record<string, string> = { Accept: 'application/json' };

    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    if (!options.anonymous) {
      const stored = this.tokens.read();
      if (stored) headers.Authorization = `Bearer ${stored.accessToken}`;
    }

    // The caller's own cancellation and our timeout both have to abort the same
    // request, so they are combined.
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), options.timeoutMs ?? this.timeoutMs);
    const signal = options.signal
      ? anySignal([options.signal, timeout.signal])
      : timeout.signal;

    try {
      return await fetch(url, {
        method: options.method ?? 'GET',
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal,
        credentials: 'omit',
      });
    } catch (error) {
      // A caller-initiated cancellation is not a failure to report.
      if (options.signal?.aborted) throw error;
      throw new NetworkError();
    } finally {
      clearTimeout(timer);
    }
  }

  private async parse<T>(response: Response): Promise<T> {
    if (response.status === 204) {
      return undefined as T;
    }

    const text = await response.text();
    let payload: unknown = null;

    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = null;
      }
    }

    if (response.ok) {
      return payload as T;
    }

    const body = (payload as { error?: ApiErrorBody } | null)?.error;

    throw new ApiError(
      response.status,
      body?.code ?? 'ERROR',
      // The backend writes messages meant for people; anything else is a bug
      // there, so a generic sentence is the safe fallback.
      body?.message ?? 'Something went wrong. Please try again.',
      body?.details,
      body?.reference,
    );
  }

  /**
   * Exchanges the refresh token, collapsing concurrent attempts into one.
   * Returns false when the session cannot be recovered.
   */
  private refreshSession(): Promise<boolean> {
    if (this.refreshInFlight) return this.refreshInFlight;

    this.refreshInFlight = (async () => {
      const stored = this.tokens.read();
      if (!stored?.refreshToken) return false;

      try {
        const response = await fetch(`${this.baseUrl}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ refreshToken: stored.refreshToken }),
          credentials: 'omit',
        });

        if (!response.ok) return false;

        const tokens = (await response.json()) as AuthTokens;
        if (!tokens?.accessToken) return false;

        this.tokens.write({
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
        });
        return true;
      } catch {
        return false;
      } finally {
        // Cleared on the next tick so requests that arrived during the refresh
        // all observe the same result before a new attempt can start.
        setTimeout(() => {
          this.refreshInFlight = null;
        }, 0);
      }
    })();

    return this.refreshInFlight;
  }

  private buildUrl(path: string, query?: RequestOptions['query']): string {
    const url = new URL(`${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`);

    for (const [key, value] of Object.entries(query ?? {})) {
      if (value === undefined || value === null || value === '') continue;
      url.searchParams.set(key, String(value));
    }

    return url.toString();
  }
}

/** `AbortSignal.any` is not available everywhere yet. */
function anySignal(signals: AbortSignal[]): AbortSignal {
  const withAny = AbortSignal as unknown as { any?: (s: AbortSignal[]) => AbortSignal };
  if (typeof withAny.any === 'function') {
    return withAny.any(signals);
  }

  const controller = new AbortController();
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      break;
    }
    signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true });
  }
  return controller.signal;
}

/**
 * Session storage for a browser.
 *
 * Tokens are kept in memory for the life of the page and mirrored to
 * localStorage so a refresh does not sign the user out. Access tokens are short
 * lived and the backend rotates and revokes refresh tokens, which is what limits
 * the damage if a token is ever read from storage.
 */
export function browserTokenStore(namespace: string): TokenStore {
  const key = `${namespace}.session`;
  let cached: { accessToken: string; refreshToken: string } | null | undefined;

  return {
    read() {
      if (cached !== undefined) return cached;
      if (typeof window === 'undefined') return null;

      try {
        const raw = window.localStorage.getItem(key);
        cached = raw ? (JSON.parse(raw) as { accessToken: string; refreshToken: string }) : null;
      } catch {
        cached = null;
      }
      return cached;
    },
    write(tokens) {
      cached = tokens;
      try {
        window.localStorage.setItem(key, JSON.stringify(tokens));
      } catch {
        // A browser with storage disabled still works for this session.
      }
    },
    clear() {
      cached = null;
      try {
        window.localStorage.removeItem(key);
      } catch {
        /* nothing to clean up */
      }
    },
  };
}
