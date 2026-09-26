import { expect, test, type Page } from '@playwright/test';

interface Sonda {
  tipo: (id: number) => string | null;
  nacao: (id: number) => string | null;
  naTela: (id: number) => { x: number; y: number } | null;
  plantios: (id: number) => { plantios: number; carregador: number } | null;
  chaoNaTela: (x: number, y: number) => boolean;
}
type Janela = { __forgeborn: Sonda };

async function primeiro(page: Page, tipo: string): Promise<number> {
  return page.evaluate((t) => {
    const s = (window as unknown as Janela).__forgeborn;
    for (let id = 1; id < 300; id++) if (s.tipo(id) === t && s.nacao(id) === 'bra') return id;
    return 0;
  }, tipo);
}
async function clicar(page: Page, id: number) {
  const p = await page.evaluate((i) => (window as unknown as Janela).__forgeborn.naTela(i), id);
  await page.mouse.click(p!.x, p!.y);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/?e2e');
  await page.locator('#viewport canvas').waitFor();
  await page.mouse.move(640, 360);
  await page.waitForTimeout(1000);
});

test('T-108/UI-16: cartão do Plantio de Minas: foto da mina e clique no terreno plantam', async ({
  page,
}) => {
  test.setTimeout(60_000);
  const hover = await primeiro(page, 'hover_minelayer');
  // Espera a primeira mina ficar pronta no carregador (UNI-01).
  await expect
    .poll(
      () =>
        page.evaluate(
          (i) => (window as unknown as Janela).__forgeborn.plantios(i)!.carregador,
          hover,
        ),
      { timeout: 30_000 },
    )
    .toBeGreaterThan(0);
  await clicar(page, hover);
  await expect(page.getByTestId('carregador-minas')).toBeVisible();
  const foto = page.locator('[data-item="mine"]');
  await expect(foto).toBeVisible();
  await foto.click();
  const ponto = { x: 700, y: 520 };
  expect(
    await page.evaluate(
      ([x, y]) => (window as unknown as Janela).__forgeborn.chaoNaTela(x!, y!),
      [ponto.x, ponto.y],
    ),
  ).toBe(true);
  await page.mouse.click(ponto.x, ponto.y);
  await expect
    .poll(() =>
      page.evaluate((i) => (window as unknown as Janela).__forgeborn.plantios(i)!.plantios, hover),
    )
    .toBeGreaterThan(0);
});

test('T-077/ENE-24: a Bateria Móvel não tem botão de liga/desliga (sempre ativa)', async ({
  page,
}) => {
  const bateria = await primeiro(page, 'mobile_battery');
  await clicar(page, bateria);
  await expect(page.getByTestId('painel-selecao')).toBeVisible();
  await expect(page.getByTestId('alternar-suporte')).toHaveCount(0);
});
