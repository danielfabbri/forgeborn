import { expect, type Page, test } from '@playwright/test';

interface Sonda {
  naTela: (id: number) => { x: number; y: number } | null;
  tipo: (id: number) => string | null;
  nacao: (id: number) => string | null;
  fila: (id: number) => Array<{ item: string }> | null;
  criarNaTela: (tipo: string, nacao: string, x: number, y: number) => boolean;
  localValido: (tipo: string, x: number, y: number) => boolean;
}

const sonda = <T>(page: Page, f: (s: Sonda, arg: unknown) => T, arg: unknown = 0) =>
  page.evaluate(
    ([fonte, a]) => {
      const s = (window as unknown as { __forgeborn: Sonda }).__forgeborn;
      return new Function('s', 'a', `return (${fonte})(s, a);`)(s, a) as T;
    },
    [f.toString(), arg] as const,
  );

/** Pontos da tela onde o Porto pode ficar (líquido perto da terra), numa grade. */
const pontosDePorto = (page: Page) =>
  sonda(page, (s) => {
    const achados: Array<{ x: number; y: number }> = [];
    for (let y = 120; y < 620; y += 10) {
      for (let x = 320; x < 1240; x += 10) {
        if (s.localValido('port', x, y)) achados.push({ x, y });
      }
    }
    return achados;
  });

const idDe = (page: Page, tipo: string) =>
  sonda(
    page,
    (s, a) => {
      for (let n = 1; n < 4000; n++) if (s.tipo(n) === a && s.nacao(n) === 'bra') return n;
      return null;
    },
    tipo,
  );

test.describe('T-183: Porto e embarcações na interface', () => {
  test('UNI-16/UNI-20: Porto no mar, menu T/A/N e o Transporte com os embarcados', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const erros: string[] = [];
    page.on('pageerror', (e) => erros.push(e.message));
    const partida = encodeURIComponent(
      JSON.stringify({
        config: {
          cenario: 'tita',
          mapa: 'ligeia_mare',
          nevoa: 'revelado',
          oponentes: [{ nacao: 'aleatoria', dificuldade: 'facil' }],
        },
        seed: 5,
      }),
    );
    await page.goto('/?sonda&partida=' + partida);
    await page.locator('#viewport canvas').waitFor({ timeout: 120_000 });
    await page.waitForTimeout(4000);
    await page.keyboard.press('Space');
    await page.waitForTimeout(1500);
    await page.mouse.move(640, 360);
    // Afasta até aparecer mar perto da terra.
    let pontos = await pontosDePorto(page);
    for (let k = 0; k < 6 && pontos.length < 2; k++) {
      await page.mouse.wheel(0, 500);
      await page.waitForTimeout(600);
      pontos = await pontosDePorto(page);
    }
    expect(pontos.length).toBeGreaterThanOrEqual(2);
    const [p1, p2] = [pontos[0]!, pontos[pontos.length - 1]!];
    expect(await sonda(page, (s, a) => s.criarNaTela('port', 'bra', a.x, a.y), p1)).toBe(true);
    await page.waitForTimeout(400);
    expect(await sonda(page, (s, a) => s.criarNaTela('boat_transport', 'bra', a.x, a.y), p2)).toBe(
      true,
    );
    await page.waitForTimeout(600);

    // TEC-27: recursos para imprimir.
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('macetes-campo')).toBeFocused();
    await page.keyboard.type('maistudo');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);

    // Porto selecionado: T imprime o Transporte (menu do Porto).
    const porto = (await idDe(page, 'port'))!;
    const noPorto = (await sonda(page, (s, a) => s.naTela(a as number), porto))!;
    await page.mouse.click(noPorto.x, noPorto.y);
    await page.keyboard.press('KeyT');
    await page.waitForTimeout(300);
    const fila = await sonda(page, (s, a) => s.fila(a as number), porto);
    expect(fila?.map((i) => i.item)).toEqual(['boat_transport']);

    // Transporte selecionado: o painel mostra os embarcados.
    const transporte = (await idDe(page, 'boat_transport'))!;
    const noBarco = (await sonda(page, (s, a) => s.naTela(a as number), transporte))!;
    await page.mouse.click(noBarco.x, noBarco.y);
    await expect(page.getByTestId('selecao-passageiros')).toContainText('0/10');
    expect(erros).toEqual([]);
  });
});
