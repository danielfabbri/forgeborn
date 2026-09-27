import { expect, type Page, test } from '@playwright/test';

interface Sonda {
  tipo: (id: number) => string | null;
  nacao: (id: number) => string | null;
  naTela: (id: number) => { x: number; y: number } | null;
  fila: (id: number) => Array<{ item: string }> | null;
}

interface SondaDosMenus {
  tela: () => string;
  audio: () => string | null;
  corpoNaTela: (id: string) => { x: number; y: number } | null;
  zonaNaTela: (k: number) => { x: number; y: number } | null;
}

const menus = <T>(page: Page, f: (s: SondaDosMenus, a: unknown) => T, a: unknown = 0) =>
  page.evaluate(
    ([fonte, arg]) => {
      const s = (window as unknown as { __menus: SondaDosMenus }).__menus;
      return new Function('s', 'a', `return (${fonte})(s, a);`)(s, arg) as T;
    },
    [f.toString(), a] as const,
  );

/** Da Seleção de Modo até a Configuração da Partida na Lua. */
async function abrirFreeBattle(page: Page) {
  await page.goto('/?menu');
  await page.getByTestId('selecao-de-modo').waitFor();
  await page.getByTestId('modo-free-battle').click();
  await page.waitForTimeout(1200);
  const lua = await menus(page, (s) => s.corpoNaTela('lua'));
  await page.mouse.click(lua!.x, lua!.y);
  await page.getByTestId('cenario-lua').click();
  await page.getByTestId('config-partida').waitFor();
}

