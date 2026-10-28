'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { createAdminApi, type AdminApi } from './admin-api';
import { useApiClient } from './api-context';

const AdminApiContext = createContext<AdminApi | null>(null);

export function AdminApiProvider({ children }: { children: ReactNode }) {
  const client = useApiClient();
  const api = useMemo(() => createAdminApi(client), [client]);

  return <AdminApiContext.Provider value={api}>{children}</AdminApiContext.Provider>;
}

export function useAdminApi(): AdminApi {
  const context = useContext(AdminApiContext);
  if (!context) throw new Error('useAdminApi must be used inside AdminApiProvider');
  return context;
}

export type * from './admin-api';
