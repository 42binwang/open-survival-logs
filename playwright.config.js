// @ts-check
// Browser tests (`npm run e2e`): every tests/e2e/*.spec.js against the Vite dev server of this checkout, in Chromium
// at 1920 × 1080. `@smoke` tests are the quick tier the gate runs with --quick.
import { defineConfig, devices } from '@playwright/test';
import { devPort } from './tools/gate/port.mjs';

const { port } = devPort();
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '**/*.spec.{js,mjs}',
  outputDir: 'test-results/e2e',
  forbidOnly: true,
  retries: 0,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  globalSetup: './tests/e2e/global-setup.js',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  // hardware WebGL on macOS (Metal through ANGLE) for the three.js renderer; SwiftShader elsewhere
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1920, height: 1080 }, launchOptions: { args: process.platform === 'darwin' ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] : [] } } }],
  webServer: {
    command: `npx vite --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
