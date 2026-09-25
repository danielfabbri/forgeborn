import { expect, test } from '@playwright/test';

interface Sonda {
  naTela: (id: number) => { x: number; y: number } | null;
  criarNaTela: (tipo: string, nacao: string, x: number, y: number) => boolean;
  chaoNaTela: (x: number, y: number) => boolean;
  satelites: () => Array<{ id: number; nacao: string; estado: string; indo: boolean }>;
  sinalizadores: () => string[];
}

test('T-075/UI-14: satélite no céu, selecionável; clique direito reposiciona com sinalizador', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.goto('/?e2e');
  await page.locator('#viewport canvas').waitFor();
  await page.mouse.move(640, 360);
  await page.waitForTimeout(1000);
  expect(
    await page.evaluate(() =>
      (window as unknown as { __forgeborn: Sonda }).__forgeborn.criarNaTela(
        'satellite_uplink',
        'bra',
        760,
        420,
      ),
    ),
  ).toBe(true);
  // Lançamento (tempo_lancamento_satelite_s) até a órbita; a cena de teste pode já ter outro.
  const alvoSat = async () =>
    page.evaluate(() => {
      const s = (window as unknown as { __forgeborn: Sonda }).__forgeborn;
      for (const sat of s.satelites()) {
        if (sat.nacao !== 'bra' || sat.estado !== 'orbita') continue;
        const p = s.naTela(sat.id);
        if (p && p.x > 0 && p.y > 0 && p.x < 1280 && p.y < 720) return { id: sat.id, ...p };
      }
      return null;
    });
  await expect.poll(alvoSat, { timeout: 45_000 }).not.toBeNull();
  const p = await alvoSat();
  const sat = p!.id;
  expect(p).not.toBeNull();
  await page.mouse.click(p!.x, p!.y);
  await expect(page.getByTestId('selecao-nome')).toHaveText('Satélite');
  // Clique direito no terreno: o satélite vai para lá e o sinal de satélite aparece.
  const alvo = { x: 420, y: 520 };
  expect(
    await page.evaluate(
      ([x, y]) => (window as unknown as { __forgeborn: Sonda }).__forgeborn.chaoNaTela(x!, y!),
      [alvo.x, alvo.y],
    ),
  ).toBe(true);
  await page.mouse.click(alvo.x, alvo.y, { button: 'right' });
  await page.waitForTimeout(150);
  expect(
    await page.evaluate(() =>
      (window as unknown as { __forgeborn: Sonda }).__forgeborn.sinalizadores(),
    ),
  ).toContain('satelite');
  await expect
    .poll(() =>
      page.evaluate(
        (i) =>
          (window as unknown as { __forgeborn: Sonda }).__forgeborn
            .satelites()
            .find((x) => x.id === i)!.indo,
        sat,
      ),
    )
    .toBe(true);
});
