import { expect, type Page, test } from '@playwright/test';

interface Sonda {
  selecao: number[];
  naTela: (id: number) => { x: number; y: number } | null;
  posicao: (id: number) => [number, number, number] | null;
  tipo: (id: number) => string | null;
  ordem: (id: number) => string | null;
  nacao: (id: number) => string | null;
  encontro: (id: number) => [number, number, number] | null;
  chaoNaTela: (x: number, y: number) => boolean;
}

const sonda = <T>(page: Page, f: (s: Sonda, arg: number) => T, arg = 0) =>
  page.evaluate(
    ([fonte, a]) => {
      const s = (window as unknown as { __forgeborn: Sonda }).__forgeborn;
      return new Function('s', 'a', `return (${fonte})(s, a);`)(s, a) as T;
    },
    [f.toString(), arg] as const,
  );

const selecao = (page: Page) => sonda(page, (s) => [...s.selecao]);
const naTela = (page: Page, id: number) => sonda(page, (s, a) => s.naTela(a), id);
const posicao = (page: Page, id: number) => sonda(page, (s, a) => s.posicao(a), id);
const ordem = (page: Page, id: number) => sonda(page, (s, a) => s.ordem(a), id);

/** IDs dos corpos por tipo e nação (a cena de demonstração cria cada tipo uma vez por nação). */
async function corpos(
  page: Page,
): Promise<Array<{ id: number; tipo: string; nacao: string | null }>> {
  return sonda(page, (s) => {
    const lista = [];
    for (let id = 1; id < 200; id++) {
      const tipo = s.tipo(id);
      if (tipo) lista.push({ id, tipo, nacao: s.nacao(id) });
    }
    return lista;
  });
}

async function idDe(page: Page, tipo: string, nacao = 'bra'): Promise<number> {
  const c = (await corpos(page)).find((c) => c.tipo === tipo && c.nacao === nacao);
  if (!c) throw new Error(`sem ${tipo} de ${nacao}`);
  return c.id;
}

type Vec3 = [number, number, number];
const distancia3 = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const unit = (a: Vec3): Vec3 => {
  const n = Math.hypot(...a);
  return [a[0] / n, a[1] / n, a[2] / n];
};

/** Um ponto de chão (o raio toca o planeta) longe (≥ 80 px) de todos os corpos. */
async function vazio(page: Page): Promise<{ x: number; y: number }> {
  const telas = await sonda(page, (s) => {
    const lista = [];
    for (let id = 1; id < 200; id++) {
      const p = s.naTela(id);
      if (p) lista.push(p);
    }
    return lista;
  });
  for (let y = 640; y >= 300; y -= 40) {
    for (let x = 160; x <= 1120; x += 40) {
      if (!telas.every((p) => Math.hypot(p.x - x, p.y - y) >= 80)) continue;
      // O ponto não pode estar sob a interface (minimapa, painéis).
      const livre = await page.evaluate(
        ([px, py]) =>
          document.elementFromPoint(px!, py!)?.tagName === 'CANVAS' &&
          document.elementFromPoint(px!, py!)?.closest('#viewport') !== null,
        [x, y],
      );
      if (!livre) continue;
      if (
        await sonda(page, (s, a) => s.chaoNaTela(a % 10000, Math.floor(a / 10000)), y * 10000 + x)
      ) {
        return { x, y };
      }
    }
  }
  throw new Error('nenhum ponto vazio na tela');
}

/** Clica no corpo; `page.mouse.click` não aplica modificadores, então a tecla é segurada. */
async function clicar(page: Page, id: number, modificador?: 'Shift' | 'Control') {
  const p = await naTela(page, id);
  if (!p) throw new Error(`corpo ${id} fora da tela`);
  if (modificador) await page.keyboard.down(modificador);
  await page.mouse.click(p.x, p.y);
  if (modificador) await page.keyboard.up(modificador);
}

