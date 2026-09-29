import { expect, type Page, test } from '@playwright/test';

interface Sonda {
  naTela: (id: number) => { x: number; y: number } | null;
  tipo: (id: number) => string | null;
  nacao: (id: number) => string | null;
  coleta: (id: number) => { estado: string; jazida: number | null } | null;
  silo: (id: number) => string | null;
  jazidasNaTela: () => Array<{ id: number; recurso: string; x: number; y: number }>;
  selecao: number[];
}

const sonda = <T>(page: Page, f: (s: Sonda, arg: number) => T, arg = 0) =>
  page.evaluate(
    ([fonte, a]) => {
      const s = (window as unknown as { __forgeborn: Sonda }).__forgeborn;
      return new Function('s', 'a', `return (${fonte})(s, a);`)(s, a) as T;
    },
    [f.toString(), arg] as const,
  );

async function idsDe(page: Page, tipo: string): Promise<number[]> {
  return sonda(
    page,
    (s, a) => {
      const lista = [];
      for (let id = 1; id < 400; id++) {
        if (
          s.tipo(id) === (['hover_explorer', 'mobile_silo'] as const)[a] &&
          s.nacao(id) === 'bra'
        ) {
          lista.push(id);
        }
      }
      return lista;
    },
    tipo === 'hover_explorer' ? 0 : 1,
  );
}

async function clicar(page: Page, id: number) {
  const p = await sonda(page, (s, a) => s.naTela(a), id);
  if (!p) throw new Error(`corpo ${id} fora da tela`);
  await page.mouse.click(p.x, p.y);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/?e2e');
  await page.locator('#viewport canvas').waitFor();
  await page.mouse.move(640, 360);
  await page.waitForTimeout(800);
});

test('T-031/CTL-07: com um hover de exploração selecionado, o clique direito numa jazida manda coletar', async ({
  page,
}) => {
  const [hover] = await idsDe(page, 'hover_explorer');
  await clicar(page, hover!);
  expect(await sonda(page, (s) => [...s.selecao])).toEqual([hover]);
  const atual = (await sonda(page, (s, a) => s.coleta(a), hover!))?.jazida ?? null;
  const alvo = (await sonda(page, (s) => s.jazidasNaTela())).find((j) => j.id !== atual)!;
  await page.mouse.click(alvo.x, alvo.y, { button: 'right' });
  await page.waitForTimeout(300);
  const coleta = await sonda(page, (s, a) => s.coleta(a), hover!);
  expect(coleta!.jazida).toBe(alvo.id);
  expect(['indo_jazida', 'minerando', 'esperando', 'indo_entregar']).toContain(coleta!.estado);
});

test('T-032: o estoque do jogador cresce com a coleta automática (ECO-14, ECO-19)', async ({
  page,
}) => {
  // Espera fixa de 25 s de coleta: o limite padrão de 30 s não cobre o carregamento sob carga.
  test.setTimeout(60_000);
  await page.keyboard.press('Control+Shift+D');
  const total = async () => {
    const texto = (await page.getByTestId('debug-estoque').textContent()) ?? '';
    return [...texto.matchAll(/(\d+)/g)].reduce((s, m) => s + Number(m[1]), 0);
  };
  // A cena de demonstração começa com o estoque do modo alto (REG-05).
  await page.waitForTimeout(500);
  const inicial = await total();
  await page.waitForTimeout(25_000);
  expect(await total()).toBeGreaterThan(inicial);
});

test('T-037: o Silo Móvel não ancora (T não muda o estado)', async ({ page }) => {
  const [silo] = await idsDe(page, 'mobile_silo');
  await clicar(page, silo!);
  await page.keyboard.press('KeyT');
  await page.waitForTimeout(200);
  expect(await sonda(page, (s, a) => s.silo(a), silo!)).not.toMatch(/ancor/);
});
