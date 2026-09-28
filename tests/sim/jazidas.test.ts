import { describe, expect, it } from 'vitest';
import { dados, param } from '../../src/sim';
import { componenteConectado, noComponente, temFolga } from '../../src/sim/map/conectividade';
import { aplicarRotacao, arco, rotacoesDeSimetria } from '../../src/sim/map/esfera';
import { celulaDe, derivarGrades } from '../../src/sim/map/grids';
import { distribuirJazidas, type DistribuicaoDeJazidas } from '../../src/sim/map/jazidas';
import { gerarMapaLunar, type MapaLunar, type Simetria } from '../../src/sim/map/lunar';
import { RAIOS_DE_TESTE } from './mundo-teste';

interface Caso {
  nome: string;
  mapa: MapaLunar;
  dist: DistribuicaoDeJazidas;
}

function caso(seed: number, tamanho: 'p' | 'm' | 'g', n: Simetria): Caso {
  const mapa = gerarMapaLunar(seed, RAIOS_DE_TESTE[tamanho], n);
  return {
    nome: `${tamanho.toUpperCase()}${n} seed ${seed}`,
    mapa,
    dist: distribuirJazidas(mapa, derivarGrades(mapa), 'lua'),
  };
}

// 4 zonas só no planeta de teste grande: no médio não cabem 25 m entre as jazidas contestadas (ECO-07).
const CASOS = [caso(7, 'p', 2), caso(7, 'm', 2), caso(7, 'g', 4), caso(3, 'g', 4)];
const PERFIL_LUA = dados.cenarios.find((c) => c.id === 'lua')!;
const perfil = (recurso: string) =>
  PERFIL_LUA[`perfil_${recurso}` as keyof typeof PERFIL_LUA] as number;

describe.each(CASOS)('distribuição de jazidas — $nome', ({ mapa, dist }) => {
  const n = mapa.simetria;
  const R = mapa.raio_m;
  /** Pontos médios fixados por uma meia-volta do grupo (ECO-08: pares espelhados). */
  const estabilizado = (d: number[]) =>
    rotacoesDeSimetria(n)
      .slice(1)
      .some((sigma) => aplicarRotacao(sigma, d as never).every((v, k) => v === d[k]));
  /** Contagem e fração da quantidade esperadas por ponto, pela regra de ECO-08. */
  const esperado = (linha: (typeof dados.jazidas)[number], pontos: { d: number[] }[]) => {
    const porPonto = linha.zona === 'central' ? linha.jazidas / pontos.length : linha.jazidas;
    return pontos.map((ponto) => {
      const total = estabilizado(ponto.d) && porPonto % 2 === 1 ? porPonto + 1 : porPonto;
      return { total, fracao: porPonto / total };
    });
  };

  it('ECO-07/ECO-08: contagens e quantidades = dados:jazidas × perfil do cenário', () => {
    for (const linha of dados.jazidas) {
      // ECO-30: as espalhadas têm teste próprio (a contagem vem da área).
      if (linha.escopo === 'por_area') continue;
      const achadas = dist.jazidas.filter(
        (j) => j.zona === linha.zona && j.recurso === linha.recurso,
      );
      const base = Math.round(linha.quantidade_u * perfil(linha.recurso));
      const rotulo = `${linha.zona}/${linha.recurso}`;
      if (linha.zona === 'inicial' || linha.zona === 'expansao') {
        expect(achadas, rotulo).toHaveLength(linha.jazidas * n);
        for (const jazida of achadas) expect(jazida.quantidade).toBe(base);
        continue;
      }
      const pontos = linha.zona === 'contestada' ? dist.contestadas : dist.centrais;
      const porPonto = esperado(linha, pontos);
      expect(achadas, rotulo).toHaveLength(porPonto.reduce((s, p) => s + p.total, 0));
      // a quantidade total do recurso se mantém (± arredondamento)
      const totalAchado = achadas.reduce((s, j) => s + j.quantidade, 0);
      const totalBase =
        base * (linha.zona === 'central' ? linha.jazidas : linha.jazidas * pontos.length);
      expect(Math.abs(totalAchado - totalBase), rotulo).toBeLessThanOrEqual(achadas.length);
      const fracoes = porPonto.map((p) => Math.round(base * p.fracao));
      for (const jazida of achadas) expect(fracoes).toContain(jazida.quantidade);
    }
  });

  it('ECO-07: distâncias (arcos) dentro das faixas do SPEC', () => {
    for (const jazida of dist.jazidas) {
      const linha = dados.jazidas.find(
        (l) => l.zona === jazida.zona && l.recurso === jazida.recurso,
      )!;
      for (const k of jazida.zonasDePouso) {
        const d = R * arco(jazida.d, mapa.zonasDePouso[k]!.d);
        const rotulo = `${jazida.zona}/${jazida.recurso}`;
        expect(d, rotulo).toBeGreaterThanOrEqual(linha.dist_min_m ?? 0);
        expect(d, rotulo).toBeLessThanOrEqual(linha.dist_max_m ?? Infinity);
      }
    }
  });

  it('ECO-08: contestadas e centrais nos pontos médios; centrais divididas entre os 2 pontos', () => {
    expect(dist.contestadas).toHaveLength(n === 2 ? 2 : 4);
    expect(dist.centrais).toHaveLength(2);
    if (n === 4) {
      // cada zona de pouso tem 2 contestadas e 1 central vizinhas
      for (let k = 0; k < 4; k++) {
        expect(dist.contestadas.filter((c) => c.zonasDePouso.includes(k))).toHaveLength(2);
        expect(dist.centrais.filter((c) => c.zonasDePouso.includes(k))).toHaveLength(1);
      }
    }
    const centrais = dist.jazidas.filter((j) => j.zona === 'central');
    for (const ponto of dist.centrais) {
      const aqui = centrais.filter(
        (j) =>
          R * arco(j.d, ponto.d) < 60 &&
          dist.centrais.every((o) => arco(j.d, ponto.d) <= arco(j.d, o.d)),
      );
      expect([...new Set(aqui.map((j) => j.recurso))].sort()).toEqual(['ti', 'u']);
    }
  });

  it('CEN-11: jazidas transponíveis, a ≥ 6 m de penhascos e alcançáveis por solo', () => {
    const { navegacao } = derivarGrades(mapa);
    const alcancavel = componenteConectado(navegacao, celulaDe(navegacao, mapa.zonasDePouso[0]!.d));
    for (const jazida of dist.jazidas) {
      expect(temFolga(navegacao, jazida.d, 6)).toBe(true);
      expect(noComponente(navegacao, alcancavel, jazida.d)).toBe(true);
    }
  });

  it('CEN-06: o conjunto de jazidas é invariante pelas rotações do grupo', () => {
    const chave = (recurso: string, d: number[]) =>
      `${recurso}:${d.map((v) => v.toFixed(9)).join(',')}`;
    const conjunto = new Set(dist.jazidas.map((j) => chave(j.recurso, j.d)));
    for (const sigma of rotacoesDeSimetria(n)) {
      for (const j of dist.jazidas) {
        expect(conjunto.has(chave(j.recurso, aplicarRotacao(sigma, j.d)))).toBe(true);
      }
    }
  });

  it('justiça: cada zona de pouso vê as mesmas distâncias a cada recurso', () => {
    const assinatura = (k: number) =>
      [...new Set(dist.jazidas.map((j) => j.recurso))].map((recurso) =>
        dist.jazidas
          .filter((j) => j.recurso === recurso)
          .map((j) => R * arco(j.d, mapa.zonasDePouso[k]!.d))
          .sort((a, b) => a - b)
          .map((d) => d.toFixed(6)),
      );
    for (let k = 1; k < n; k++) expect(assinatura(k)).toEqual(assinatura(0));
  });
});

