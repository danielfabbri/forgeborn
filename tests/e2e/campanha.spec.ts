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

test('T-134/CAM-05/CAM-07: tutorial da Missão 0 com passo, destaque e Pular; a Missão 1 não tem', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.goto('/?campanha=0&missao=m00&nacao=bra');
  await page.getByTestId('energia').waitFor({ timeout: 60_000 });
  await expect(page.getByTestId('tutorial')).toHaveAttribute('data-passo', '1');
  await expect(page.locator('.tutorial-destaque')).toHaveCount(1);
  await page.getByTestId('tutorial-pular').click();
  await expect(page.getByTestId('tutorial')).toHaveCount(0);
  await expect(page.locator('.tutorial-destaque')).toHaveCount(0);
  await page.goto('/?campanha=0&missao=m01&nacao=bra');
  await page.getByTestId('energia').waitFor({ timeout: 60_000 });
  await page.waitForTimeout(1000);
  await expect(page.getByTestId('tutorial')).toHaveCount(0);
});

interface SondaDaPartida {
  tipo: (id: number) => string | null;
  nacao: (id: number) => string | null;
  destruir: (id: number) => void;
}

test('T-135/CAM-03/CAM-08: vencer a Missão 1 salva as estrelas e abre a Missão 2', async ({
  page,
}) => {
  test.setTimeout(120_000);
  // Um slot novo (bra) pelo menu.
  await page.goto('/?menu');
  await page.getByTestId('modo-campanha').click();
  await page.getByTestId('slot-1-novo').click();
  await page.getByTestId('nacao-bra').click();
  await page.getByTestId('universo-painel').waitFor();
  // Direto na Missão 1 (a 0 é pulada no teste): destrói o posto e vence.
  await page.goto('/?campanha=1&missao=m01&nacao=bra&sonda');
  await page.getByTestId('energia').waitFor({ timeout: 60_000 });
  await page.keyboard.press('Space');
  await page.evaluate(() => {
    const s = (window as unknown as { __forgeborn: SondaDaPartida }).__forgeborn;
    for (let id = 1; id < 400; id++) {
      const tipo = s.tipo(id);
      if (s.nacao(id) === 'usa' && tipo) s.destruir(id);
    }
  });
  await page.getByTestId('fim-de-partida').waitFor({ timeout: 30_000 });
  await expect(page.getByTestId('fim-estrelas')).toHaveAttribute('data-estrelas', '3');
  await page.waitForTimeout(500);
  await page.getByTestId('fim-menu').click();
  await page.getByTestId('universo-painel').waitFor({ timeout: 30_000 });
  await page.waitForTimeout(1200);
  const lua = await corpo(page, 'lua');
  await page.mouse.click(lua!.x, lua!.y);
  await expect(page.getByTestId('missao-m01')).toContainText('★★★');
  await expect(page.getByTestId('missao-m02')).toBeEnabled();
});
