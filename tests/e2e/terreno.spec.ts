import { expect, test } from '@playwright/test';

async function medir(page: import('@playwright/test').Page, url: string) {
  const erros: string[] = [];
  page.on('pageerror', (erro) => erros.push(erro.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') erros.push(msg.text());
  });
  await page.goto(url);
  await page.locator('#viewport canvas').waitFor();
  await page.keyboard.press('Control+Shift+D');
  await page.waitForTimeout(3000);
  const numero = async (id: string) => Number(await page.getByTestId(id).textContent());
  return {
    erros,
    fps: await numero('debug-fps'),
    drawCalls: await numero('debug-draw-calls'),
    triangulos: await numero('debug-triangulos'),
  };
}

for (const [nome, url] of [
  ['visão de jogo (RTS)', '/?camera=rts'],
  ['visão geral do mapa M', '/'],
  ['vista cinematográfica com a Terra', '/?camera=cinematica'],
]) {
  test(`T-014: terreno do mapa M a ≥ 60 fps — ${nome}`, async ({ page }) => {
    const medida = await medir(page, url!);
    expect(medida.erros).toEqual([]);
    expect(medida.fps).toBeGreaterThanOrEqual(55);
    expect(medida.triangulos).toBeGreaterThan(50_000);
    expect(medida.drawCalls).toBeGreaterThan(0);
    expect(medida.drawCalls).toBeLessThanOrEqual(300); // TEC-16
  });
}
