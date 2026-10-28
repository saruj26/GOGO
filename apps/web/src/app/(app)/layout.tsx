'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { AppShell } from '@/components/app-shell';
import { LoadingBlock } from '@/components/ui/surfaces';
import { useMounted } from '@/hooks/use-mounted';
import { useAuth } from '@/lib/auth';

/**
 * Route protection.
 *
 * This is a convenience, not a security boundary: the API rejects an
 * unauthenticated request regardless of what the browser renders. It exists so a
 * signed-out visitor lands on the sign-in page instead of a screen full of
 * errors.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  const { signedIn, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  // Whether there is a session lives in localStorage, which the server cannot
  // see. Deciding before mount would render one tree on the server and another
  // on the client.
  const mounted = useMounted();

  useEffect(() => {
    if (mounted && !loading && !signedIn) {
      router.replace(`/sign-in?next=${encodeURIComponent(pathname)}`);
    }
  }, [mounted, loading, signedIn, router, pathname]);

  if (!mounted || loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <LoadingBlock label="Loading your account" />
      </div>
    );
  }

  if (!signedIn) return null;

  return <AppShell>{children}</AppShell>;
}
