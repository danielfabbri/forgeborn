import { expect, type Page, test } from '@playwright/test';

interface Sonda {
  naTela: (id: number) => { x: number; y: number } | null;
  tipo: (id: number) => string | null;
  nacao: (id: number) => string | null;
  ordem: (id: number) => string | null;
  chaoNaTela: (x: number, y: number) => boolean;
  criarNaTela: (tipo: string, nacao: string, x: number, y: number) => boolean;
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

test('CMB-13/§12.4/D-70: começa Defensiva; X alterna a postura e o painel mostra', async ({
  page,
}) => {
  const ex1 = await idDe(page, 'hover_ex1');
  await clicar(page, ex1);
  await expect(page.getByTestId('selecao-postura')).toHaveText('Postura: Defensiva');
  await page.keyboard.press('KeyX');
  await expect(page.getByTestId('selecao-postura')).not.toHaveText('Postura: Defensiva');
});

test('CMB-14/§12.4: A + clique no terreno dá ataque-movimento', async ({ page }) => {
  const ex1 = await idDe(page, 'hover_ex1');
  await clicar(page, ex1);
  const alvo = await sonda(page, (s) => {
    for (let y = 250; y < 600; y += 25) {
      for (let x = 300; x < 1000; x += 25) if (s.chaoNaTela(x, y)) return { x, y };
    }
    return null;
  });
  await page.keyboard.press('KeyA');
  await page.mouse.click(alvo!.x, alvo!.y);
  await expect.poll(() => sonda(page, (s, a) => s.ordem(a as number), ex1)).toBe('atacar_mover');
});

test('CMB-15/CMB-27: com o EX1 Passivo, o clique direito num inimigo manda atacar e o abate', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const erros: string[] = [];
  page.on('pageerror', (e) => erros.push(e.message));
  const ex1 = await idDe(page, 'hover_ex1');
  const p = await sonda(page, (s, a) => s.naTela(a as number), ex1);
  // Uma Impressora inimiga ao lado do EX1 (o Hover de Exploração fugiria para a base, ECO-13, que
  // na Lua de 400 m fica longe demais para o EX1 alcançar).
  const criado = await sonda(
    page,
    (s, a) => {
      const q = a as { x: number; y: number };
      return s.criarNaTela('printer', 'usa', q.x + 150, q.y);
    },
    p,
  );
  expect(criado).toBe(true);
  await page.waitForTimeout(300);
  const inimigo = await sonda(page, (s) => {
    for (let n = 400; n > 0; n--) if (s.nacao(n) === 'usa' && s.naTela(n)) return n;
    return null;
  });
  expect(inimigo).not.toBeNull();
  await clicar(page, ex1);
  // D-70: Defensiva → Manter posição → Passiva: sem a ordem, ele não atira.
  for (let k = 0; k < 2; k++) await page.keyboard.press('KeyX');
  await expect(page.getByTestId('selecao-postura')).toHaveText('Postura: Passiva');
  await page.waitForTimeout(500);
  expect(await sonda(page, (s, a) => s.tipo(a as number), inimigo)).toBe('printer');
  const q = await sonda(page, (s, a) => s.naTela(a as number), inimigo);
  await page.mouse.click(q!.x, q!.y, { button: 'right' });
  await expect.poll(() => sonda(page, (s, a) => s.ordem(a as number), ex1)).toBe('atacar');
  await expect
    .poll(() => sonda(page, (s, a) => s.tipo(a as number), inimigo), { timeout: 60_000 })
    .toBeNull();
  expect(erros).toEqual([]);
});