describe('distribuição de jazidas: determinismo', () => {
  it('a mesma seed dá a mesma distribuição', () => {
    const a = caso(11, 'g', 4).dist;
    const b = caso(11, 'g', 4).dist;
    expect(a).toEqual(b);
  });
});

describe('T-176 — ECO-07, ECO-30, D-89: jazidas espalhadas', () => {
  it.each(CASOS)(
    'ECO-07: toda jazida a ≥ jazida_espacamento_min_m das outras — $nome',
    ({ mapa, dist }) => {
      const R = mapa.raio_m;
      const minimo = param('jazida_espacamento_min_m');
      for (let i = 0; i < dist.jazidas.length; i++) {
        for (let j = i + 1; j < dist.jazidas.length; j++) {
          const d = R * arco(dist.jazidas[i]!.d, dist.jazidas[j]!.d);
          expect(d).toBeGreaterThanOrEqual(minimo - 1e-6);
        }
      }
    },
  );

  it(
    'ECO-30: densidade, rodízio dos recursos, quantidades e distância das zonas (Lua real)',
    { timeout: 120_000 },
    () => {
      const mapa = gerarMapaLunar(27, dados.cenarios.find((c) => c.id === 'lua')!.raio_m, 2);
      const dist = distribuirJazidas(mapa, derivarGrades(mapa), 'lua');
      const R = mapa.raio_m;
      const linhas = dados.jazidas.filter((l) => l.escopo === 'por_area');
      const espalhadas = dist.jazidas.filter((j) => j.zona === 'espalhada');
      const porSetor = Math.round(
        (param('jazidas_espalhadas_por_10k_m2') * 4 * Math.PI * R * R) / 10000 / mapa.simetria,
      );
      expect(espalhadas).toHaveLength(porSetor * mapa.simetria);
      const pesos = linhas.reduce((s, l) => s + l.jazidas, 0);
      for (const linha of linhas) {
        const doRecurso = espalhadas.filter((j) => j.recurso === linha.recurso);
        // Rodízio pela ordem da tabela: a fatia de cada recurso segue o peso (± uma volta).
        const esperado = (porSetor * linha.jazidas) / pesos;
        expect(Math.abs(doRecurso.length / mapa.simetria - esperado)).toBeLessThanOrEqual(1);
        for (const j of doRecurso) {
          expect(j.quantidade).toBe(Math.round(linha.quantidade_u * perfil(linha.recurso)));
          for (const z of mapa.zonasDePouso) {
            expect(R * arco(j.d, z.d)).toBeGreaterThanOrEqual(linha.dist_min_m ?? 0);
          }
        }
      }
    },
  );
});
