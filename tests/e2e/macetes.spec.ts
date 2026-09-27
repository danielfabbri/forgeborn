import { expect, type Page, test } from '@playwright/test';

interface Sonda {
  tipo: (id: number) => string | null;
  nacao: (id: number) => string | null;
  naTela: (id: number) => { x: number; y: number } | null;
}

const quantidade = async (page: Page, recurso: string) =>
  Number(await page.getByTestId(`recurso-${recurso}`).locator('strong').textContent());

test('T-136/TEC-27: Enter abre o campo; maisferro e maiscobre somam; desconhecido avisa; Esc fecha', async ({
  page,
}) => {
  await page.goto('/?e2e');
  await page.locator('#viewport canvas').waitFor();
  await page.mouse.move(640, 360);
  await page.waitForTimeout(1000);
  // Com a Nave selecionada, "e" imprimiria um Hover (e gastaria Ferro) se vazasse para os atalhos.
  const nave = await page.evaluate(() => {
    const s = (window as unknown as { __forgeborn: Sonda }).__forgeborn;
    for (let id = 1; id < 200; id++) if (s.tipo(id) === 'ship' && s.nacao(id) === 'bra') return id;
    return 0;
  });
  const n = (await page.evaluate(
    (i) => (window as unknown as { __forgeborn: Sonda }).__forgeborn.naTela(i),
    nave,
  ))!;
  await page.mouse.click(n.x, n.y);
  const fe = await quantidade(page, 'fe');
  const cu = await quantidade(page, 'cu');

  await page.keyboard.press('Enter');
  const campo = page.getByTestId('macetes-campo');
  await expect(campo).toBeFocused();
  await page.keyboard.type('maisferro');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('macetes')).toHaveCount(0);
  await expect.poll(() => quantidade(page, 'fe')).toBe(fe + 1000);

  await page.keyboard.press('Enter');
  await expect(campo).toBeFocused();
  await page.keyboard.type('Mais Cobre');
  await page.keyboard.press('Enter');
  await expect.poll(() => quantidade(page, 'cu')).toBe(cu + 1000);

  await page.keyboard.press('Enter');
  await expect(campo).toBeFocused();
  await page.keyboard.type('maisouro');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('macetes-aviso')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('macetes')).toHaveCount(0);
  // Nada vazou: o Ferro segue exatamente com o macete.
  expect(await quantidade(page, 'fe')).toBe(fe + 1000);
});
