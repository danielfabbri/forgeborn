import { expect, type Page, test } from '@playwright/test';

interface SondaDosMenus {
  corpoNaTela: (id: string) => { x: number; y: number } | null;
}
const corpo = (page: Page, id: string) =>
  page.evaluate(
    (c) => (window as unknown as { __menus: SondaDosMenus }).__menus.corpoNaTela(c),
    id,
  );

test('T-131/CAM-09/FLX-05/FLX-06: slot novo → nação → Universo → Briefing → missão 0', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const erros: string[] = [];
  page.on('pageerror', (e) => erros.push(String(e)));
  await page.goto('/?menu');
  await page.getByTestId('selecao-de-modo').waitFor();
  await page.getByTestId('modo-campanha').click();
  await page.getByTestId('campanha-slots').waitFor();
  await page.getByTestId('slot-0-novo').click();
  await page.getByTestId('escolha-nacao').waitFor();
  await page.getByTestId('nacao-bra').click();
  await page.getByTestId('universo-painel').waitFor();
  await page.waitForTimeout(1200);
  // A Terra (Campo de testes) está disponível; a Lua ainda não.
  const terra = await corpo(page, 'terra');
  await page.mouse.click(terra!.x, terra!.y);
  await expect(page.getByTestId('missao-m00')).toBeEnabled();
  const lua = await corpo(page, 'lua');
  await page.mouse.click(lua!.x, lua!.y);
  await expect(page.getByTestId('missao-m01')).toBeDisabled();
  await page.mouse.click(terra!.x, terra!.y);
  await page.getByTestId('missao-m00').click();
  await page.getByTestId('briefing').waitFor();
  await expect(page.getByTestId('briefing-oponentes')).toContainText('treino');
  await expect(page.getByTestId('briefing-liberadas')).toContainText('Muro');
  await page.getByTestId('briefing-iniciar').click();
  await page.waitForURL(/campanha=0/);
  await page.locator('#viewport canvas').waitFor({ timeout: 60_000 });
  await page.getByTestId('energia').waitFor({ timeout: 60_000 });
  expect(erros).toEqual([]);
});
