import { expect, type Page, test } from '@playwright/test';

interface Sonda {
  naTela: (id: number) => { x: number; y: number } | null;
  tipo: (id: number) => string | null;
  nacao: (id: number) => string | null;
  jazidasNaTela: () => Array<{ id: number; recurso: string; x: number; y: number }>;
  barras: () => number;
  selecao: number[];
}

const sonda = <T>(page: Page, f: (s: Sonda, arg: unknown) => T, arg: unknown = 0) =>
  page.evaluate(
    ([fonte, a]) => {
      const s = (window as unknown as { __forgeborn: Sonda }).__forgeborn;
      return new Function('s', 'a', `return (${fonte})(s, a);`)(s, a) as T;
    },
    [f.toString(), arg] as const,
  );

async function idDe(page: Page, tipo: string): Promise<number> {
  const id = await sonda(
    page,
    (s, a) => {
      for (let n = 1; n < 400; n++) {
        if (s.tipo(n) === a && s.nacao(n) === 'bra' && s.naTela(n)) return n;
      }
      return null;
    },
    tipo,
  );
  if (id === null) throw new Error(`${tipo} do jogador fora da tela`);
  return id;
}

test.beforeEach(async ({ page }) => {
  await page.goto('/?e2e');
  await page.locator('#viewport canvas').waitFor();
  await page.mouse.move(640, 360);
  await page.waitForTimeout(800);
});

test('UI-01: a barra superior mostra sempre os 6 recursos, energia, corpos e relógio', async ({
  page,
}) => {
  const barra = page.getByTestId('barra-superior');
  await expect(barra).toBeVisible();
  for (const r of ['fe', 'si', 'cu', 'li', 'ti', 'u']) {
    await expect(page.getByTestId(`recurso-${r}`)).toBeVisible();
  }
  await expect(page.getByTestId('energia')).toHaveAttribute(
    'data-indicador',
    /verde|amarelo|vermelho/,
  );
  await expect(page.getByTestId('corpos')).toContainText('/100');
  await expect(page.getByTestId('relogio')).toHaveText(/^\d+:\d\d$/);
});

test('UI-03/UI-07: selecionar uma unidade mostra o painel com HP, EN e estado; as barras aparecem', async ({
  page,
}) => {
  const antes = await sonda(page, (s) => s.barras());
  const id = await idDe(page, 'hover_ex1');
  const p = await sonda(page, (s, a) => s.naTela(a as number), id);
  await page.mouse.click(p!.x, p!.y);
  await expect(page.getByTestId('selecao-nome')).toHaveText('Hover de Defesa EX1');
  await expect(page.getByTestId('selecao-hp')).toContainText('HP');
  await expect(page.getByTestId('selecao-en')).toContainText('EN');
  await expect(page.getByTestId('selecao-estado')).toContainText('Estado');
  await expect(page.getByTestId('selecao-arma')).toContainText('alcance');
  await expect.poll(() => sonda(page, (s) => s.barras())).toBeGreaterThan(antes);
  // Tab: barras em todos.
  await page.keyboard.press('Tab');
  await expect.poll(() => sonda(page, (s) => s.barras())).toBeGreaterThan(antes + 5);
});

test('UI-13: o mouse sobre uma jazida mostra o recurso; o clique a seleciona', async ({ page }) => {
  const [jazida] = await sonda(page, (s) => s.jazidasNaTela());
  expect(jazida).toBeDefined();
  await page.mouse.move(jazida!.x, jazida!.y);
  await expect(page.getByTestId('tooltip')).toContainText(' u');
  await page.mouse.click(jazida!.x, jazida!.y);
  await expect(page.getByTestId('selecao-jazida')).toContainText('Jazida de');
  await expect(page.getByTestId('selecao-jazida')).toContainText('Restante');
});
