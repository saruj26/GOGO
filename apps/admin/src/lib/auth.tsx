'use client';

import type { AuthTokens, Me } from '@rideflow/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { useApi, useApiClient } from './api-context';

interface AuthContextValue {
  user: Me | null;
  loading: boolean;
  signedIn: boolean;
  /** True only when the account actually holds the ADMIN role. */
  isAdmin: boolean;
  signIn: (phone: string, password: string) => Promise<Me>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const api = useApi();
  const client = useApiClient();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: user, isLoading, refetch } = useQuery({
    queryKey: ['me'],
    queryFn: ({ signal }) => api.auth.me({ signal }),
    enabled: client.hasSession,
    retry: false,
    staleTime: 60_000,
  });

  const signInMutation = useMutation({
    mutationFn: ({ phone, password }: { phone: string; password: string }) =>
      api.auth.login(phone, password),
    onSuccess: (tokens: AuthTokens) => {
      client.setSession(tokens);
      queryClient.clear();
    },
  });

  const signIn = useCallback(
    async (phone: string, password: string) => {
      await signInMutation.mutateAsync({ phone, password });
      const { data } = await refetch();

      // The role check is a courtesy so a non-admin gets a clear message rather
      // than a wall of 403s. The API is the actual authority and refuses every
      // admin endpoint regardless of what this decides.
      if (!data) throw new Error('Could not load your account.');
      return data;
    },
    [signInMutation, refetch],
  );

  const signOut = useCallback(async () => {
    try {
      await api.auth.logout();
    } catch {
      // Signing out locally regardless.
    }
    client.clearSession();
    queryClient.clear();
    router.replace('/sign-in');
  }, [api, client, queryClient, router]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: user ?? null,
      loading: client.hasSession && isLoading,
      signedIn: Boolean(user),
      isAdmin: Boolean(user?.roles.includes('ADMIN')),
      signIn,
      signOut,
    }),
    [user, isLoading, client, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
