import { describe, expect, it } from 'vitest';
import ptBR from '../../src/i18n/pt-BR.json';
import { dados } from '../../src/sim';
import { hashNumeros } from '../../src/sim/core/hash';
import { celulaDe, type GradesDoMapa } from '../../src/sim/map/grids';
import type { DistribuicaoDeJazidas } from '../../src/sim/map/jazidas';
import { GERADOR_LUA } from '../../src/sim/map/lunar';
import { PRESETS_DE_MAPA } from '../../src/sim/map/presets';
import { gerarMapaValido, validarMapa } from '../../src/sim/map/validacao';

const PRONTO = gerarMapaValido(24, 'm', 4, 'lua');
const { mapa, grades, jazidas } = PRONTO;
const TOPO = GERADOR_LUA.raioPlato + GERADOR_LUA.folgaTopo;

/** Cópia das grades com as células escolhidas bloqueadas. */
function bloquear(origem: GradesDoMapa, bloqueia: (x: number, z: number) => boolean): GradesDoMapa {
  const nav = origem.navegacao;
  const passavel = nav.passavel.slice();
  for (let cj = 0; cj < nav.linhas; cj++) {
    for (let ci = 0; ci < nav.colunas; ci++) {
      const x = -nav.meio_m + (ci + 0.5) * nav.celula_m;
      const z = -nav.meio_m + (cj + 0.5) * nav.celula_m;
      if (bloqueia(x, z)) passavel[cj * nav.colunas + ci] = 0;
    }
  }
  return { ...origem, navegacao: { ...nav, passavel } };
}

/** Distribuição com a primeira jazida movida para (x, z). */
function moverPrimeira(x: number, z: number): DistribuicaoDeJazidas {
  const [primeira, ...resto] = jazidas.jazidas;
  return { ...jazidas, jazidas: [{ ...primeira!, x, z }, ...resto] };
}

const motivos = (g: GradesDoMapa, d: DistribuicaoDeJazidas) =>
  validarMapa(mapa, g, d).map((p) => p.motivo);

describe('CEN-11: validação do mapa', () => {
  it('o preset de mapa M é válido', () => {
    expect(validarMapa(mapa, grades, jazidas)).toEqual([]);
  });

  it('acusa jazida a menos de 6 m de um paredão', () => {
    const zona = mapa.zonasDePouso[0]!;
    const fora = Math.atan2(zona.z, zona.x);
    const d = moverPrimeira(
      zona.x + Math.cos(fora) * (TOPO + 3),
      zona.z + Math.sin(fora) * (TOPO + 3),
    );
    expect(motivos(grades, d)).toContain('jazida_perto_de_paredao');
  });

  it('acusa jazida inalcançável por solo (dentro de cratera sem brecha)', () => {
    const cratera = mapa.crateras.find((c) => c.brechas.length === 0)!;
    expect(motivos(grades, moverPrimeira(cratera.x, cratera.z))).toContain('jazida_inalcancavel');
  });

  it('acusa zona de pouso sem caminho de solo até as outras', () => {
    const zona = mapa.zonasDePouso[1]!;
    const isolada = bloquear(grades, (x, z) => {
      const d = Math.hypot(x - zona.x, z - zona.z);
      return d > 90 && d < 96;
    });
    expect(motivos(isolada, jazidas)).toContain('zonas_desconectadas');
  });

  it('acusa zonas vizinhas com uma rota só', () => {
    const zona = mapa.zonasDePouso[0]!;
    expect(zona.rampas.length).toBeGreaterThanOrEqual(2);
    // Deixa só a primeira rampa da zona 0 aberta.
    const umaRampa = bloquear(grades, (x, z) =>
      zona.rampas.slice(1).some((angulo) => {
        const aoLongo = (x - zona.x) * Math.cos(angulo) + (z - zona.z) * Math.sin(angulo);
        const lateral = Math.abs((x - zona.x) * Math.sin(angulo) - (z - zona.z) * Math.cos(angulo));
        return aoLongo > TOPO && aoLongo < TOPO + GERADOR_LUA.comprimentoRampa && lateral < 14;
      }),
    );
    expect(motivos(umaRampa, jazidas)).toContain('rotas_insuficientes');
  });

  it('seed inválida é recusada com o motivo e o gerador passa para a próxima', () => {
    const recuo = gerarMapaValido(52, 'm', 2, 'lua');
    expect(recuo.seed).toBe(53);
    expect(recuo.rejeitadas).toEqual([
      {
        seed: 52,
        problemas: [
          { motivo: 'distribuicao_impossivel', detalhe: expect.stringContaining('contestada') },
        ],
      },
    ]);
    expect(validarMapa(recuo.mapa, recuo.grades, recuo.jazidas)).toEqual([]);
  });
});

describe('CEN-12 / §14.4: presets da Lua', () => {
  const HASHES: Record<string, string> = {
    mare_imbrium: '5b77ae3895388fdd',
    mare_tranquillitatis: 'd51fb669caa11ca8',
    oceanus_procellarum: '014f33d4454dc094',
  };

  it('3 presets com os tamanhos e jogadores do §14.4', () => {
    expect(PRESETS_DE_MAPA.map((p) => [p.id, p.tamanho, p.jogadores])).toEqual([
      ['mare_imbrium', 'p', [2, 2]],
      ['mare_tranquillitatis', 'm', [2, 4]],
      ['oceanus_procellarum', 'g', [3, 4]],
    ]);
    for (const preset of PRESETS_DE_MAPA) {
      const tamanho = dados.tamanhos_mapa.find((t) => t.id === preset.tamanho)!;
      expect(preset.jogadores[0]).toBeGreaterThanOrEqual(tamanho.min_jogadores);
      expect(preset.jogadores[1]).toBeLessThanOrEqual(tamanho.max_jogadores);
      expect(preset.zonas).toBeGreaterThanOrEqual(preset.jogadores[1]);
    }
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

  it('a célula da zona de pouso está no mapa', () => {
    const zona = mapa.zonasDePouso[0]!;
    expect(celulaDe(grades.navegacao, zona.x, zona.z)).not.toBeNull();
  });
});
