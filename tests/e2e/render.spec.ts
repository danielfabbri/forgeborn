import { expect, test } from '@playwright/test';

interface Amostra {
  t: number;
  tick: number;
  x: number;
}

test('T-008: entidade de teste se move suavemente e o overlay mostra FPS, tick e entidades', async ({
  page,
}) => {
  const erros: string[] = [];
  page.on('pageerror', (erro) => erros.push(erro.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') erros.push(msg.text());
  });

  await page.goto('/?e2e');
  await page.locator('#viewport canvas').waitFor();

  // TEC-26: Ctrl+Shift+D alterna o overlay.
  const overlay = page.getByTestId('debug-overlay');
  await expect(overlay).toBeHidden();
  await page.keyboard.press('Control+Shift+D');
  await expect(overlay).toBeVisible();

  await page.waitForTimeout(3000);
  const fps = Number(await page.getByTestId('debug-fps').textContent());
  const entidades = Number(await page.getByTestId('debug-entidades').textContent());
  const tickMs = Number(await page.getByTestId('debug-tick-ms').textContent());
  expect(fps).toBeGreaterThanOrEqual(55);
  expect(entidades).toBeGreaterThan(1);
  expect(tickMs).toBeGreaterThanOrEqual(0);

  const amostras = await page.evaluate(
    () =>
      (window as unknown as { __forgeborn?: { amostras: Amostra[] } }).__forgeborn?.amostras ?? [],
  );
  const janela = amostras.slice(-120);
  const primeira = janela[0]!;
  const ultima = janela.at(-1)!;

  // A simulação anda em tick_hz (20 ticks/s), seja qual for o FPS do render.
  const ticksPorSegundo = (ultima.tick - primeira.tick) / ((ultima.t - primeira.t) / 1000);
  expect(ticksPorSegundo).toBeGreaterThan(18);
  expect(ticksPorSegundo).toBeLessThan(22);

  // Suavidade: com interpolação há várias posições desenhadas por tick, não uma só.
  const ticksDistintos = new Set(janela.map((a) => a.tick)).size;
  const posicoesDistintas = new Set(janela.map((a) => a.x.toFixed(4))).size;
  expect(posicoesDistintas).toBeGreaterThan(ticksDistintos * 2);

  await page.keyboard.press('Control+Shift+D');
  await expect(overlay).toBeHidden();
  expect(erros).toEqual([]);
});