test.describe('M10: telas', () => {
  test('FLX-01/FLX-02/TEC-22: splash, abertura e o primeiro gesto libera o áudio', async ({
    page,
  }) => {
    const erros: string[] = [];
    page.on('pageerror', (e) => erros.push(String(e)));
    await page.goto('/');
    await page.getByTestId('abertura').waitFor({ timeout: 45_000 });
    await expect(page.getByTestId('carregamento')).toHaveCount(0);
    expect(await menus(page, (s) => s.audio())).toBeNull();
    await page.keyboard.press('Space');
    await page.getByTestId('selecao-de-modo').waitFor();
    expect(await menus(page, (s) => s.audio())).not.toBeNull();
    expect(erros).toEqual([]);
  });

  test('AUD-01/D-74/D-75: entrance nos menus até o Universo; map no Universo, com corte seco', async ({
    page,
  }) => {
    const trilha = () =>
      page.evaluate(() =>
        (window as unknown as { __audio: { trilha: () => string | null } }).__audio.trilha(),
      );
    await page.goto('/');
    await page.getByTestId('abertura').waitFor({ timeout: 45_000 });
    await page.keyboard.press('Space');
    await page.getByTestId('selecao-de-modo').waitFor();
    await expect.poll(trilha).toMatch(/entrance/);
    await page.getByTestId('modo-campanha').click();
    await page.getByTestId('campanha-slots').waitFor();
    await page.waitForTimeout(300);
    expect(await trilha()).toMatch(/entrance/);
    await page.getByTestId('slot-0-novo').click();
    await page.getByTestId('nacao-bra').click();
    await page.getByTestId('universo-painel').waitFor();
    await expect.poll(trilha).toMatch(/map/);
    // D-75: a entrance para na hora (sem os 4 s de transição, só a map soando).
    const soando = await page.evaluate(() =>
      (window as unknown as { __audio: { soando: () => number } }).__audio.soando(),
    );
    expect(soando).toBe(1);
  });

  test('AUD-04/D-75: passar o mouse sobre um botão toca um som, uma vez por entrada', async ({
    page,
  }) => {
    const passadas = () =>
      page.evaluate(
        () =>
          (window as unknown as { __sfx: { tocados: () => string[] } }).__sfx
            .tocados()
            .filter((x) => x === 'passar').length,
      );
    await page.goto('/?menu');
    await page.getByTestId('selecao-de-modo').waitFor();
    await page.mouse.click(5, 5); // libera o áudio
    await page.getByTestId('modo-campanha').hover();
    await expect.poll(passadas).toBe(1);
    // Mexer dentro do mesmo botão não repete; outro botão toca de novo.
    const caixa = (await page.getByTestId('modo-campanha').boundingBox())!;
    await page.mouse.move(caixa.x + caixa.width - 4, caixa.y + caixa.height / 2);
    expect(await passadas()).toBe(1);
    await page.getByTestId('modo-creditos').hover();
    await expect.poll(passadas).toBe(2);
  });

  test('FLX-03/CAM-09: Seleção de Modo com Campanha habilitada e Créditos', async ({ page }) => {
    await page.goto('/?menu');
    await page.getByTestId('selecao-de-modo').waitFor();
    await expect(page.getByTestId('modo-campanha')).toBeEnabled();
    await page.getByTestId('modo-creditos').click();
    await page.getByTestId('creditos').waitFor();
  });

  test('FLX-13/TEC-21: configurações valem na hora e ficam salvas', async ({ page }) => {
    await page.goto('/?menu');
    await page.getByTestId('modo-configuracoes').click();
    await page.getByTestId('configuracoes').waitFor();
    await page.getByRole('tab', { name: 'Acessibilidade' }).click();
    await page.getByTestId('escala-interface').fill('120');
    const escala = () =>
      page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--escala-ui').trim(),
      );
    expect(await escala()).toBe('1.2');
    await page.getByRole('tab', { name: 'Gráficos' }).click();
    await page.getByTestId('preset-baixo').click();
    await page.waitForTimeout(300);
    await page.reload();
    await page.getByTestId('selecao-de-modo').waitFor();
    expect(await escala()).toBe('1.2');
    await page.getByTestId('modo-configuracoes').click();
    await expect(page.getByTestId('preset-baixo')).toHaveClass(/ativa/);
  });

  test('FLX-04: Universo com a Lua e Shackleton disponíveis e os outros cenários bloqueados', async ({
    page,
  }) => {
    await page.goto('/?menu');
    await page.getByTestId('modo-free-battle').click();
    await page.waitForTimeout(1200);
    const marte = await menus(page, (s) => s.corpoNaTela('marte'));
    await page.mouse.click(marte!.x, marte!.y);
    await expect(page.getByTestId('cenario-marte')).toBeDisabled();
    await expect(page.getByTestId('cenario-marte')).toHaveAttribute('data-estado', 'bloqueado');
    // Afasta com a roda para achar a Lua de novo e clica nela.
    await page.mouse.move(640, 360);
    for (let k = 0; k < 12; k++) await page.mouse.wheel(0, 400);
    await page.waitForTimeout(1500);
    const lua = await menus(page, (s) => s.corpoNaTela('lua'));
    await page.mouse.click(lua!.x, lua!.y);
    await expect(page.getByTestId('cenario-lua')).toHaveAttribute('data-estado', 'disponivel');
    // D-73: Shackleton (mapa da campanha v1.0) também serve ao Free Battle.
    await expect(page.getByTestId('cenario-lua_shackleton')).toBeEnabled();
  });

  test('FB-03/FB-02/FB-04: tamanho inválido desabilitado, zona escolhida, última configuração lembrada', async ({
    page,
  }) => {
    await abrirFreeBattle(page);
    // 1 oponente: o Grande (3–4 jogadores) fica desabilitado com explicação.
    await expect(page.getByTestId('fb-tamanho-g')).toBeDisabled();
    await expect(page.getByTestId('fb-explicacao-tamanho')).toBeVisible();
    // 2 oponentes: o Pequeno (2 jogadores) desabilita e o Grande libera.
    await page.getByTestId('fb-oponentes-2').click();
    await expect(page.getByTestId('fb-tamanho-p')).toBeDisabled();
    await expect(page.getByTestId('fb-tamanho-g')).toBeEnabled();
    await page.getByTestId('fb-oponentes-1').click();

    await page.getByTestId('fb-zona-escolher').click();
    await expect(page.getByTestId('fb-iniciar')).toBeDisabled();
    await page.waitForTimeout(2500);
    const zona = await menus(page, (s) => s.zonaNaTela(2));
    await page.mouse.click(zona!.x, zona!.y);
    await expect(page.getByTestId('previa-legenda')).toContainText('3');
    await page.getByTestId('fb-oponente-dificuldade-0').selectOption('dificil');
    await page.getByTestId('fb.nevoa.explorado').click();

    // Inicia (salva a configuração) e volta ao menu: as opções voltam como ficaram.
    await page.getByTestId('fb-iniciar').click();
    await page.waitForURL(/partida=/);
    expect(decodeURIComponent(page.url())).toContain('"zonaPouso":2');
    await abrirFreeBattle(page);
    await expect(page.getByTestId('fb-oponente-dificuldade-0')).toHaveValue('dificil');
    await expect(page.getByTestId('fb.nevoa.explorado')).toHaveClass(/ativa/);
    await expect(page.getByTestId('previa-legenda')).toContainText('3');
  });
});

