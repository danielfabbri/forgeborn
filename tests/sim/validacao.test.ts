import { describe, expect, it } from 'vitest';
import ptBR from '../../src/i18n/pt-BR.json';
import { dados } from '../../src/sim';
import { hashNumeros } from '../../src/sim/core/hash';
import {
  arco,
  avancar,
  centroDaCelula,
  produtoEscalar,
  produtoVetorial,
  type Vec3,
} from '../../src/sim/map/esfera';
import type { GradesDoMapa } from '../../src/sim/map/grids';
import type { DistribuicaoDeJazidas } from '../../src/sim/map/jazidas';
import { GERADOR_LUA, rumoSemRampa } from '../../src/sim/map/lunar';
import { PRESETS_DE_MAPA } from '../../src/sim/map/presets';
import { gerarMapaValido, validarMapa } from '../../src/sim/map/validacao';

const PRONTO = gerarMapaValido(24, 'm', 4, 'lua');
const { mapa, grades, jazidas } = PRONTO;
const R = mapa.raio_m;
const TOPO = GERADOR_LUA.raioPlato + GERADOR_LUA.folgaTopo;
const em = (c: Vec3, rumo: Vec3, metros: number) => avancar(c, rumo, metros / R).p;

/** Cópia das grades com as células escolhidas (pelo centro) bloqueadas. */
function bloquear(origem: GradesDoMapa, bloqueia: (d: Vec3) => boolean): GradesDoMapa {
  const nav = origem.navegacao;
  const passavel = nav.passavel.slice();
  for (let c = 0; c < passavel.length; c++) {
    if (bloqueia(centroDaCelula(nav.esfera, c))) passavel[c] = 0;
  }
  return { ...origem, navegacao: { ...nav, passavel } };
}

/** Distribuição com a primeira jazida movida para d. */
function moverPrimeira(d: Vec3): DistribuicaoDeJazidas {
  const [primeira, ...resto] = jazidas.jazidas;
  return { ...jazidas, jazidas: [{ ...primeira!, d }, ...resto] };
}

const motivos = (g: GradesDoMapa, d: DistribuicaoDeJazidas) =>
  validarMapa(mapa, g, d).map((p) => p.motivo);

describe('CEN-11: validação do mapa', () => {
  it('o preset de mapa M é válido', () => {
    expect(validarMapa(mapa, grades, jazidas)).toEqual([]);
  });

  it('acusa jazida a menos de 6 m de um paredão', () => {
    const zona = mapa.zonasDePouso[0]!;
    const d = moverPrimeira(em(zona.d, rumoSemRampa(zona), TOPO + 3));
    expect(motivos(grades, d)).toContain('jazida_perto_de_paredao');
  });

  it('acusa jazida inalcançável por solo (dentro de cratera sem brecha)', () => {
    const cratera = mapa.crateras.find((c) => c.brechas.length === 0)!;
    expect(motivos(grades, moverPrimeira(cratera.d))).toContain('jazida_inalcancavel');
  });

  it('acusa zona de pouso sem caminho de solo até as outras', () => {
    const zona = mapa.zonasDePouso[1]!;
    const isolada = bloquear(grades, (d) => {
      const distancia = R * arco(d, zona.d);
      return distancia > 90 && distancia < 96;
    });
    expect(motivos(isolada, jazidas)).toContain('zonas_desconectadas');
  });

  it('acusa zonas com uma rota só', () => {
    const zona = mapa.zonasDePouso[0]!;
    expect(zona.rampas.length).toBeGreaterThanOrEqual(2);
    // Deixa só a primeira rampa da zona 0 aberta.
    const umaRampa = bloquear(grades, (d) =>
      zona.rampas.slice(1).some((u) => {
        const distancia = R * arco(d, zona.d);
        const lado = produtoVetorial(zona.d, u);
        const aoLongo = produtoEscalar(d, u) * R;
        const lateral = Math.abs(produtoEscalar(d, lado)) * R;
        return (
          aoLongo > 0 &&
          distancia > TOPO &&
          distancia < TOPO + GERADOR_LUA.comprimentoRampa &&
          lateral < 14
        );
      }),
    );
    expect(motivos(umaRampa, jazidas)).toContain('rotas_insuficientes');
  });

  it('seed inválida é recusada com o motivo e o gerador passa para a próxima', () => {
    const recusaA24 = (...args: Parameters<typeof validarMapa>) =>
      args[0].seed === 24
        ? [{ motivo: 'rotas_insuficientes' as const, detalhe: 'teste' }]
        : validarMapa(...args);
    const recuo = gerarMapaValido(24, 'm', 4, 'lua', recusaA24);
    expect(recuo.seed).toBe(25);
    expect(recuo.rejeitadas).toEqual([
      { seed: 24, problemas: [{ motivo: 'rotas_insuficientes', detalhe: 'teste' }] },
    ]);
    expect(validarMapa(recuo.mapa, recuo.grades, recuo.jazidas)).toEqual([]);
  });
});

