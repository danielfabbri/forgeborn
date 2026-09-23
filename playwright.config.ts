import { defineConfig } from '@playwright/test';

const PORT = 5199;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  // Um worker só: vários testes medem fps (T-008, T-014) e cada página gera o planeta ao
  // carregar; em paralelo eles disputam a CPU e a medida deixa de valer.
  workers: 1,
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