test.describe('M10: partida', () => {
  test.setTimeout(90_000);

  test('T-106 (MVP): Free Battle na Lua contra IA Fácil, HUD, render-se e tela de derrota', async ({
    page,
  }) => {
    const erros: string[] = [];
    page.on('pageerror', (e) => erros.push(String(e)));
    page.on('console', (m) => m.type() === 'error' && erros.push(m.text()));
    await abrirFreeBattle(page);
    await page.getByTestId('fb-oponente-dificuldade-0').selectOption('facil');
    await page.getByTestId('fb-iniciar').click();
    await page.waitForURL(/partida=/);

    // HUD da partida.
    await page.getByTestId('barra-superior').waitFor({ timeout: 30_000 });
    await page.mouse.move(640, 360);
    await expect(page.getByTestId('relogio')).not.toHaveText('0:00', { timeout: 10_000 });
    await expect(page.getByTestId('energia')).toBeVisible();
    await expect(page.getByTestId('minimapa')).toBeVisible();

    // FLX-11: Esc pausa a simulação e abre o menu.
    await page.keyboard.press('Escape');
    await page.getByTestId('menu-de-pausa').waitFor();
    const r1 = await page.getByTestId('relogio').textContent();
    await page.waitForTimeout(1500);
    expect(await page.getByTestId('relogio').textContent()).toBe(r1);

    // REG-13: render-se → derrota com as estatísticas (FLX-12, REG-23).
    await page.getByTestId('pausa-render-se').click();
    const fim = page.getByTestId('fim-de-partida');
    await fim.waitFor({ timeout: 10_000 });
    await expect(fim).toHaveAttribute('data-resultado', 'derrota');
    await expect(page.getByTestId('estatisticas')).toContainText('Pontuação');
    await expect(page.getByTestId('estatisticas')).toContainText('Ações por minuto');
    await expect(page.getByTestId('fim-jogar-novamente')).toBeVisible();
    expect(erros).toEqual([]);

    // FLX-12: Menu volta para a Seleção de Modo.
    await page.getByTestId('fim-menu').click();
    await page.getByTestId('selecao-de-modo').waitFor({ timeout: 20_000 });
  });

  test('FLX-09: pouso com a simulação parada; Espaço pula e o relógio começa em 0:00', async ({
    page,
  }) => {
    const config = {
      nacaoJogador: 'bra',
      oponentes: [{ nacao: 'usa', dificuldade: 'facil' }],
      cenario: 'lua',
      tamanho: 'm',
      mapa: 'mare_tranquillitatis',
      zonaPouso: 0,
      recursos: 'padrao',
      nevoa: 'normal',
      vitoria: 'eliminacao',
      tempoLimiteMin: 30,
      velocidade: 1,
    };
    await page.goto(`/?partida=${encodeURIComponent(JSON.stringify({ config, seed: 5 }))}`);
    await page.getByTestId('pouso').waitFor({ timeout: 30_000 });
    // O HUD fica escondido e o relógio parado durante a cinemática.
    await expect(page.getByTestId('barra-superior')).toBeHidden();
    await page.waitForTimeout(2000);
    await page.keyboard.press('Space');
    await expect(page.getByTestId('pouso')).toHaveCount(0);
    await expect(page.getByTestId('barra-superior')).toBeVisible();
    await expect(page.getByTestId('relogio')).toHaveText('0:00');
    // Espaço não abriu o menu de pausa.
    await expect(page.getByTestId('menu-de-pausa')).toHaveCount(0);
    await expect(page.getByTestId('relogio')).toHaveText('0:02', { timeout: 5_000 });
    // AUD-01/D-74: na partida toca uma das soundtrack_* da pasta.
    await expect
      .poll(() =>
        page.evaluate(() =>
          (window as unknown as { __audio: { trilha: () => string | null } }).__audio.trilha(),
        ),
      )
      .toMatch(/soundtrack_\d+/);
  });

  test('REG-21/REG-20: pausa tática aceita ordens; velocidade 1,5× acelera o relógio', async ({
    page,
  }) => {
    const config = {
      nacaoJogador: 'bra',
      oponentes: [{ nacao: 'usa', dificuldade: 'facil' }],
      cenario: 'lua',
      tamanho: 'm',
      mapa: 'mare_tranquillitatis',
      zonaPouso: 0,
      recursos: 'padrao',
      nevoa: 'normal',
      vitoria: 'eliminacao',
      tempoLimiteMin: 30,
      velocidade: 1.5,
    };
    await page.goto(`/?partida=${encodeURIComponent(JSON.stringify({ config, seed: 3 }))}&sonda`);
    await page.getByTestId('barra-superior').waitFor({ timeout: 30_000 });
    await page.mouse.move(640, 360);
    await expect(page.getByTestId('relogio')).toHaveText('0:02', { timeout: 10_000 });
    const t0 = Date.now();
    await expect(page.getByTestId('relogio')).toHaveText('0:08', { timeout: 10_000 });
    // 6 s de jogo a 1,5× levam ~4 s reais.
    expect(Date.now() - t0).toBeLessThan(5_500);

    await page.keyboard.press('Pause');
    await page.getByTestId('pausa-tatica').waitFor();
    const r = await page.getByTestId('relogio').textContent();
    // Com a pausa tática, a Nave ainda é selecionada e recebe a ordem de imprimir (E).
    const nave = await page.evaluate(() => {
      const s = (window as unknown as { __forgeborn: Sonda }).__forgeborn;
      for (let id = 1; id < 100; id++)
        if (s.tipo(id) === 'ship' && s.nacao(id) === 'bra') return id;
      return 0;
    });
    const p = await page.evaluate(
      (id) => (window as unknown as { __forgeborn: Sonda }).__forgeborn.naTela(id),
      nave,
    );
    await page.mouse.click(p!.x, p!.y);
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(800);
    expect(await page.getByTestId('relogio').textContent()).toBe(r);
    expect(
      await page.evaluate(() => [
        ...(window as unknown as { __forgeborn: { selecao: number[] } }).__forgeborn.selecao,
      ]),
    ).toEqual([nave]);
    // A ordem dada na pausa entra no tick seguinte, ao retomar.
    await page.keyboard.press('Pause');
    await expect(page.getByTestId('pausa-tatica')).toHaveCount(0);
    await page.waitForTimeout(500);
    const fila = await page.evaluate(
      (id) => (window as unknown as { __forgeborn: Sonda }).__forgeborn.fila(id),
      nave,
    );
    expect(fila!.map((f) => f.item)).toContain('hover_explorer');
  });
});
