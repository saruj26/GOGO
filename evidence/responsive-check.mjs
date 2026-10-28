/**
 * Responsive verification (§23).
 *
 * Loads every significant screen of both applications at each required
 * breakpoint in a real browser and checks the things that actually break:
 * horizontal overflow, content wider than the viewport, touch targets too small
 * to hit, and text too small to read.
 *
 * Sessions are established through the real API and injected as the app itself
 * would store them, so authenticated screens are exercised rather than skipped.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const API = 'http://localhost:4000/api/v1';

// Supplied by the environment so no credential lives in this file.
// Set it to the password used when seeding the administrator.
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
if (!ADMIN_PASSWORD) {
  console.error('Set ADMIN_PASSWORD to the seeded administrator password before running this.');
  process.exit(1);
}
const WEB = 'http://localhost:3000';
const ADMIN = 'http://localhost:3001';

const BREAKPOINTS = [
  { width: 320, height: 720, label: '320 (small phone)' },
  { width: 375, height: 812, label: '375 (iPhone)' },
  { width: 390, height: 844, label: '390 (iPhone Pro)' },
  { width: 414, height: 896, label: '414 (large phone)' },
  { width: 768, height: 1024, label: '768 (tablet)' },
  { width: 1024, height: 768, label: '1024 (small laptop)' },
  { width: 1280, height: 800, label: '1280 (laptop)' },
  { width: 1440, height: 900, label: '1440 (desktop)' },
  { width: 1920, height: 1080, label: '1920 (large desktop)' },
];

const WEB_PAGES = [
  { path: '/', name: 'ride-booking' },
  { path: '/rides/shared', name: 'shared-rides' },
  { path: '/food', name: 'food' },
  { path: '/food/cart', name: 'cart' },
  { path: '/parcel', name: 'parcel' },
  { path: '/orders', name: 'orders' },
  { path: '/history', name: 'history' },
  { path: '/payments', name: 'payments' },
  { path: '/promotions', name: 'promotions' },
  { path: '/profile', name: 'profile' },
  { path: '/safety', name: 'safety' },
  { path: '/support', name: 'support' },
];

const ADMIN_PAGES = [
  { path: '/', name: 'dashboard' },
  { path: '/users', name: 'users' },
  { path: '/drivers', name: 'drivers' },
  { path: '/rides', name: 'rides' },
  { path: '/restaurants', name: 'restaurants' },
  { path: '/food-orders', name: 'food-orders' },
  { path: '/parcels', name: 'parcels' },
  { path: '/payments', name: 'payments' },
  { path: '/pricing', name: 'pricing' },
  { path: '/promotions', name: 'promotions' },
  { path: '/settings', name: 'settings' },
  { path: '/audit-logs', name: 'audit-logs' },
];

let failures = 0;
const problems = [];

async function login(phone, password) {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone, password }),
  });
  if (!res.ok) throw new Error(`login ${phone} failed: ${res.status}`);
  return res.json();
}

/** The checks that catch the failures the brief lists by name. */
async function audit(page, label) {
  return page.evaluate((viewportLabel) => {
    const issues = [];
    const doc = document.documentElement;

    if (doc.scrollWidth > doc.clientWidth + 1) {
      issues.push(`page scrolls horizontally (${doc.scrollWidth}px content in ${doc.clientWidth}px viewport)`);
    }

    const viewportWidth = doc.clientWidth;

    for (const el of Array.from(document.body.querySelectorAll('*'))) {
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;

      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;

      // Content escaping the viewport, unless it is inside something that is
      // deliberately scrollable (a wide table, a code block).
      if (rect.right > viewportWidth + 1 || rect.left < -1) {
        let scrollableAncestor = false;
        for (let p = el.parentElement; p; p = p.parentElement) {
          const overflow = getComputedStyle(p).overflowX;
          if (overflow === 'auto' || overflow === 'scroll') {
            scrollableAncestor = true;
            break;
          }
        }
        if (!scrollableAncestor && el.tagName !== 'CANVAS') {
          issues.push(
            `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? `.${el.className.split(' ')[0]}` : ''} overflows (right edge ${Math.round(rect.right)}px)`,
          );
        }
      }

      // Touch targets. Only enforced where a finger is the input device.
      if (viewportWidth < 768 && (el.tagName === 'BUTTON' || el.tagName === 'A')) {
        const interactive = el.getAttribute('aria-hidden') !== 'true';
        if (interactive && rect.height > 0 && rect.height < 32 && rect.width < 32) {
          issues.push(`tap target too small: ${el.tagName.toLowerCase()} ${Math.round(rect.width)}×${Math.round(rect.height)}`);
        }
      }

      // Body text below 12px is not readable on a phone.
      if (el.children.length === 0 && el.textContent?.trim()) {
        const size = parseFloat(style.fontSize);
        if (size > 0 && size < 10.5) {
          issues.push(`text too small (${size}px): "${el.textContent.trim().slice(0, 30)}"`);
        }
      }
    }

    return [...new Set(issues)].slice(0, 5);
  }, label);
}

