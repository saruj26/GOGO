'use client';

import { useEffect, useState } from 'react';

/**
 * False during server rendering and the first client render, true afterwards.
 *
 * Anything that depends on browser-only state — a session in localStorage, the
 * viewport, a stored preference — must not decide what to render until this is
 * true. Otherwise the server produces one tree, the client produces another, and
 * React discards the server HTML with a hydration error and a visible flash.
 */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return mounted;
}
