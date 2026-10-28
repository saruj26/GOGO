'use client';

import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { AdminShell } from '@/components/admin-shell';
import { Button } from '@/components/ui/button';
import { LoadingBlock } from '@/components/ui/surfaces';
import { useMounted } from '@/hooks/use-mounted';
import { useAuth } from '@/lib/auth';

/**
 * Access control for the console.
 *
 * This decides what to render; it does not decide what is permitted. Every admin
 * endpoint re-checks the caller's role against the database, so a user who
 * defeated this would still be refused by the API.
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  const { signedIn, isAdmin, loading, signOut } = useAuth();
  const router = useRouter();
  // As in the customer app: the session is browser-only state, so nothing may
  // be decided from it until after mount.
  const mounted = useMounted();

  useEffect(() => {
    if (mounted && !loading && !signedIn) router.replace('/sign-in');
  }, [mounted, loading, signedIn, router]);

  if (!mounted || loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <LoadingBlock label="Checking your access" />
      </div>
    );
  }

  if (!signedIn) return null;

  if (!isAdmin) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
        <h1 className="text-lg font-semibold text-ink-900">No administrator access</h1>
        <p className="max-w-sm text-sm text-ink-500">
          This account is signed in, but it does not hold the administrator role.
        </p>
        <Button variant="secondary" onClick={() => void signOut()}>
          Sign out
        </Button>
      </div>
    );
  }

  return <AdminShell>{children}</AdminShell>;
}
