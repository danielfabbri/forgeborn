import { describe, expect, it } from 'vitest';
import { dados } from '../../src/sim';
import { componenteConectado, noComponente, temFolga } from '../../src/sim/map/conectividade';
import { celulaDe, derivarGrades } from '../../src/sim/map/grids';
import { distribuirJazidas, type DistribuicaoDeJazidas } from '../../src/sim/map/jazidas';
import { gerarMapaLunar, type MapaLunar, rotacionar, type Simetria } from '../../src/sim/map/lunar';

interface Caso {
  nome: string;
  mapa: MapaLunar;
  dist: DistribuicaoDeJazidas;
}

function caso(seed: number, tamanho: 'p' | 'm' | 'g', n: Simetria): Caso {
  const mapa = gerarMapaLunar(seed, tamanho, n);
  return {
    nome: `${tamanho.toUpperCase()}${n} seed ${seed}`,
    mapa,
    dist: distribuirJazidas(mapa, derivarGrades(mapa), 'lua'),
  };
}

const CASOS = [caso(7, 'p', 2), caso(7, 'm', 2), caso(7, 'm', 4), caso(3, 'g', 4)];
const PERFIL_LUA = dados.cenarios.find((c) => c.id === 'lua')!;
const perfil = (recurso: string) =>
  PERFIL_LUA[`perfil_${recurso}` as keyof typeof PERFIL_LUA] as number;

describe.each(CASOS)('distribuição de jazidas — $nome', ({ mapa, dist }) => {
  const n = mapa.simetria;

  it('ECO-07: contagens e quantidades = dados:jazidas × perfil do cenário', () => {
    for (const linha of dados.jazidas) {
      const copias = linha.escopo === 'por_mapa' ? 1 : n;
      const achadas = dist.jazidas.filter(
        (j) => j.zona === linha.zona && j.recurso === linha.recurso,
      );
      expect(achadas, `${linha.zona}/${linha.recurso}`).toHaveLength(linha.jazidas * copias);
      for (const jazida of achadas) {
        expect(jazida.quantidade).toBe(Math.round(linha.quantidade_u * perfil(linha.recurso)));
      }
    }
    expect(dist.jazidas).toHaveLength(
      dados.jazidas.reduce((soma, l) => soma + l.jazidas * (l.escopo === 'por_mapa' ? 1 : n), 0),
    );
  });

  it('ECO-07: distâncias dentro das faixas do SPEC', () => {
    for (const jazida of dist.jazidas) {
      const linha = dados.jazidas.find(
        (l) => l.zona === jazida.zona && l.recurso === jazida.recurso,
      )!;
      for (const k of jazida.zonasDePouso) {
        const zona = mapa.zonasDePouso[k]!;
        const d = Math.hypot(jazida.x - zona.x, jazida.z - zona.z);
        expect(d, `${jazida.zona}/${jazida.recurso}`).toBeGreaterThanOrEqual(linha.dist_min_m ?? 0);
        expect(d, `${jazida.zona}/${jazida.recurso}`).toBeLessThanOrEqual(
          linha.dist_max_m ?? Infinity,
        );
      }
    }
  });

  it('ECO-08: 2 zonas contestadas em mapas de 2 zonas; uma entre cada par vizinho em mapas de 4', () => {
    expect(dist.contestadas).toHaveLength(n === 2 ? 2 : 4);
    if (n === 4) {
      expect(dist.contestadas.map((c) => c.zonasDePouso)).toEqual([
        [0, 1],
        [1, 2],
        [2, 3],
        [3, 0],
      ]);
    }
  });

  it('CEN-11: jazidas transponíveis, a ≥ 6 m de penhascos e alcançáveis por solo', () => {
    const { navegacao } = derivarGrades(mapa);
    const [ci, cj] = celulaDe(navegacao, mapa.zonasDePouso[0]!.x, mapa.zonasDePouso[0]!.z)!;
    const alcancavel = componenteConectado(navegacao, ci, cj);
    for (const jazida of dist.jazidas) {
      expect(temFolga(navegacao, jazida.x, jazida.z, 6)).toBe(true);
      expect(noComponente(navegacao, alcancavel, jazida.x, jazida.z)).toBe(true);
    }
  });

  it('justiça: as jazidas de cada zona de pouso são rotações exatas das da zona 0', () => {
    const daZona = (k: number) =>
      dist.jazidas.filter(
        (j) => j.zona !== 'central' && j.zona !== 'contestada' && j.zonasDePouso[0] === k,
      );
    const zero = daZona(0);
    for (let k = 1; k < n; k++) {
      daZona(k).forEach((jazida, indice) => {
        const [x, z] = rotacionar(zero[indice]!.x, zero[indice]!.z, k, n);
        expect(jazida.recurso).toBe(zero[indice]!.recurso);
        expect(jazida.x).toBeCloseTo(x, 9);
        expect(jazida.z).toBeCloseTo(z, 9);
      });
    }
  });

  it('justiça: cada zona de pouso tem um Ti e um U centrais à mesma distância', () => {
    const centrais = dist.jazidas.filter((j) => j.zona === 'central');
    const maisProxima = (x: number, z: number, recurso: string) =>
      Math.min(
        ...centrais.filter((j) => j.recurso === recurso).map((j) => Math.hypot(j.x - x, j.z - z)),
      );
    const distancias = mapa.zonasDePouso.map((zona) => [
      maisProxima(zona.x, zona.z, 'ti'),
      maisProxima(zona.x, zona.z, 'u'),
    ]);
    for (const [ti, u] of distancias) {
      expect(ti).toBeCloseTo(distancias[0]![0]!, 6);
      expect(u).toBeCloseTo(distancias[0]![1]!, 6);
    }
  });
});

describe('distribuição de jazidas: determinismo', () => {
  it('a mesma seed dá a mesma distribuição', () => {
    const a = caso(11, 'm', 4).dist;
    const b = caso(11, 'm', 4).dist;
    expect(a).toEqual(b);
  });
});
