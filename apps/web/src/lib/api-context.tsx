'use client';

import {
  ApiClient,
  browserTokenStore,
  createApi,
  type Api,
} from '@rideflow/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { createContext, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

interface ApiContextValue {
  api: Api;
  client: ApiClient;
}

const ApiContext = createContext<ApiContextValue | null>(null);

/**
 * The base URL is a public value — the address of our own API. It carries no
 * secret, and nothing privileged is ever read into browser code.
 */
const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export function ApiProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;

  const [{ api, client }] = useState<ApiContextValue>(() => {
    const httpClient = new ApiClient({
      baseUrl: BASE_URL,
      tokens: browserTokenStore('rideflow.customer'),
      onSessionExpired: () => {
        // Reached only once the refresh token has also failed.
        routerRef.current.replace('/sign-in?reason=expired');
      },
    });

    return { client: httpClient, api: createApi(httpClient) };
  });

  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Ride and order data changes constantly; a stale window this short
            // keeps screens honest without hammering the API.
            staleTime: 15_000,
            gcTime: 5 * 60_000,
            retry: (failureCount, error) => {
              // Never retry something the user has to fix, or an auth failure.
              const status = (error as { status?: number })?.status ?? 0;
              if (status >= 400 && status < 500) return false;
              return failureCount < 2;
            },
            refetchOnWindowFocus: false,
          },
          mutations: { retry: false },
        },
      }),
  );

  const value = useMemo(() => ({ api, client }), [api, client]);

  return (
    <ApiContext.Provider value={value}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </ApiContext.Provider>
  );
}

export function useApi(): Api {
  const context = useContext(ApiContext);
  if (!context) throw new Error('useApi must be used inside ApiProvider');
  return context.api;
}

export function useApiClient(): ApiClient {
  const context = useContext(ApiContext);
  if (!context) throw new Error('useApiClient must be used inside ApiProvider');
  return context.client;
}
