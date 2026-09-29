import { expect, test } from '@playwright/test';

interface Sonda {
  tipo: (id: number) => string | null;
  nacao: (id: number) => string | null;
  naTela: (id: number) => { x: number; y: number } | null;
  recarga: (id: number) => { estado: string; estrutura: number | null } | null;
}

test('D-50/CTL-07: clique direito na Nave manda a unidade selecionada recarregar lá', async ({
  page,
}) => {
  await page.goto('/?e2e');
  await page.locator('#viewport canvas').waitFor();
  await page.mouse.move(640, 360);
  await page.waitForTimeout(1000);
  const ids = await page.evaluate(() => {
    const s = (window as unknown as { __forgeborn: Sonda }).__forgeborn;
    const achar = (tipo: string) => {
      for (let id = 1; id < 200; id++) if (s.tipo(id) === tipo && s.nacao(id) === 'bra') return id;
      return 0;
    };
    return { ex1: achar('hover_ex1'), nave: achar('ship') };
  });
  const naTela = (id: number) =>
    page.evaluate((i) => (window as unknown as { __forgeborn: Sonda }).__forgeborn.naTela(i), id);
  const a = (await naTela(ids.ex1))!;
  await page.mouse.click(a.x, a.y);
  const n = (await naTela(ids.nave))!;
  await page.mouse.click(n.x, n.y, { button: 'right' });
  await page.waitForTimeout(300);
  const r = await page.evaluate(
    (i) => (window as unknown as { __forgeborn: Sonda }).__forgeborn.recarga(i),
    ids.ex1,
  );
  expect(r).toMatchObject({ estrutura: ids.nave });
  expect(r!.estado).not.toBe('nenhuma');
});
