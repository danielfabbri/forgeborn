import { defineConfig } from '@playwright/test';

const PORT = 5199;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  use: {
    baseURL: `http://localhost:${PORT}`,
    // No Windows usa o Edge instalado; nos demais sistemas, o Chromium do Playwright
    // (instale com `npx playwright install chromium`).
    channel: process.platform === 'win32' ? 'msedge' : undefined,
  },
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
