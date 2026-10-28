import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

afterEach(() => {
  cleanup();
});

// The App Router's navigation hooks have no implementation outside Next's
// runtime, so tests provide one. `routerMock` lets a test assert on redirects.
export const routerMock = {
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  refresh: vi.fn(),
  prefetch: vi.fn(),
};

vi.mock('next/navigation', () => ({
  useRouter: () => routerMock,
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({ id: 'ride-1' }),
}));

// MapLibre needs WebGL, which jsdom does not provide. The map is verified in a
// real browser; here it is stubbed so the screens around it can be tested.
vi.mock('@/components/map/lazy-map', () => ({
  MapView: () => null,
}));
vi.mock('@/components/map/map-view', () => ({
  MapView: () => null,
}));
