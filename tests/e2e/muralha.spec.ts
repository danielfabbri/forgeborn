import { expect, test } from '@playwright/test';

interface Sonda {
  tipo: (id: number) => string | null;
  nacao: (id: number) => string | null;
  naTela: (id: number) => { x: number; y: number } | null;
  rumo: (id: number) => [number, number, number] | null;
  selecao?: readonly number[];
  localValido: (tipo: string, x: number, y: number) => boolean;
}
type Janela = { __forgeborn: Sonda };

test('T-058/D-56: apertar e arrastar gira o Muro; o segmento nasce com esse rumo', async ({
  page,
}) => {
  await page.goto('/?e2e');
  await page.locator('#viewport canvas').waitFor();
  await page.mouse.move(640, 360);
  await page.waitForTimeout(1000);
  const impressora = await page.evaluate(() => {
    const s = (window as unknown as Janela).__forgeborn;
    for (let id = 1; id < 300; id++)
      if (s.tipo(id) === 'printer' && s.nacao(id) === 'bra') return id;
    return 0;
  });
  const p = await page.evaluate(
    (i) => (window as unknown as Janela).__forgeborn.naTela(i),
    impressora,
  );
  await page.mouse.click(p!.x, p!.y);
  await page.keyboard.press('KeyB');
  await page.keyboard.press('KeyM');
  // Um ponto livre perto do centro da tela.
  const livre = await page.evaluate(() => {
    const s = (window as unknown as Janela).__forgeborn;
    for (let y = 380; y < 600; y += 20)
      for (let x = 300; x < 1000; x += 20)
        if (
          [
            [0, 0],
            [-80, -80],
            [80, -80],
            [-80, 80],
            [80, 80],
          ].every(([dx, dy]) => s.localValido('wall', x + dx!, y + dy!))
        )
          return { x, y };
    return null;
  });
  expect(livre).not.toBeNull();
  await page.mouse.move(livre!.x, livre!.y);
  await page.mouse.down();
  await page.mouse.move(livre!.x + 40, livre!.y + 40, { steps: 5 });
  await page.mouse.move(livre!.x + 80, livre!.y + 5, { steps: 5 });
  await page.mouse.up();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const s = (window as unknown as Janela).__forgeborn;
        for (let id = 1; id < 400; id++)
          if (s.tipo(id) === 'wall' && s.nacao(id) === 'bra') return s.rumo(id) !== null;
        return false;
      }),
    )
    .toBe(true);
});

test('T-107/UI-15: botões de parados contam e o clique seleciona o próximo', async ({ page }) => {
  await page.goto('/?e2e');
  await page.locator('#viewport canvas').waitFor();
  await page.waitForTimeout(1000);
  const botao = page.getByTestId('parados-impressoras');
  await expect(botao).toBeVisible();
  await expect(page.getByTestId('parados-mineradores')).toBeVisible();
  // A cena tem Impressoras sem fila: o botão conta e seleciona uma delas.
  await expect.poll(async () => Number(await botao.locator('.n').textContent())).toBeGreaterThan(0);
  await botao.click();
  const sel = await page.evaluate(() => (window as unknown as Janela).__forgeborn.selecao ?? []);
  expect(sel).toHaveLength(1);
  expect(
    await page.evaluate((i) => (window as unknown as Janela).__forgeborn.tipo(i), sel[0]!),
  ).toBe('printer');
});
