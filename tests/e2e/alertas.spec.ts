import { expect, test } from '@playwright/test';

interface Sonda {
  tipo: (id: number) => string | null;
  nacao: (id: number) => string | null;
  destruir: (id: number) => void;
  posicao: (id: number) => [number, number, number] | null;
  camera?: { foco: [number, number, number] };
}

const config = {
  nacaoJogador: 'bra',
  oponentes: [{ nacao: 'usa', dificuldade: 'facil' }],
  cenario: 'lua',
  tamanho: 'm',
  mapa: 'mare_tranquillitatis',
  zonaPouso: 0,
  recursos: 'padrao',
  nevoa: 'normal',
  vitoria: 'eliminacao',
  tempoLimiteMin: 30,
  velocidade: 1,
};

test('T-084/T-080: alerta na pilha leva ao local (clique e Espaço); o botão Menu abre a pausa', async ({
  page,
}) => {
  await page.goto(`/?partida=${encodeURIComponent(JSON.stringify({ config, seed: 4 }))}&sonda`);
  await page.getByTestId('barra-superior').waitFor({ timeout: 30_000 });
  await page.mouse.move(640, 360);
  await page.waitForTimeout(1500);
  // AL-18: perdi um corpo (o hover inicial, destruído pela depuração).
  const hover = await page.evaluate(() => {
    const s = (window as unknown as { __forgeborn: Sonda }).__forgeborn;
    for (let id = 1; id < 100; id++) {
      if (s.tipo(id) === 'hover_explorer' && s.nacao(id) === 'bra') return id;
    }
    return 0;
  });
  const onde = (await page.evaluate(
    (id) => (window as unknown as { __forgeborn: Sonda }).__forgeborn.posicao(id),
    hover,
  ))!;
  const r = Math.hypot(...onde);
  const local = onde.map((v) => v / r);
  await page.evaluate(
    (id) => (window as unknown as { __forgeborn: Sonda }).__forgeborn.destruir(id),
    hover,
  );
  const alerta = page.locator('[data-testid="alerta"][data-id="AL-18"]');
  await expect(alerta).toBeVisible({ timeout: 5_000 });
  await expect(alerta).toContainText('Perdi um corpo: Hover de Exploração');

  // Afasta a câmera com as setas e volta pelo clique no alerta.
  const foco = () =>
    page.evaluate(() => (window as unknown as { __forgeborn: Sonda }).__forgeborn.camera!.foco);
  const angulo = (a: number[], b: number[]) =>
    Math.acos(Math.min(1, a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!));
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(1500);
  await page.keyboard.up('ArrowRight');
  const longe = await foco();
  expect(angulo(local, longe)).toBeGreaterThan(0.05);
  await alerta.click();
  await page.waitForTimeout(200);
  expect(angulo(local, await foco())).toBeLessThan(0.02);

  // Espaço também vai ao último alerta.
  await page.keyboard.down('ArrowLeft');
  await page.waitForTimeout(1500);
  await page.keyboard.up('ArrowLeft');
  await page.keyboard.press('Space');
  await page.waitForTimeout(200);
  expect(angulo(local, await foco())).toBeLessThan(0.02);

  // UI-01: Menu na barra superior.
  await page.getByTestId('botao-menu').click();
  await page.getByTestId('menu-de-pausa').waitFor();
});
