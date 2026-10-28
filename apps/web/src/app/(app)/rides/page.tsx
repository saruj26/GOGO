'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { LoadingBlock } from '@/components/ui/surfaces';

/** Rides live under Orders (active) and History (past); this keeps the URL working. */
export default function RidesIndexPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/history?tab=rides');
  }, [router]);

  return <LoadingBlock />;
}
