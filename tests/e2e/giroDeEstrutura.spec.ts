import { expect, test } from '@playwright/test';

interface Sonda {
  tipo: (id: number) => string | null;
  nacao: (id: number) => string | null;
  naTela: (id: number) => { x: number; y: number } | null;
  rumo: (id: number) => [number, number, number] | null;
  localValido: (tipo: string, x: number, y: number) => boolean;
}
type Janela = { __forgeborn: Sonda };

test('T-199/D-96: apertar e arrastar gira qualquer estrutura, não só Muro e Portão', async ({
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
  // Torre de Defesa (laser_tower): estrutura comum, não é segmento (D-56 já cobre Muro/Portão).
  await page.keyboard.press('KeyT');
  const livre = await page.evaluate(() => {
    const s = (window as unknown as Janela).__forgeborn;
    for (let y = 380; y < 600; y += 20)
      for (let x = 300; x < 1000; x += 20) if (s.localValido('laser_tower', x, y)) return { x, y };
    return null;
  });
  expect(livre).not.toBeNull();
  // Aperta, arrasta (com o botão ainda apertado) e solta: a pegada tem que girar para o rumo do
  // arrasto, exatamente como o Muro/Portão (D-56), agora generalizado (D-96).
  await page.mouse.move(livre!.x, livre!.y);
  await page.mouse.down();
  await page.mouse.move(livre!.x + 40, livre!.y + 40, { steps: 5 });
  await page.mouse.move(livre!.x + 80, livre!.y + 5, { steps: 5 });
  await page.mouse.up();
  // A cena de demonstração já nasce com Torres de Defesa (sem giro, rumo null): procura alguma
  // com rumo, que só pode ser a que acabamos de girar no arrasto.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const s = (window as unknown as Janela).__forgeborn;
        for (let id = 1; id < 3000; id++)
          if (s.tipo(id) === 'laser_tower' && s.nacao(id) === 'bra' && s.rumo(id) !== null)
            return true;
        return false;
      }),
    )
    .toBe(true);
});
