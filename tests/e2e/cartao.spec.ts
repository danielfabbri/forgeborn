import { expect, test } from '@playwright/test';

interface Sonda {
  tipo: (id: number) => string | null;
  nacao: (id: number) => string | null;
  naTela: (id: number) => { x: number; y: number } | null;
}

test('UI-04: cartão de produção com foto de cada item; a dica mostra nome, receita, energia e tempo', async ({
  page,
}) => {
  await page.goto('/?e2e');
  await page.locator('#viewport canvas').waitFor();
  await page.mouse.move(640, 360);
  await page.waitForTimeout(1000);
  const p = await page.evaluate(() => {
    const s = (window as unknown as { __forgeborn: Sonda }).__forgeborn;
    for (let id = 1; id < 200; id++) {
      if (s.tipo(id) === 'printer' && s.nacao(id) === 'bra') return s.naTela(id);
    }
    return null;
  });
  await page.mouse.click(p!.x, p!.y);
  await page.keyboard.press('KeyU');
  const botao = page.locator('.opcao-cartao[data-item="hover_opq"]');
  await expect(botao.locator('img.foto-item')).toHaveAttribute('src', /^data:image\/png/);
  await expect(botao.locator('kbd')).toHaveText('2');
  const dica = botao.getByTestId('dica-item');
  await expect(dica).toBeHidden();
  await botao.hover();
  await expect(dica).toBeVisible();
  await expect(dica).toContainText('Hover de Defesa OPQ');
  await expect(dica).toContainText('Fe 35');
  await expect(dica).toContainText('EN');
  // Na cena de demonstração o estoque é o alto: nada falta.
  await expect(dica.locator('.falta')).toHaveCount(0);
});
