import { expect, type Page, test } from '@playwright/test';

type Vec3 = [number, number, number];
interface Sonda {
  camera?: { foco: Vec3 };
  naTela: (id: number) => { x: number; y: number } | null;
  posicao: (id: number) => Vec3 | null;
  tipo: (id: number) => string | null;
  nacao: (id: number) => string | null;
  ordem: (id: number) => string | null;
  noMinimapa: (d: Vec3) => { x: number; y: number } | null;
}

const sonda = <T>(page: Page, f: (s: Sonda, arg: unknown) => T, arg: unknown = 0) =>
  page.evaluate(
    ([fonte, a]) => {
      const s = (window as unknown as { __forgeborn: Sonda }).__forgeborn;
      return new Function('s', 'a', `return (${fonte})(s, a);`)(s, a) as T;
    },
    [f.toString(), arg] as const,
  );

const angulo = (a: Vec3, b: Vec3) => {
  const n = (v: Vec3) => Math.hypot(...v);
  const c = (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (n(a) * n(b));
  return Math.acos(Math.min(1, Math.max(-1, c)));
};

test.describe('T-074: minimapa', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?e2e');
    await page.locator('#viewport canvas').waitFor();
    await page.mouse.move(640, 360);
    await page.waitForTimeout(800);
  });

  test('UI-05/CTL-03: no canto inferior esquerdo; clique move a câmera para o ponto', async ({
    page,
  }) => {
    const caixa = (await page.getByTestId('minimapa').boundingBox())!;
    const tela = page.viewportSize()!;
    expect(caixa.x).toBeLessThan(tela.width / 4);
    expect(caixa.y + caixa.height).toBeGreaterThan(tela.height * 0.75);

    const antes = (await sonda(page, (s) => s.camera!.foco))!;
    const cx = caixa.x + caixa.width / 2;
    const cy = caixa.y + caixa.height / 2;
    await page.mouse.click(cx + caixa.width * 0.3, cy - caixa.height * 0.2);
    await page.waitForTimeout(200);
    const depois = (await sonda(page, (s) => s.camera!.foco))!;
    // O disco é o hemisfério: 0,36 do raio fica a ~0,37 rad do centro.
    expect(angulo(antes, depois)).toBeGreaterThan(0.3);
    // O ponto clicado virou o centro do globo.
    const centro = (await sonda(page, (s, d) => s.noMinimapa(d as Vec3), depois))!;
    expect(Math.abs(centro.x - cx)).toBeLessThan(2);
    expect(Math.abs(centro.y - cy)).toBeLessThan(2);
  });

  test('CTL-03: clique direito no minimapa dá ordem de movimento', async ({ page }) => {
    const ex1 = await sonda(page, (s) => {
      for (let id = 1; id < 200; id++)
        if (s.tipo(id) === 'hover_ex1' && s.nacao(id) === 'bra') return id;
      return 0;
    });
    const p = (await sonda(page, (s, id) => s.naTela(id as number), ex1))!;
    await page.mouse.click(p.x, p.y);
    const caixa = (await page.getByTestId('minimapa').boundingBox())!;
    await page.mouse.click(caixa.x + caixa.width * 0.5, caixa.y + caixa.height * 0.3, {
      button: 'right',
    });
    await page.waitForTimeout(300);
    expect(await sonda(page, (s, id) => s.ordem(id as number), ex1)).toBe('mover');
  });
});
