import { expect, type Page, test } from '@playwright/test';

type Vec3 = [number, number, number];

interface Camera {
  foco: Vec3;
  altura: number;
  rumo: number;
}

const RAIO = 144;

const lerCamera = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { __forgeborn: { camera: Camera } }).__forgeborn.camera,
  );

/** Distância pelo arco (m) entre dois focos. */
const arco = (a: Vec3, b: Vec3) =>
  RAIO * Math.acos(Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])));

test.beforeEach(async ({ page }) => {
  await page.goto('/?e2e');
  await page.locator('#viewport canvas').waitFor();
  await page.waitForTimeout(500);
});

test('T-015/CTL-02: setas fazem pan e dão a volta no planeta sem girar a câmera', async ({
  page,
}) => {
  const inicio = await lerCamera(page);
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(600);
  await page.keyboard.up('ArrowUp');
  const depois = await lerCamera(page);
  expect(arco(inicio.foco, depois.foco)).toBeGreaterThan(20);
  // Sem borda: segue em frente pelo planeta e a câmera não gira sozinha.
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(4000);
  await page.keyboard.up('ArrowUp');
  const longe = await lerCamera(page);
  expect(arco(inicio.foco, longe.foco)).toBeGreaterThan(60);
  // Andando sempre "para frente", o foco fica num único grande círculo: os três focos e o
  // centro do planeta são coplanares (produto misto ≈ 0).
  const [a, b, c] = [inicio.foco, depois.foco, longe.foco];
  const misto =
    a[0] * (b[1] * c[2] - b[2] * c[1]) -
    a[1] * (b[0] * c[2] - b[2] * c[0]) +
    a[2] * (b[0] * c[1] - b[1] * c[0]);
  expect(Math.abs(misto)).toBeLessThan(1e-3);
});

test('T-015: a borda da tela faz pan', async ({ page }) => {
  const inicio = await lerCamera(page);
  await page.mouse.move(640, 360);
  await page.mouse.move(1279, 360);
  await page.waitForTimeout(500);
  await page.mouse.move(640, 360);
  const depois = await lerCamera(page);
  expect(arco(inicio.foco, depois.foco)).toBeGreaterThan(10);
});

test('T-015/CTL-16: a roda faz zoom de 15 m até a visão planetária', async ({ page }) => {
  await page.mouse.move(640, 360);
  for (let i = 0; i < 30; i++) await page.mouse.wheel(0, -100);
  await page.waitForTimeout(800);
  expect((await lerCamera(page)).altura).toBeCloseTo(15, 0);
  await page.screenshot({ path: 'docs/referencia/t015-rts-perto.png' });
  for (let i = 0; i < 60; i++) await page.mouse.wheel(0, 100);
  await page.waitForTimeout(1200);
  // CTL-16: até 3,5 × raio a partir do centro, ou seja, 2,5 × raio acima do chão.
  expect((await lerCamera(page)).altura).toBeCloseTo(2.5 * RAIO, 0);
});

test('T-015: o botão do meio gira e Home volta ao norte', async ({ page }) => {
  await page.mouse.move(640, 360);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(800, 360, { steps: 10 });
  await page.mouse.up({ button: 'middle' });
  expect(Math.abs((await lerCamera(page)).rumo)).toBeGreaterThan(0.1);
  await page.keyboard.press('Home');
  await page.waitForTimeout(100);
  expect((await lerCamera(page)).rumo).toBeCloseTo(0, 6);
});
