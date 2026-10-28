'use client';

import type { ReactNode } from 'react';
import { ApiProvider } from '@/lib/api-context';
import { AuthProvider } from '@/lib/auth';
import { ToastProvider } from '@/components/ui/toast';

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ApiProvider>
      <AuthProvider>
        <ToastProvider>{children}</ToastProvider>
      </AuthProvider>
    </ApiProvider>
  );
}
