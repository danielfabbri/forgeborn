/**
 * Distribuição das jazidas (ECO-07, ECO-08, CEN-10): quantidades de `dados:jazidas` × perfil do
 * cenário, nas distâncias do SPEC. A zona de pouso 0 é resolvida e as demais são rotações exatas
 * dela; a zona central alterna Ti e U em cruz, para cada zona ter um de cada igualmente perto.
 */
import { type CenariosId, dados, type JazidasRow, type RecursosId } from '../data';
import { componenteConectado, noComponente, temFolga } from './conectividade';
import { celulaDe, FAIXA_BORDA_M, type GradesDoMapa } from './grids';
import { GERADOR_LUA, type MapaLunar, rotacionar } from './lunar';

export type ZonaDeJazida = 'inicial' | 'expansao' | 'contestada' | 'central';

export interface Jazida {
  recurso: RecursosId;
  quantidade: number;
  x: number;
  z: number;
  zona: ZonaDeJazida;
  /** Zona de pouso dona (inicial, expansão) ou as duas vizinhas (contestada); vazio no centro. */
  zonasDePouso: number[];
}

export interface CentroDeZona {
  x: number;
  z: number;
  zonasDePouso: number[];
}

export interface DistribuicaoDeJazidas {
  jazidas: Jazida[];
  expansoes: CentroDeZona[];
  contestadas: CentroDeZona[];
}

/** Números da distribuição (GOV-04: parâmetros do gerador). */
export const DISTRIBUICAO = {
  espacamento_m: 8,
  folgaPenhasco_m: 6, // CEN-11
  arcoInicial_graus: 70,
  distanciasExpansao_m: [112, 106, 118],
  passoAngularExpansao_graus: 7.5,
  distanciaEntreExpansoes_m: 80,
  raiosDoGrupo_m: [8, 11, 14, 17],
  deslocamentosContestada_m: [0, 10, -10, 20, -20, 30, -30, 40, -40],
  desviosLateraisContestada_m: [0, 12, -12, 24, -24],
  raiosCentrais_m: [22, 26, 18, 30, 14],
  passoAngularGrupo_graus: 15,
} as const;

const D = DISTRIBUICAO;
const RAD = Math.PI / 180;

function linhasDaZona(zona: ZonaDeJazida): JazidasRow[] {
  return dados.jazidas.filter((linha) => linha.zona === zona);
}

/** Lista de recursos, uma entrada por jazida, na ordem da tabela. */
function expandir(linhas: JazidasRow[]): JazidasRow[] {
  return linhas.flatMap((linha) => Array.from({ length: linha.jazidas }, () => linha));
}