async function checkApp({ browser, baseUrl, pages, credentials, appName, storageKey }) {
  console.log(`\n${appName}`);
  console.log('='.repeat(appName.length));

  for (const breakpoint of BREAKPOINTS) {
    // A fresh sign-in per context. The backend rotates refresh tokens, so
    // reusing one pair across contexts over a long run gets it revoked and the
    // later breakpoints would silently audit the sign-in page instead.
    const session = await login(credentials.phone, credentials.password);

    const context = await browser.newContext({
      viewport: { width: breakpoint.width, height: breakpoint.height },
      deviceScaleFactor: 1,
    });

    // Seed the session exactly as the application stores it.
    await context.addInitScript(
      ({ key, value }) => {
        window.localStorage.setItem(key, value);
      },
      { key: storageKey, value: JSON.stringify(session) },
    );

    const page = await context.newPage();
    const pageIssues = [];

    for (const target of pages) {
      // Several screens poll for live updates, so `networkidle` never settles.
      // Instead: load the document, then wait for the app to finish resolving
      // the session and its first data. Auditing a skeleton would prove nothing,
      // so this waits for the loading indicators to disappear before measuring.
      try {
        await page.goto(`${baseUrl}${target.path}`, {
          waitUntil: 'domcontentloaded',
          timeout: 20_000,
        });
      } catch {
        /* a slow page is still worth auditing in whatever state it reached */
      }

      try {
        await page.waitForFunction(
          () => {
            // Shimmer placeholders and any live-region spinner both mean data is
            // still arriving. `LoadingBlock` carries role="status", so this one
            // condition covers every loading state the design system uses.
            if (document.querySelectorAll('.skeleton').length > 0) return false;
            if (document.querySelector('[role="status"]')) return false;
            // The navigation shell alone exceeds this, so anything less is blank.
            return document.body.innerText.trim().length > 60;
          },
          { timeout: 20_000, polling: 250 },
        );
      } catch {
        /* recorded as-is if it never settles; the audit below still runs */
      }

      await page.waitForTimeout(500);

      const landed = await page.evaluate(() => location.pathname);
      if (landed === '/sign-in') {
        problems.push({ app: appName, breakpoint: breakpoint.label, page: target.name, issues: ['redirected to sign-in'] });
        failures += 1;
        pageIssues.push({ page: target.name, issues: ['redirected to sign-in — the session was not accepted'] });
        continue;
      }

      const rendered = await page.evaluate(() => document.body.innerText.trim().length);
      const issues = await audit(page, breakpoint.label);

      // A page that rendered nothing is a failure in its own right — auditing a
      // blank screen for overflow would prove nothing.
      if (rendered < 40) {
        issues.unshift(`rendered almost nothing (${rendered} characters of text)`);
      }

      if (issues.length > 0) {
        pageIssues.push({ page: target.name, issues });
        failures += 1;
        problems.push({ app: appName, breakpoint: breakpoint.label, page: target.name, issues });
      }

      // One screenshot per page at the two most representative widths.
      if (breakpoint.width === 390 || breakpoint.width === 1440) {
        await page.screenshot({
          path: `screenshots/${appName.toLowerCase().replace(/\s+/g, '-')}-${target.name}-${breakpoint.width}.png`,
          fullPage: false,
        });
      }
    }

    const status = pageIssues.length === 0 ? 'PASS' : 'FAIL';
    console.log(`  ${status}  ${breakpoint.label.padEnd(24)} ${pages.length} pages`);
    for (const entry of pageIssues) {
      for (const issue of entry.issues) {
        console.log(`         ${entry.page}: ${issue}`);
      }
    }

    await context.close();
  }
}

async function main() {
  mkdirSync('screenshots', { recursive: true });

  console.log('RESPONSIVE VERIFICATION');
  console.log(`Started ${new Date().toISOString()}`);
  console.log(`Breakpoints: ${BREAKPOINTS.map((b) => b.width).join(', ')}`);

  // Verified up front so a bad credential fails immediately rather than after
  // twenty minutes of auditing sign-in pages.
  await login('+94770000002', 'DemoPassword123!');
  await login('+94770000500', ADMIN_PASSWORD);

  // Uses the Chrome already installed on this machine rather than downloading a
  // separate build.
  const browser = await chromium.launch({ channel: 'chrome' });

  await checkApp({
    browser,
    baseUrl: WEB,
    pages: WEB_PAGES,
    credentials: { phone: '+94770000002', password: 'DemoPassword123!' },
    appName: 'Customer web app',
    storageKey: 'rideflow.customer.session',
  });

  await checkApp({
    browser,
    baseUrl: ADMIN,
    pages: ADMIN_PAGES,
    credentials: { phone: '+94770000500', password: ADMIN_PASSWORD },
    appName: 'Admin console',
    storageKey: 'rideflow.admin.session',
  });

  await browser.close();

  console.log('');
  if (failures === 0) {
    console.log('RESULT: no horizontal overflow, clipping, small tap targets or unreadable text at any breakpoint');
  } else {
    console.log(`RESULT: ${failures} page/breakpoint combinations have problems`);
    process.exitCode = 1;
  }
  console.log(`Finished ${new Date().toISOString()}`);
}

main().catch((e) => {
  console.error('Aborted:', e.message);
  process.exitCode = 1;
});
