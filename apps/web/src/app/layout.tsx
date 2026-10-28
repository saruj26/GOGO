import type { Metadata, Viewport } from 'next';
// MapLibre's stylesheet is imported first so our own rules, which adjust its
// control chrome, are the ones that win.
import 'maplibre-gl/dist/maplibre-gl.css';
import './globals.css';
import { AppProviders } from './providers';

export const metadata: Metadata = {
  title: { default: 'Tugo', template: '%s · Tugo' },
  description: 'Your ride, your way — rides, shared rides, food and parcels across Sri Lanka.',
  applicationName: 'Tugo',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Never block pinch-zoom; some people need it to read.
  maximumScale: 5,
  themeColor: '#007F86',
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
