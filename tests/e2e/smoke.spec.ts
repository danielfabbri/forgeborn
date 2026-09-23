import { expect, test } from '@playwright/test';

test('T-002: a página abre uma cena Three.js sem erros', async ({ page }) => {
  const erros: string[] = [];
  page.on('pageerror', (erro) => erros.push(erro.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') erros.push(msg.text());
  });

  await page.goto('/');
  await expect(page.locator('#viewport canvas')).toBeVisible();
  await page.waitForTimeout(500);

  expect(erros).toEqual([]);
});
