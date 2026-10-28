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
  signIn: (phone: string, password: string) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => void;
}

export interface RegisterInput {
  phone: string;
  password: string;
  firstName: string;
  lastName?: string;
  email?: string;
  gender?: string;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const api = useApi();
  const client = useApiClient();
  const router = useRouter();
  const queryClient = useQueryClient();

  // The profile is the source of truth for "who is signed in". A token that the
  // server no longer accepts produces no user, which is the correct answer.
  const {
    data: user,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['me'],
    queryFn: ({ signal }) => api.auth.me({ signal }),
    enabled: client.hasSession,
    retry: false,
    staleTime: 60_000,
  });

  const adopt = useCallback(
    async (tokens: AuthTokens) => {
      client.setSession(tokens);
      // Anything cached under the previous identity must not survive.
      queryClient.clear();
      await refetch();
    },
    [client, queryClient, refetch],
  );

  const signInMutation = useMutation({
    mutationFn: ({ phone, password }: { phone: string; password: string }) =>
      api.auth.login(phone, password),
    onSuccess: adopt,
  });

  const registerMutation = useMutation({
    mutationFn: (input: RegisterInput) => api.auth.register(input),
    onSuccess: adopt,
  });

  const signIn = useCallback(
    async (phone: string, password: string) => {
      await signInMutation.mutateAsync({ phone, password });
    },
    [signInMutation],
  );

  const register = useCallback(
    async (input: RegisterInput) => {
      await registerMutation.mutateAsync(input);
    },
    [registerMutation],
  );

  const signOut = useCallback(async () => {
    try {
      await api.auth.logout();
    } catch {
      // Whether or not the server acknowledged, this device is signing out.
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
      signIn,
      register,
      signOut,
      refresh: () => void refetch(),
    }),
    [user, isLoading, client, signIn, register, signOut, refetch],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
