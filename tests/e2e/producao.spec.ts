import { expect, type Page, test } from '@playwright/test';

interface Sonda {
  naTela: (id: number) => { x: number; y: number } | null;
  tipo: (id: number) => string | null;
  nacao: (id: number) => string | null;
  fila: (id: number) => Array<{ item: string; obra: number | null }> | null;
  obra: (id: number) => { instalada: boolean; progresso: number } | null;
  localValido: (tipo: string, x: number, y: number) => boolean;
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

async function clicar(page: Page, id: number) {
  const p = await sonda(page, (s, a) => s.naTela(a as number), id);
  if (!p) throw new Error(`corpo ${id} fora da tela`);
  await page.mouse.click(p.x, p.y);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/?e2e');
  await page.locator('#viewport canvas').waitFor();
  await page.mouse.move(640, 360);
  await page.waitForTimeout(800);
});

test('PRD-01/§12.4: com a Nave selecionada, E enfileira um Hover de Exploração e o painel mostra a fila', async ({
  page,
}) => {
  const nave = await idDe(page, 'ship');
  await clicar(page, nave);
  await expect(page.getByTestId('painel-producao')).toBeVisible();
  await page.keyboard.press('KeyE');
  await expect
    .poll(() => sonda(page, (s, a) => s.fila(a as number)?.map((i) => i.item), nave))
    .toEqual(['hover_explorer']);
  await expect(page.getByTestId('fila')).toContainText('Hover de Exploração');
});

test('UI-08/PRD-10: Impressora, B e A posicionam um Armazém com holograma; o canteiro entra na fila', async ({
  page,
}) => {
  const impressora = await idDe(page, 'printer');
  await clicar(page, impressora);
  await page.keyboard.press('KeyB');
  await expect(page.getByTestId('opcoes')).toContainText('Armazém');
  await page.keyboard.press('KeyA');
  await expect(page.getByTestId('posicionando')).toBeVisible();

  // Um ponto válido na tela para o Armazém.
  const alvo = await sonda(page, (s) => {
    for (let y = 200; y < 620; y += 20) {
      for (let x = 200; x < 1080; x += 20) {
        if (s.localValido('storage', x, y)) return { x, y };
      }
    }
    return null;
  });
  expect(alvo).not.toBeNull();
  await page.mouse.move(alvo!.x, alvo!.y);
  await page.waitForTimeout(150);
  await expect(page.getByTestId('motivo')).toHaveCount(0);
  await page.mouse.click(alvo!.x, alvo!.y);
  await expect(page.getByTestId('posicionando')).toHaveCount(0);
  await expect
    .poll(() => sonda(page, (s, a) => s.fila(a as number)?.map((i) => i.item), impressora))
    .toEqual(['storage']);
  const obra = await sonda(page, (s, a) => s.fila(a as number)![0]!.obra, impressora);
  expect(await sonda(page, (s, a) => s.obra(a as number), obra)).not.toBeNull();
});

test('UI-08: local inválido mostra o motivo em vermelho', async ({ page }) => {
  const impressora = await idDe(page, 'printer');
  await clicar(page, impressora);
  await page.keyboard.press('KeyB');
  await page.keyboard.press('KeyA');
  // Sobre a própria Nave: espaço ocupado.
  const nave = await idDe(page, 'ship');
  const p = await sonda(page, (s, a) => s.naTela(a as number), nave);
  await page.mouse.move(p!.x, p!.y);
  await expect(page.getByTestId('motivo')).toHaveText('Espaço ocupado');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('posicionando')).toHaveCount(0);
});