export function distribuirJazidas(
  mapa: MapaLunar,
  grades: GradesDoMapa,
  cenario: CenariosId,
): DistribuicaoDeJazidas {
  const perfil = dados.cenarios.find((c) => c.id === cenario);
  if (!perfil) throw new Error(`Cenário desconhecido: ${cenario}`);
  const quantidade = (linha: JazidasRow) =>
    Math.round(
      linha.quantidade_u * (perfil[`perfil_${linha.recurso}` as keyof typeof perfil] as number),
    );

  const n = mapa.simetria;
  const nav = grades.navegacao;
  const zonas = mapa.zonasDePouso;
  const zona0 = zonas[0]!;
  const celulaNave = celulaDe(nav, zona0.x, zona0.z)!;
  const alcancavel = componenteConectado(nav, celulaNave[0], celulaNave[1]);
  const limiteUtil = mapa.lado_m / 2 - FAIXA_BORDA_M;
  const foraDosPlatos =
    GERADOR_LUA.raioPlato + GERADOR_LUA.folgaTopo + GERADOR_LUA.larguraPenhasco + D.folgaPenhasco_m;

  const distancia = (ax: number, az: number, bx: number, bz: number) =>
    Math.hypot(ax - bx, az - bz);

  /**
   * Posição válida: dentro da área útil, com folga de penhascos (CEN-11), alcançável por solo a
   * partir da zona 0, espaçada das outras jazidas e fora dos platôs (exceto as iniciais).
   */
  const valida = (x: number, z: number, jaColocadas: Array<[number, number]>, noPlato = false) =>
    Math.abs(x) <= limiteUtil &&
    Math.abs(z) <= limiteUtil &&
    temFolga(nav, x, z, D.folgaPenhasco_m) &&
    noComponente(nav, alcancavel, x, z) &&
    jaColocadas.every(([px, pz]) => distancia(x, z, px, pz) >= D.espacamento_m) &&
    (noPlato || zonas.every((zona) => distancia(x, z, zona.x, zona.z) >= foraDosPlatos));

  /** Coloca um grupo de jazidas em volta de (cx, cz); devolve as posições ou null. */
  const agrupar = (
    cx: number,
    cz: number,
    linhas: JazidasRow[],
    regra: (x: number, z: number, linha: JazidasRow) => boolean,
    ocupadas: Array<[number, number]>,
  ): Array<[number, number]> | null => {
    const posicoes: Array<[number, number]> = [];
    const passos = Math.round(360 / D.passoAngularGrupo_graus);
    for (const [indice, linha] of linhas.entries()) {
      let achou: [number, number] | null = null;
      const inicio = (indice * 360) / linhas.length;
      busca: for (const raio of D.raiosDoGrupo_m) {
        for (let p = 0; p < passos; p++) {
          const a = (inicio + p * D.passoAngularGrupo_graus) * RAD;
          const x = cx + Math.cos(a) * raio;
          const z = cz + Math.sin(a) * raio;
          if (regra(x, z, linha) && valida(x, z, [...ocupadas, ...posicoes])) {
            achou = [x, z];
            break busca;
          }
        }
      }
      if (!achou) return null;
      posicoes.push(achou);
    }
    return posicoes;
  };

  const zona0Jazidas: Array<{ linha: JazidasRow; x: number; z: number; zona: ZonaDeJazida }> = [];
  const ocupadas = () => zona0Jazidas.map((j) => [j.x, j.z] as [number, number]);

  // Inicial: arco no fundo do platô, do lado oposto às rampas.
  const fundo = Math.atan2(zona0.z, zona0.x);
  const iniciais = expandir(linhasDaZona('inicial'));
  const vagas = iniciais.map((_, k) =>
    iniciais.length === 1
      ? 0
      : -D.arcoInicial_graus + (2 * D.arcoInicial_graus * k) / (iniciais.length - 1),
  );
  // Distribui de fora para dentro: 1ª vaga, última, 2ª, penúltima...
  const ordemDasVagas = vagas.map((_, k) => (k % 2 === 0 ? k / 2 : vagas.length - 1 - (k - 1) / 2));
  for (const [k, linha] of iniciais.entries()) {
    const angulo = fundo + vagas[ordemDasVagas[k]!]! * RAD;
    const meioDaFaixa = ((linha.dist_min_m ?? 0) + (linha.dist_max_m ?? 0)) / 2;
    let colocada = false;
    for (const ajuste of [0, 3, -3, 6, -6]) {
      const d = meioDaFaixa + (k % 2 === 0 ? 3 : -3) + ajuste;
      const x = zona0.x + Math.cos(angulo) * d;
      const z = zona0.z + Math.sin(angulo) * d;
      const naFaixa = d >= (linha.dist_min_m ?? 0) && d <= (linha.dist_max_m ?? Infinity);
      if (naFaixa && valida(x, z, ocupadas(), true)) {
        zona0Jazidas.push({ linha, x, z, zona: 'inicial' });
        colocada = true;
        break;
      }
    }
    if (!colocada)
      throw new Error(`Seed ${mapa.seed}: jazida inicial de ${linha.recurso} sem lugar`);
  }

  // Contestadas: no meio entre zonas vizinhas (N = 4) ou nos flancos (N = 2).
  const contestada0: CentroDeZona =
    n === 4
      ? { x: (zona0.x + zonas[1]!.x) / 2, z: (zona0.z + zonas[1]!.z) / 2, zonasDePouso: [0, 1] }
      : (() => {
          const angulo = Math.atan2(zona0.z, zona0.x) + Math.PI / 2;
          const f = 0.5 * limiteUtil;
          return { x: Math.cos(angulo) * f, z: Math.sin(angulo) * f, zonasDePouso: [0, 1] };
        })();
  const linhasContestadas = expandir(linhasDaZona('contestada'));
  const longeDasVizinhas = (x: number, z: number, linha: JazidasRow) =>
    contestada0.zonasDePouso.every((k) => {
      const zona = zonas[k]!;
      return distancia(x, z, zona.x, zona.z) >= (linha.dist_min_m ?? 0);
    });
  let posicoesContestadas: Array<[number, number]> | null = null;
  const direcaoBissetriz = Math.atan2(contestada0.z, contestada0.x);
  // Primeiro ao longo da bissetriz; só então com desvio lateral (a simetria mantém a justiça).
  busca: for (const lateral of D.desviosLateraisContestada_m) {
    for (const deslocamento of D.deslocamentosContestada_m) {
      const cx =
        contestada0.x +
        Math.cos(direcaoBissetriz) * deslocamento -
        Math.sin(direcaoBissetriz) * lateral;
      const cz =
        contestada0.z +
        Math.sin(direcaoBissetriz) * deslocamento +
        Math.cos(direcaoBissetriz) * lateral;
      posicoesContestadas = agrupar(cx, cz, linhasContestadas, longeDasVizinhas, ocupadas());
      if (posicoesContestadas) {
        contestada0.x = cx;
        contestada0.z = cz;
        break busca;
      }
    }
  }
  if (!posicoesContestadas) throw new Error(`Seed ${mapa.seed}: zona contestada sem lugar`);
  linhasContestadas.forEach((linha, k) => {
    const [x, z] = posicoesContestadas[k]!;
    zona0Jazidas.push({ linha, x, z, zona: 'contestada' });
  });
  const contestadas: CentroDeZona[] = Array.from({ length: n }, (_, k) => {
    const [x, z] = rotacionar(contestada0.x, contestada0.z, k, n);
    return n === 4 ? { x, z, zonasDePouso: [k, (k + 1) % n] } : { x, z, zonasDePouso: [0, 1] };
  });

  // Expansão: a posição a 90–130 m mais afastada do centro, das contestadas e das outras expansões.
  const linhasExpansao = expandir(linhasDaZona('expansao'));
  const naFaixaDaZona0 = (x: number, z: number, linha: JazidasRow) => {
    const d = distancia(x, z, zona0.x, zona0.z);
    return d >= (linha.dist_min_m ?? 0) && d <= (linha.dist_max_m ?? Infinity);
  };
  const paraOCentro = Math.atan2(-zona0.z, -zona0.x);
  let melhor: { x: number; z: number; nota: number; posicoes: Array<[number, number]> } | null =
    null;
  const passosAngulares = Math.round(90 / D.passoAngularExpansao_graus);
  for (let s = 0; s <= 2 * passosAngulares; s++) {
    const desvio = (s % 2 === 0 ? s / 2 : -(s + 1) / 2) * D.passoAngularExpansao_graus * RAD;
    for (const d of D.distanciasExpansao_m) {
      const cx = zona0.x + Math.cos(paraOCentro + desvio) * d;
      const cz = zona0.z + Math.sin(paraOCentro + desvio) * d;
      const copias = Array.from({ length: n - 1 }, (_, k) => rotacionar(cx, cz, k + 1, n));
      const nota = Math.min(
        Math.hypot(cx, cz),
        ...contestadas.map((c) => distancia(cx, cz, c.x, c.z)),
        ...copias.map(([x, z]) => distancia(cx, cz, x, z) - D.distanciaEntreExpansoes_m),
      );
      if (melhor && nota <= melhor.nota) continue;
      const posicoes = agrupar(cx, cz, linhasExpansao, naFaixaDaZona0, ocupadas());
      if (posicoes) melhor = { x: cx, z: cz, nota, posicoes };
    }
  }
  if (!melhor) throw new Error(`Seed ${mapa.seed}: expansão sem lugar`);
  const expansao = melhor;
  linhasExpansao.forEach((linha, k) => {
    const [x, z] = expansao.posicoes[k]!;
    zona0Jazidas.push({ linha, x, z, zona: 'expansao' });
  });
  const expansoes: CentroDeZona[] = Array.from({ length: n }, (_, k) => {
    const [x, z] = rotacionar(expansao.x, expansao.z, k, n);
    return { x, z, zonasDePouso: [k] };
  });

  // Replica tudo da zona 0 pela simetria.
  const jazidas: Jazida[] = [];
  for (let k = 0; k < n; k++) {
    for (const j of zona0Jazidas) {
      const [x, z] = rotacionar(j.x, j.z, k, n);
      jazidas.push({
        recurso: j.linha.recurso as RecursosId,
        quantidade: quantidade(j.linha),
        x,
        z,
        zona: j.zona,
        zonasDePouso: j.zona === 'contestada' ? contestadas[k]!.zonasDePouso : [k],
      });
    }
  }

  // Central: cruz com Ti e U alternados (cada zona tem um Ti e um U à mesma distância).
  const centrais = expandir(linhasDaZona('central'));
  const porRecurso = new Map<string, JazidasRow[]>();
  for (const linha of centrais)
    porRecurso.set(linha.recurso, [...(porRecurso.get(linha.recurso) ?? []), linha]);
  const [grupoA = [], grupoB = []] = [...porRecurso.values()];
  const cruz = [grupoA[0], grupoB[0], grupoA[1], grupoB[1]];
  for (const raio of D.raiosCentrais_m) {
    const posicoes = cruz.map(
      (_, k) =>
        [Math.cos((k * Math.PI) / 2) * raio, Math.sin((k * Math.PI) / 2) * raio] as [
          number,
          number,
        ],
    );
    const outras = jazidas.map((j) => [j.x, j.z] as [number, number]);
    if (posicoes.every(([x, z]) => valida(x, z, outras))) {
      cruz.forEach((linha, k) => {
        if (!linha) return;
        const [x, z] = posicoes[k]!;
        jazidas.push({
          recurso: linha.recurso as RecursosId,
          quantidade: quantidade(linha),
          x,
          z,
          zona: 'central',
          zonasDePouso: [],
        });
      });
      return { jazidas, expansoes, contestadas };
    }
  }
  throw new Error(`Seed ${mapa.seed}: zona central sem lugar`);
}