test.describe('T-021/T-025: seleção e ordens', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?e2e');
    await page.locator('#viewport canvas').waitFor();
    // o mouse fica no meio da tela para não disparar a rolagem pelas bordas
    await page.mouse.move(640, 360);
    await page.waitForTimeout(800);
  });

  test('CTL-04: clique, Shift+clique, clique no vazio e Ctrl+clique', async ({ page }) => {
    const ex1 = await idDe(page, 'hover_ex1');
    const opq = await idDe(page, 'hover_opq');
    await clicar(page, ex1);
    expect(await selecao(page)).toEqual([ex1]);
    await clicar(page, opq, 'Shift');
    expect(await selecao(page)).toEqual([ex1, opq].sort((a, b) => a - b));
    await clicar(page, ex1, 'Shift');
    expect(await selecao(page)).toEqual([opq]);
    const livre = await vazio(page);
    await page.mouse.click(livre.x, livre.y);
    expect(await selecao(page)).toEqual([]);
    await clicar(page, ex1, 'Control');
    expect(await selecao(page)).toEqual([ex1]);
  });

  test('CTL-04: caixa pega só as unidades móveis próprias', async ({ page }) => {
    // longe das bordas, que fazem a câmera rolar
    await page.mouse.move(150, 120);
    await page.mouse.down();
    await page.mouse.move(1130, 640, { steps: 8 });
    await page.mouse.up();
    const ids = await selecao(page);
    const todos = await corpos(page);
    expect(ids.length).toBeGreaterThan(3);
    for (const id of ids) {
      const c = todos.find((t) => t.id === id)!;
      expect(c.nacao).toBe('bra');
      expect(['ship', 'storage', 'laser_tower', 'solar_plant', 'nuclear_plant']).not.toContain(
        c.tipo,
      );
    }
  });

  test('CTL-05: Ctrl+1 define o grupo e 1 o seleciona', async ({ page }) => {
    const ex1 = await idDe(page, 'hover_ex1');
    await clicar(page, ex1);
    await page.keyboard.press('Control+Digit1');
    const livre = await vazio(page);
    await page.mouse.click(livre.x, livre.y);
    expect(await selecao(page)).toEqual([]);
    await page.keyboard.press('Digit1');
    expect(await selecao(page)).toEqual([ex1]);
  });

  test('CTL-04: duplo clique pega todos do mesmo tipo visíveis na tela', async ({ page }) => {
    const scouts = (await corpos(page))
      .filter((c) => c.tipo === 'hover_scout' && c.nacao === 'bra')
      .map((c) => c.id);
    expect(scouts.length).toBe(2);
    const p = (await naTela(page, scouts[1]!))!;
    await page.mouse.dblclick(p.x, p.y);
    expect(await selecao(page)).toEqual(scouts);
  });

  test('CTL-05: toque duplo no grupo centraliza a câmera; referência a 60 m', async ({ page }) => {
    const ex1 = await idDe(page, 'hover_ex1');
    await clicar(page, ex1);
    await page.keyboard.press('Control+Digit2');
    // leva a câmera para longe
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(1200);
    await page.keyboard.up('ArrowRight');
    const camera = () =>
      page.evaluate(
        () =>
          (window as unknown as { __forgeborn: { camera: { foco: Vec3; altura: number } } })
            .__forgeborn.camera,
      );
    // distância (m) pelo arco entre o foco da câmera e a unidade (planeta M, raio 144 m)
    const afastamento = async () => {
      const foco = (await camera()).foco;
      const u = unit((await posicao(page, ex1))!);
      return 144 * Math.acos(Math.min(1, foco[0] * u[0] + foco[1] * u[1] + foco[2] * u[2]));
    };
    expect(await afastamento()).toBeGreaterThan(20);
    await page.keyboard.press('Digit2');
    await page.keyboard.press('Digit2');
    await page.waitForTimeout(100);
    expect(await afastamento()).toBeLessThan(1);

    // ART-03: as silhuetas são avaliadas com a câmera a 60 m de altura (aprovação visual)
    for (let k = 0; k < 20 && Math.abs((await camera()).altura - 60) > 8; k++) {
      await page.mouse.wheel(0, (await camera()).altura > 60 ? -100 : 100);
      // o zoom é suavizado: espera assentar antes do próximo passo
      await page.waitForTimeout(300);
    }
    await page.waitForTimeout(600);
    expect(Math.abs((await camera()).altura - 60)).toBeLessThanOrEqual(8);
    await page.screenshot({ path: 'docs/referencia/t020-60m.png' });
  });

  test('PRD-08/CTL-07: com a Nave selecionada, o clique direito define o ponto de encontro', async ({
    page,
  }) => {
    const nave = await idDe(page, 'ship');
    await clicar(page, nave);
    expect(await selecao(page)).toEqual([nave]);
    const livre = await vazio(page);
    await page.mouse.click(livre.x, livre.y, { button: 'right' });
    await page.waitForTimeout(200);
    const ponto = await sonda(page, (s, a) => s.encontro(a), nave);
    expect(ponto).not.toBeNull();
    // o ponto de encontro é uma direção; longe da Nave (> 10 m no planeta de 144 m)
    const centro = unit((await posicao(page, nave))!);
    expect(144 * distancia3(unit(ponto!), centro)).toBeGreaterThan(10);
  });

  test('CTL-07: clique direito no terreno move; S para; H mantém; P patrulha', async ({ page }) => {
    const ex1 = await idDe(page, 'hover_ex1');
    await clicar(page, ex1);
    const antes = (await posicao(page, ex1))!;
    await page.mouse.click(640, 560, { button: 'right' });
    await page.waitForTimeout(1500);
    const depois = (await posicao(page, ex1))!;
    expect(distancia3(depois, antes)).toBeGreaterThan(2);
    expect(await ordem(page, ex1)).toBe('mover');

    await page.keyboard.press('KeyS');
    await page.waitForTimeout(200);
    expect(await ordem(page, ex1)).toBe('nenhuma');

    await page.keyboard.press('KeyH');
    await page.waitForTimeout(200);
    expect(await ordem(page, ex1)).toBe('manter');

    await page.keyboard.press('KeyP');
    await page.mouse.click(500, 300);
    await page.waitForTimeout(200);
    expect(await ordem(page, ex1)).toBe('patrulhar');
    // a ordem não desfez a seleção
    expect(await selecao(page)).toEqual([ex1]);
  });
});

test('T-020: 400 unidades em ≤ 300 draw calls; captura de referência', async ({ page }) => {
  await page.goto('/?e2e&estresse=400');
  await page.locator('#viewport canvas').waitFor();
  await page.mouse.move(640, 360);
  await page.keyboard.press('Control+Shift+D');
  await page.waitForTimeout(2500);
  const entidades = Number(await page.getByTestId('debug-entidades').textContent());
  const drawCalls = Number(await page.getByTestId('debug-draw-calls').textContent());
  expect(entidades).toBeGreaterThanOrEqual(400);
  expect(drawCalls).toBeLessThanOrEqual(300);
  await page.keyboard.press('Control+Shift+D');
  await page.screenshot({ path: 'docs/referencia/t020-modelos.png' });
});
