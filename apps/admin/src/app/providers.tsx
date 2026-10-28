'use client';

import type { ReactNode } from 'react';
import { ApiProvider } from '@/lib/api-context';
import { AdminApiProvider } from '@/lib/admin-context';
import { AuthProvider } from '@/lib/auth';
import { ToastProvider } from '@/components/ui/toast';

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ApiProvider>
      <AuthProvider>
        <AdminApiProvider>
          <ToastProvider>{children}</ToastProvider>
        </AdminApiProvider>
      </AuthProvider>
    </ApiProvider>
  );
}
