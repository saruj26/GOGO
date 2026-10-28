import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClient, type TokenStore } from './api-client';
import { ApiError, NetworkError } from './errors';

/** An in-memory session, so tests do not depend on a browser. */
function memoryStore(initial: { accessToken: string; refreshToken: string } | null = null): TokenStore {
  let tokens = initial;
  return {
    read: () => tokens,
    write: (next) => {
      tokens = next;
    },
    clear: () => {
      tokens = null;
    },
  };
}

const BASE = 'https://api.test/v1';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('ApiClient', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('authentication', () => {
    it('attaches the access token', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
      const client = new ApiClient({
        baseUrl: BASE,
        tokens: memoryStore({ accessToken: 'access-1', refreshToken: 'refresh-1' }),
      });

      await client.get('/rides');

      const [, init] = fetchMock.mock.calls[0];
      expect((init.headers as Record<string, string>).Authorization).toBe('Bearer access-1');
    });

    it('omits the token on an anonymous request', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
      const client = new ApiClient({
        baseUrl: BASE,
        tokens: memoryStore({ accessToken: 'access-1', refreshToken: 'refresh-1' }),
      });

      await client.post('/auth/login', { phone: '1' }, { anonymous: true });

      const [, init] = fetchMock.mock.calls[0];
      expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
    });
  });

  describe('session recovery', () => {
    it('refreshes once and retries the original request', async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ error: { code: 'X', message: 'expired' } }, 401))
        .mockResolvedValueOnce(
          jsonResponse({ accessToken: 'access-2', refreshToken: 'refresh-2', expiresIn: 900 }),
        )
        .mockResolvedValueOnce(jsonResponse({ ok: true }));

      const store = memoryStore({ accessToken: 'access-1', refreshToken: 'refresh-1' });
      const client = new ApiClient({ baseUrl: BASE, tokens: store });

      await expect(client.get('/rides')).resolves.toEqual({ ok: true });

      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(fetchMock.mock.calls[1][0]).toContain('/auth/refresh');
      expect(store.read()?.accessToken).toBe('access-2');
    });

    it('refreshes only once when several requests expire together', async () => {
      // Every first attempt fails, the refresh succeeds, every retry succeeds.
      fetchMock.mockImplementation((url: string) => {
        if (String(url).includes('/auth/refresh')) {
          return Promise.resolve(
            jsonResponse({ accessToken: 'access-2', refreshToken: 'refresh-2', expiresIn: 900 }),
          );
        }
        const previouslyRefreshed = fetchMock.mock.calls.some((call) =>
          String(call[0]).includes('/auth/refresh'),
        );
        return Promise.resolve(
          previouslyRefreshed
            ? jsonResponse({ ok: true })
            : jsonResponse({ error: { code: 'X', message: 'expired' } }, 401),
        );
      });

      const client = new ApiClient({
        baseUrl: BASE,
        tokens: memoryStore({ accessToken: 'access-1', refreshToken: 'refresh-1' }),
      });

      await Promise.all([client.get('/a'), client.get('/b'), client.get('/c')]);

      const refreshCalls = fetchMock.mock.calls.filter((call) =>
        String(call[0]).includes('/auth/refresh'),
      );
      // The backend rotates refresh tokens; a second concurrent refresh would be
      // rejected as a replay.
      expect(refreshCalls).toHaveLength(1);
    });

    it('clears the session and reports expiry when the refresh fails', async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ error: { code: 'X', message: 'expired' } }, 401))
        .mockResolvedValueOnce(jsonResponse({ error: { code: 'X', message: 'no' } }, 401));

      const store = memoryStore({ accessToken: 'access-1', refreshToken: 'refresh-1' });
      const onSessionExpired = vi.fn();
      const client = new ApiClient({ baseUrl: BASE, tokens: store, onSessionExpired });

      await expect(client.get('/rides')).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
      expect(store.read()).toBeNull();
      expect(onSessionExpired).toHaveBeenCalledOnce();
    });

    it('does not attempt a refresh for an anonymous request', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({ error: { code: 'X', message: 'Incorrect password' } }, 401),
      );

      const client = new ApiClient({ baseUrl: BASE, tokens: memoryStore() });

      await expect(
        client.post('/auth/login', { phone: '1' }, { anonymous: true }),
      ).rejects.toBeInstanceOf(ApiError);

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('errors', () => {
    it('surfaces the backend message and code', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(
          {
            error: {
              code: 'SEATS_UNAVAILABLE',
              message: 'The last seat has just been taken.',
              reference: 'abc-123',
            },
          },
          409,
        ),
      );

      const client = new ApiClient({ baseUrl: BASE, tokens: memoryStore() });

      await expect(client.post('/rides/shared/join')).rejects.toMatchObject({
        status: 409,
        code: 'SEATS_UNAVAILABLE',
        message: 'The last seat has just been taken.',
        reference: 'abc-123',
      });
    });

    it('classifies conflicts and retryable failures', async () => {
      const conflict = new ApiError(409, 'CONFLICT', 'taken');
      const busy = new ApiError(503, 'SERVICE_BUSY', 'busy');
      const bad = new ApiError(400, 'VALIDATION_FAILED', 'bad');

      expect(conflict.isConflict).toBe(true);
      expect(busy.isRetryable).toBe(true);
      expect(bad.isRetryable).toBe(false);
    });

    it('never leaks a raw body when the response is not JSON', async () => {
      fetchMock.mockResolvedValue(
        new Response('<html>Internal Server Error stack trace…</html>', { status: 500 }),
      );

      const client = new ApiClient({ baseUrl: BASE, tokens: memoryStore() });

      await expect(client.get('/rides')).rejects.toMatchObject({
        status: 500,
        message: 'Something went wrong. Please try again.',
      });
    });

    it('reports a network failure as such', async () => {
      fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

      const client = new ApiClient({ baseUrl: BASE, tokens: memoryStore() });

      await expect(client.get('/rides')).rejects.toBeInstanceOf(NetworkError);
    });
  });

  describe('requests', () => {
    it('omits empty query values rather than sending blanks', async () => {
      fetchMock.mockResolvedValue(jsonResponse([]));
      const client = new ApiClient({ baseUrl: BASE, tokens: memoryStore() });

      await client.get('/restaurants', {
        query: { q: 'kottu', openOnly: true, lat: undefined, cursor: '' },
      });

      const url = String(fetchMock.mock.calls[0][0]);
      expect(url).toContain('q=kottu');
      expect(url).toContain('openOnly=true');
      expect(url).not.toContain('lat=');
      expect(url).not.toContain('cursor=');
    });

    it('returns undefined for a 204', async () => {
      fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
      const client = new ApiClient({ baseUrl: BASE, tokens: memoryStore() });

      await expect(client.post('/auth/logout')).resolves.toBeUndefined();
    });

    it('propagates a caller cancellation', async () => {
      const controller = new AbortController();
      fetchMock.mockImplementation(() => {
        controller.abort();
        return Promise.reject(new DOMException('Aborted', 'AbortError'));
      });

      const client = new ApiClient({ baseUrl: BASE, tokens: memoryStore() });

      await expect(client.get('/places/search', { signal: controller.signal })).rejects.toThrow();
    });
  });
});
