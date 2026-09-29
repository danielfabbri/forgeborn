import { expect, type Page, test } from '@playwright/test';

interface Sonda {
  criarNaTela: (tipo: string, nacao: string, x: number, y: number) => boolean;
}

const sonda = <T>(page: Page, f: (s: Sonda, arg: unknown) => T, arg: unknown = 0) =>
  page.evaluate(
    ([fonte, a]) => {
      const s = (window as unknown as { __forgeborn: Sonda }).__forgeborn;
      return new Function('s', 'a', `return (${fonte})(s, a);`)(s, a) as T;
    },
    [f.toString(), arg] as const,
  );

test.describe('T-175: domínio do jogador e Declarar guerra', () => {
  test('REG-26/REG-29: unidade alheia na base avisa (AL-22) sem guerra; o botão declara', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.goto('/?e2e');
    await page.locator('#viewport canvas').waitFor();
    await page.mouse.move(640, 360);
    await page.waitForTimeout(800);
    const chip = page.getByTestId('temperamento-usa');
    await expect(chip).toHaveAttribute('data-estado', 'pacifico');
    // Um Hover de Observação alheio no meio da base do jogador.
    expect(await sonda(page, (s) => s.criarNaTela('hover_scout', 'usa', 640, 400))).toBe(true);
    const botao = page.getByTestId('alerta-declarar-guerra');
    await expect(botao).toBeVisible({ timeout: 5000 });
    await expect(chip).toHaveAttribute('data-estado', 'invadida');
    await botao.click();
    await expect(chip).toHaveAttribute('data-estado', 'inimigo', { timeout: 3000 });
    await expect(botao).toHaveCount(0);
  });

  test('UI-17/REG-29: o temperamento da barra também declara guerra', async ({ page }) => {
    await page.goto('/?e2e');
    await page.locator('#viewport canvas').waitFor();
    const chip = page.getByTestId('temperamento-usa');
    await chip.click();
    await page.getByTestId('declarar-guerra-usa').click();
    await expect(chip).toHaveAttribute('data-estado', 'inimigo', { timeout: 3000 });
  });
});
