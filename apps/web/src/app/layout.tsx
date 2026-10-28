import type { Metadata, Viewport } from 'next';
// MapLibre's stylesheet is imported first so our own rules, which adjust its
// control chrome, are the ones that win.
import 'maplibre-gl/dist/maplibre-gl.css';
import './globals.css';
import { AppProviders } from './providers';

export const metadata: Metadata = {
  title: { default: 'RideFlow', template: '%s · RideFlow' },
  description: 'Rides, shared rides, food and parcels across the north.',
  applicationName: 'RideFlow',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Never block pinch-zoom; some people need it to read.
  maximumScale: 5,
  themeColor: '#0f5c63',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