describe('CEN-12 / §14.4: presets da Lua', () => {
  const HASHES: Record<string, string> = {
    mare_imbrium: 'a40dd65f0c8a2907',
    mare_tranquillitatis: '41f84be3e7295a9f',
    oceanus_procellarum: '3a4d67d1b452b18f',
    campo_de_testes: '52357d940524e982',
    cratera_shackleton: 'c4f73f60503c4207',
    utopia_planitia: '17fb746699095f0f',
    valles_marineris: 'b2ef0cc2cc597ff5',
    hellas_planitia: '112571a86431f4d9',
  };

  it('3 presets da Lua com os tamanhos e jogadores do §14.4 (mais os da campanha, D-73)', () => {
    const lua = PRESETS_DE_MAPA.filter((p) => p.cenario === 'lua');
    expect(lua.map((p) => [p.id, p.tamanho, p.jogadores])).toEqual([
      ['mare_imbrium', 'p', [2, 2]],
      ['mare_tranquillitatis', 'm', [2, 4]],
      ['oceanus_procellarum', 'g', [3, 4]],
    ]);
    expect(PRESETS_DE_MAPA.find((p) => p.id === 'campo_de_testes')?.soCampanha).toBe(true);
    for (const preset of PRESETS_DE_MAPA) {
      const tamanho = dados.tamanhos_mapa.find((t) => t.id === preset.tamanho)!;
      expect(preset.jogadores[0]).toBeGreaterThanOrEqual(tamanho.min_jogadores);
      expect(preset.jogadores[1]).toBeLessThanOrEqual(tamanho.max_jogadores);
      expect(preset.zonas).toBeGreaterThanOrEqual(preset.jogadores[1]);
    }
  });

  it('§14.6/D-77: 3 presets de Marte com os tamanhos e jogadores do SPEC', () => {
    const marte = PRESETS_DE_MAPA.filter((p) => p.cenario === 'marte');
    expect(marte.map((p) => [p.id, p.tamanho, p.jogadores])).toEqual([
      ['utopia_planitia', 'p', [2, 2]],
      ['valles_marineris', 'm', [2, 4]],
      ['hellas_planitia', 'g', [3, 4]],
    ]);
  });

  it.each(PRESETS_DE_MAPA)('$id: seed válida de primeira e heightmap fixado', (preset) => {
    const pronto = gerarMapaValido(preset.seed, preset.tamanho, preset.zonas, preset.cenario);
    expect(pronto.seed).toBe(preset.seed);
    expect(pronto.rejeitadas).toEqual([]);
    expect(hashNumeros(pronto.mapa.alturas)).toBe(HASHES[preset.id]);
  });

  it('TEC-23: o nome de cada preset está no i18n', () => {
    for (const preset of PRESETS_DE_MAPA) expect(ptBR).toHaveProperty([`mapa.${preset.id}`]);
  });
});
