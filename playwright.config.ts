import { defineConfig, type ReporterDescription } from '@playwright/test';
import { loadEnv } from './tests/e2e/env';

loadEnv();

const PORT = Number(process.env.E2E_PORT ?? 3210);
const baseURL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`;
/** Point the run at an already-running app (a preview URL, say) with E2E_BASE_URL. */
const managesServer = !process.env.E2E_BASE_URL;

const reporter: ReporterDescription[] = [
  ['list'],
  ['html', { open: 'never', outputFolder: 'tests/e2e/.report' }],
];

/**
 * UI checks for Habitator. See tests/CLAUDE.md for what these are for and the
 * rule about running them.
 *
 * Two viewports, because the app is a phone-first PWA that also gets opened on a
 * desktop: `phone` is the one that matters and `desktop` exists to catch the
 * layout breaking outside the 448px column.
 *
 * The suite drives a PRODUCTION server (`next start`), never `next dev`, and
 * never reuses one it didn't start. Under a dozen parallel workers `next dev`
 * compiles on demand and will happily serve a page before its stylesheet is
 * ready — which looks exactly like "the UI is broken" to tests whose whole job
 * is spotting that. `npm run test:e2e` builds first for this reason.
 */
export default defineConfig({
  testDir: './tests/e2e',
  outputDir: './tests/e2e/.results',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter,
  use: {
    baseURL,
    browserName: 'chromium',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'phone',
      dependencies: ['setup'],
      testIgnore: /auth\.setup\.ts/,
      use: {
        storageState: 'tests/e2e/.auth/state.json',
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: 'desktop',
      dependencies: ['setup'],
      testIgnore: /auth\.setup\.ts/,
      use: {
        storageState: 'tests/e2e/.auth/state.json',
        viewport: { width: 1280, height: 900 },
      },
    },
  ],
  webServer: managesServer
    ? {
        command: `npm run start -- --port ${PORT}`,
        url: `${baseURL}/login`,
        reuseExistingServer: false,
        timeout: 120_000,
        stdout: 'ignore',
        stderr: 'pipe',
      }
    : undefined,
});
