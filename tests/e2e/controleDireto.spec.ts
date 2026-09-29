import { expect, type Page, test } from '@playwright/test';

interface Sonda {
  tipo: (id: number) => string | null;
  nacao: (id: number) => string | null;
  naTela: (id: number) => { x: number; y: number } | null;
  posicao: (id: number) => [number, number, number] | null;
  direto: () => { ativo: number | null; modo: string; alvo: number | null } | null;
  criarNaTela: (tipo: string, nacao: string, x: number, y: number) => boolean;
  destruir: (id: number) => void;
  selecao: number[];
}

const sonda = <T>(page: Page, f: (s: Sonda, a: unknown) => T, a: unknown = 0) =>
  page.evaluate(
    ([fonte, arg]) => {
      const s = (window as unknown as { __forgeborn: Sonda }).__forgeborn;
      return new Function('s', 'a', `return (${fonte})(s, a);`)(s, arg) as T;
    },
    [f.toString(), a] as const,
  );

async function pilotarEx1(page: Page): Promise<number> {
  await page.goto('/?e2e');
  await page.locator('#viewport canvas').waitFor();
  await page.mouse.move(640, 360);
  await page.waitForTimeout(1200);
  const ex1 = await sonda(page, (s) => {
    for (let id = 1; id < 200; id++)
      if (s.tipo(id) === 'hover_ex1' && s.nacao(id) === 'bra') return id;
    return 0;
  });
  const p = (await sonda(page, (s, id) => s.naTela(id as number), ex1))!;
  await page.mouse.click(p.x, p.y);
  await page.keyboard.press('KeyV');
  await page.getByTestId('hud-direto').waitFor();
  return ex1;
}

test.describe('M11: controle direto', () => {
  test('CTL-08/CTL-10/CTL-15: V entra em 1ª pessoa, W anda, V alterna para 3ª, Esc volta ao RTS', async ({
    page,
  }) => {
    const erros: string[] = [];
    page.on('pageerror', (e) => erros.push(String(e)));
    const ex1 = await pilotarEx1(page);
    expect(await sonda(page, (s) => s.direto())).toMatchObject({ ativo: ex1, modo: '1p' });
    await expect(page.getByTestId('hud-direto')).toHaveAttribute('data-modo', '1p');
    // CTL-14: mira, bússola e a dica de saída.
    await expect(page.getByTestId('mira')).toBeVisible();
    await expect(page.getByTestId('bussola')).toBeVisible();
    await expect(page.getByTestId('hud-direto')).toContainText('Esc');

    const antes = (await sonda(page, (s, id) => s.posicao(id as number), ex1))!;
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(1500);
    await page.keyboard.up('KeyW');
    const depois = (await sonda(page, (s, id) => s.posicao(id as number), ex1))!;
    expect(
      Math.hypot(depois[0] - antes[0], depois[1] - antes[1], depois[2] - antes[2]),
    ).toBeGreaterThan(4);

    await page.keyboard.press('KeyV');
    await expect(page.getByTestId('hud-direto')).toHaveAttribute('data-modo', '3p');

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('hud-direto')).toHaveCount(0);
    expect((await sonda(page, (s) => s.direto()))!.ativo).toBeNull();
    // O RTS volta: sem o menu de pausa.
    await expect(page.getByTestId('menu-de-pausa')).toHaveCount(0);
    expect(erros).toEqual([]);
  });

  test('CTL-08: V com mais de uma unidade selecionada não entra', async ({ page }) => {
    await page.goto('/?e2e');
    await page.locator('#viewport canvas').waitFor();
    await page.mouse.move(640, 360);
    await page.waitForTimeout(1200);
    const ids = await sonda(page, (s) => {
      const l: number[] = [];
      for (let id = 1; id < 200; id++)
        if (s.tipo(id) === 'hover_ex1' || s.tipo(id) === 'hover_opq') {
          if (s.nacao(id) === 'bra') l.push(id);
        }
      return l;
    });
    const a = (await sonda(page, (s, id) => s.naTela(id as number), ids[0]))!;
    const b = (await sonda(page, (s, id) => s.naTela(id as number), ids[1]))!;
    await page.mouse.click(a.x, a.y);
    await page.keyboard.down('Shift');
    await page.mouse.click(b.x, b.y);
    await page.keyboard.up('Shift');
    await page.keyboard.press('KeyV');
    await page.waitForTimeout(300);
    await expect(page.getByTestId('hud-direto')).toHaveCount(0);
  });

  test('CTL-13: unidade destruída mostra SINAL PERDIDO e volta ao RTS', async ({ page }) => {
    await pilotarEx1(page);
    const ex1 = (await sonda(page, (s) => s.direto()))!.ativo!;
    await sonda(page, (s, id) => s.destruir(id as number), ex1);
    await page.getByTestId('sinal-perdido').waitFor({ timeout: 5_000 });
    await expect(page.getByTestId('sinal-perdido')).toContainText('SINAL PERDIDO');
    await expect(page.getByTestId('sinal-perdido')).toHaveCount(0, { timeout: 4_000 });
    expect((await sonda(page, (s) => s.direto()))!.ativo).toBeNull();
  });
});
