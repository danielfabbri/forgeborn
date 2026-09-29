import { expect, test } from '@playwright/test';

interface Sonda {
  tipo: (id: number) => string | null;
  nacao: (id: number) => string | null;
  naTela: (id: number) => { x: number; y: number } | null;
  criarNaTela: (tipo: string, nacao: string, x: number, y: number) => boolean;
  localValido: (tipo: string, x: number, y: number) => boolean;
  chaoNaTela: (x: number, y: number) => boolean;
  misseis: (id: number) => string[] | null;
  misseisEmVoo: () => number;
}
type Janela = { __forgeborn: Sonda };

test('T-059/UNI-10: fabrica pelo cartão e lança com o clique direito', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/?e2e');
  await page.locator('#viewport canvas').waitFor();
  await page.mouse.move(640, 360);
  await page.waitForTimeout(1000);
  const lugar = await page.evaluate(() => {
    const s = (window as unknown as Janela).__forgeborn;
    for (let y = 300; y < 600; y += 20)
      for (let x = 300; x < 1000; x += 20) if (s.localValido('missile_silo', x, y)) return { x, y };
    return null;
  });
  expect(lugar).not.toBeNull();
  await page.evaluate(
    ([x, y]) =>
      (window as unknown as Janela).__forgeborn.criarNaTela('missile_silo', 'bra', x!, y!),
    [lugar!.x, lugar!.y],
  );
  await page.waitForTimeout(300);
  const silo = await page.evaluate(() => {
    const s = (window as unknown as Janela).__forgeborn;
    for (let id = 1; id < 400; id++) if (s.tipo(id) === 'missile_silo') return id;
    return 0;
  });
  const p = await page.evaluate((i) => (window as unknown as Janela).__forgeborn.naTela(i), silo);
  await page.mouse.click(p!.x, p!.y);
  await page.locator('[data-item="missile_short"]').click();
  await expect
    .poll(() => page.evaluate((i) => (window as unknown as Janela).__forgeborn.misseis(i), silo), {
      timeout: 45_000,
    })
    .toEqual(['missile_short']);
  await expect(page.getByTestId('misseis-prontos')).toContainText('1/5');
  // Um ponto de chão perto da base (dentro do alcance do curto).
  const alvo = { x: p!.x + 120, y: p!.y };
  expect(
    await page.evaluate(
      ([x, y]) => (window as unknown as Janela).__forgeborn.chaoNaTela(x!, y!),
      [alvo.x, alvo.y],
    ),
  ).toBe(true);
  await page.mouse.click(alvo.x, alvo.y, { button: 'right' });
  await expect
    .poll(() => page.evaluate(() => (window as unknown as Janela).__forgeborn.misseisEmVoo()))
    .toBe(1);
  expect(
    await page.evaluate((i) => (window as unknown as Janela).__forgeborn.misseis(i), silo),
  ).toEqual([]);
});
