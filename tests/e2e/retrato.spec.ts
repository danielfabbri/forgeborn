import { expect, test } from '@playwright/test';

interface Sonda {
  tipo: (id: number) => string | null;
  nacao: (id: number) => string | null;
  naTela: (id: number) => { x: number; y: number } | null;
}

// UI-03: trocar a seleção muitas vezes não pode esgotar os contextos WebGL do navegador
// (o mais antigo, o do mapa, seria derrubado e a tela ficaria preta ou branca).
test('UI-03: o retrato não derruba o contexto do mapa ao trocar a seleção', async ({ page }) => {
  await page.goto('/?e2e');
  await page.locator('#viewport canvas').waitFor();
  await page.evaluate(() => {
    const w = window as unknown as { __perdido: number };
    w.__perdido = 0;
    document
      .querySelector('#viewport canvas')!
      .addEventListener('webglcontextlost', () => w.__perdido++);
  });
  await page.mouse.move(640, 360);
  await page.waitForTimeout(800);
  const ids = await page.evaluate(() => {
    const s = (window as unknown as { __forgeborn: Sonda }).__forgeborn;
    const lista: number[] = [];
    for (let id = 1; id < 200; id++) {
      if (s.tipo(id) && s.nacao(id) === 'bra' && s.naTela(id)) lista.push(id);
    }
    return lista;
  });
  let retratos = 0;
  for (let k = 0; k < 24; k++) {
    const p = await page.evaluate(
      (id) => (window as unknown as { __forgeborn: Sonda }).__forgeborn.naTela(id),
      ids[k % ids.length]!,
    );
    if (p) await page.mouse.click(p.x, p.y);
    await page.waitForTimeout(60);
    if ((await page.locator('.retrato').count()) > 0) retratos++;
    await page.mouse.click(640, 150);
    await page.waitForTimeout(60);
  }
  expect(retratos).toBeGreaterThan(12);
  expect(await page.evaluate(() => (window as unknown as { __perdido: number }).__perdido)).toBe(0);
});
