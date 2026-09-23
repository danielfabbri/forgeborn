import { expect, type Page, test } from '@playwright/test';

interface Camera {
  x: number;
  z: number;
  altura: number;
  yaw: number;
}

const lerCamera = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { __forgeborn: { camera: Camera } }).__forgeborn.camera,
  );

test.beforeEach(async ({ page }) => {
  await page.goto('/?e2e');
  await page.locator('#viewport canvas').waitFor();
  await page.waitForTimeout(500);
});

test('T-015: setas fazem pan e o foco não sai do mapa', async ({ page }) => {
  const inicio = await lerCamera(page);
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(600);
  await page.keyboard.up('ArrowUp');
  const depois = await lerCamera(page);
  expect(depois.z).toBeLessThan(inicio.z - 20);

  await page.keyboard.down('ArrowLeft');
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(6000);
  await page.keyboard.up('ArrowLeft');
  await page.keyboard.up('ArrowUp');
  const canto = await lerCamera(page);
  expect(canto.x).toBe(-240);
  expect(canto.z).toBe(-240);
});

test('T-015: a borda da tela faz pan', async ({ page }) => {
  const inicio = await lerCamera(page);
  await page.mouse.move(640, 360);
  await page.mouse.move(1279, 360);
  await page.waitForTimeout(500);
  await page.mouse.move(640, 360);
  const depois = await lerCamera(page);
  expect(depois.x).toBeGreaterThan(inicio.x + 10);
});

test('T-015: a roda faz zoom entre 15 m e 120 m', async ({ page }) => {
  await page.mouse.move(640, 360);
  for (let i = 0; i < 30; i++) await page.mouse.wheel(0, -100);
  await page.waitForTimeout(800);
  expect((await lerCamera(page)).altura).toBeCloseTo(15, 0);
  for (let i = 0; i < 40; i++) await page.mouse.wheel(0, 100);
  await page.waitForTimeout(800);
  expect((await lerCamera(page)).altura).toBeCloseTo(120, 0);
});

test('T-015: o botão do meio gira e Home volta ao norte', async ({ page }) => {
  await page.mouse.move(640, 360);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(800, 360, { steps: 10 });
  await page.mouse.up({ button: 'middle' });
  expect((await lerCamera(page)).yaw).not.toBe(0);
  await page.keyboard.press('Home');
  await page.waitForTimeout(100);
  expect((await lerCamera(page)).yaw).toBe(0);
});
