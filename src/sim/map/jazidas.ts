/**
 * Distribuição das jazidas (ECO-07, ECO-08, CEN-10) no planeta: quantidades de `dados:jazidas` ×
 * perfil do cenário, nas distâncias do SPEC (arcos, CEN-14).
 *
 * Simetria (CEN-06): as jazidas da zona de pouso 0 (inicial e expansão) são replicadas pelas
 * rotações do grupo. Nos pontos médios (contestados e centrais), cada órbita é resolvida uma vez.
 * Se o ponto é fixado por uma meia-volta τ do grupo (que troca as duas zonas vizinhas), o conjunto
 * dele precisa ser invariante por τ: jazidas do mesmo recurso vão em pares (p, τ·p), e um
 * recurso com número ímpar de jazidas ganha mais uma, dividindo a quantidade (ECO-08).
 */
import { type CenariosId, dados, type JazidasRow, param, type RecursosId } from '../data';
import { componenteConectado, noComponente, temFolga } from './conectividade';
import {
  aplicarRotacao,
  arco,
  avancar,
  diferenca,
  girar,
  normalizar,
  produtoVetorial,
  rotacoesDeSimetria,
  tangente,
  type Vec3,
} from './esfera';
import { celulaDe, type GradesDoMapa } from './grids';
import { GERADOR_LUA, type MapaLunar, type PontoMedio, rumoSemRampa } from './lunar';
import { emLago } from './lagos';
import { emPedra } from './pedras';

export type ZonaDeJazida = 'inicial' | 'expansao' | 'contestada' | 'central';

export interface Jazida {
  recurso: RecursosId;
  quantidade: number;
  d: Vec3;
  zona: ZonaDeJazida;
  /** Zona de pouso dona (inicial, expansão) ou as duas vizinhas (contestada, central). */
  zonasDePouso: number[];
}

export interface CentroDeZona {
  d: Vec3;
  zonasDePouso: number[];
}

export interface DistribuicaoDeJazidas {
  jazidas: Jazida[];
  expansoes: CentroDeZona[];
  contestadas: CentroDeZona[];
  centrais: CentroDeZona[];
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
  deslocamentosMedio_m: [0, 10, -10, 20, -20, 30, -30, 40, -40],
  desviosLateraisMedio_m: [0, 12, -12, 24, -24],
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

function iguais(a: Vec3, b: Vec3): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

interface Colocada {
  linha: JazidasRow;
  d: Vec3;
  /** Fração da quantidade da linha (ECO-08: pares espelhados de um recurso ímpar). */
  fracao?: number;
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

  const R = mapa.raio_m;
  const grupo = rotacoesDeSimetria(mapa.simetria);
  const nav = grades.navegacao;
  const zonas = mapa.zonasDePouso;
  const zona0 = zonas[0]!;
  const alcancavel = componenteConectado(nav, celulaDe(nav, zona0.d));
  const foraDosPlatos =
    GERADOR_LUA.raioPlato + GERADOR_LUA.folgaTopo + GERADOR_LUA.larguraPenhasco + D.folgaPenhasco_m;
  const distancia = (a: Vec3, b: Vec3) => R * arco(a, b);
  /** Ponto a `metros` de c, no rumo tangente `rumo` girado de `graus`. */
  const em = (c: Vec3, rumo: Vec3, graus: number, metros: number): Vec3 =>
    avancar(c, normalizar(girar(rumo, c, graus * RAD)), metros / R).p;

  /** Todas as posições já ocupadas (com as réplicas), para o espaçamento. */
  const ocupadas: Vec3[] = [];

  /**
   * Posição válida: folga de penhascos (CEN-11), alcançável por solo a partir da zona 0,
   * espaçada das outras jazidas e fora dos platôs (exceto as iniciais).
   */
  const valida = (p: Vec3, extras: Vec3[] = [], noPlato = false) =>
    temFolga(nav, p, D.folgaPenhasco_m) &&
    noComponente(nav, alcancavel, p) &&
    [...ocupadas, ...extras].every((q) => distancia(p, q) >= D.espacamento_m) &&
    (noPlato || zonas.every((zona) => distancia(p, zona.d) >= foraDosPlatos)) &&
    // CEN-04 e CEN-17: nenhuma jazida dentro (nem colada) de um lago de metano ou de uma pedra.
    !emLago(mapa, p, param('distancia_min_jazida_m')) &&
    !emPedra(mapa, p, param('distancia_min_jazida_m'));

  /** Coloca um grupo de jazidas em volta de c; devolve as posições ou null. */
  const agrupar = (
    c: Vec3,
    linhas: JazidasRow[],
    regra: (p: Vec3, linha: JazidasRow) => boolean,
  ): Vec3[] | null => {
    const posicoes: Vec3[] = [];
    const passos = Math.round(360 / D.passoAngularGrupo_graus);
    const ref = tangente(c, [0, 1, 0]) ?? tangente(c, [1, 0, 0])!;
    for (const [indice, linha] of linhas.entries()) {
      let achou: Vec3 | null = null;
      const inicio = (indice * 360) / linhas.length;
      busca: for (const raio of D.raiosDoGrupo_m) {
        for (let p = 0; p < passos; p++) {
          const q = em(c, ref, inicio + p * D.passoAngularGrupo_graus, raio);
          if (regra(q, linha) && valida(q, posicoes)) {
            achou = q;
            break busca;
          }
        }
      }
      if (!achou) return null;
      posicoes.push(achou);
    }
    return posicoes;
  };

  const jazidas: Jazida[] = [];
  const registrar = (
    colocadas: Colocada[],
    zona: ZonaDeJazida,
    zonasDePouso: (sigma: Vec3, k: number) => number[],
    rotacoes: Vec3[],
  ) => {
    rotacoes.forEach((sigma, k) => {
      for (const { linha, d, fracao } of colocadas) {
        const q = aplicarRotacao(sigma, d);
        jazidas.push({
          recurso: linha.recurso as RecursosId,
          quantidade: Math.round(quantidade(linha) * (fracao ?? 1)),
          d: q,
          zona,
          zonasDePouso: zonasDePouso(sigma, k),
        });
        ocupadas.push(q);
      }
    });
  };
  /** Índice da zona de pouso para onde σ leva a zona k. */
  const zonaRotacionada = (sigma: Vec3, k: number) => {
    const alvo = aplicarRotacao(sigma, zonas[k]!.d);
    return zonas.findIndex((z) => arco(z.d, alvo) < 1e-9);
  };

  // Inicial: arco no fundo do platô, no maior vão entre as rampas.
  const fundo = rumoSemRampa(zona0);
  const iniciais = expandir(linhasDaZona('inicial'));
  const vagas = iniciais.map((_, k) =>
    iniciais.length === 1
      ? 0
      : -D.arcoInicial_graus + (2 * D.arcoInicial_graus * k) / (iniciais.length - 1),
  );
  // Distribui de fora para dentro: 1ª vaga, última, 2ª, penúltima...
  const ordemDasVagas = vagas.map((_, k) => (k % 2 === 0 ? k / 2 : vagas.length - 1 - (k - 1) / 2));
  const zona0Iniciais: Colocada[] = [];
  for (const [k, linha] of iniciais.entries()) {
    const angulo = vagas[ordemDasVagas[k]!]!;
    const meioDaFaixa = ((linha.dist_min_m ?? 0) + (linha.dist_max_m ?? 0)) / 2;
    let colocada = false;
    for (const ajuste of [0, 3, -3, 6, -6]) {
      const d = meioDaFaixa + (k % 2 === 0 ? 3 : -3) + ajuste;
      const p = em(zona0.d, fundo, angulo, d);
      const naFaixa = d >= (linha.dist_min_m ?? 0) && d <= (linha.dist_max_m ?? Infinity);
      if (
        naFaixa &&
        valida(
          p,
          zona0Iniciais.map((c) => c.d),
          true,
        )
      ) {
        zona0Iniciais.push({ linha, d: p });
        colocada = true;
        break;
      }
    }
    if (!colocada)
      throw new Error(`Seed ${mapa.seed}: jazida inicial de ${linha.recurso} sem lugar`);
  }
  registrar(zona0Iniciais, 'inicial', (sigma) => [zonaRotacionada(sigma, 0)], grupo);

  /** Resolve os pontos médios de uma lista (contestados ou centrais), órbita por órbita. */
  const resolverPontosMedios = (
    pontos: PontoMedio[],
    linhasPorPonto: JazidasRow[],
    zona: ZonaDeJazida,
  ): CentroDeZona[] => {
    const centros: CentroDeZona[] = pontos.map((m) => ({ d: m.d, zonasDePouso: m.zonasDePouso }));
    const resolvido = pontos.map(() => false);
    pontos.forEach((m, indice) => {
      if (resolvido[indice]) return;
      const [za, zb] = m.zonasDePouso;
      const longeDasVizinhas = (p: Vec3, linha: JazidasRow) =>
        [za, zb].every((k) => distancia(p, zonas[k]!.d) >= (linha.dist_min_m ?? 0));
      const estabilizador = grupo.filter((sigma) => iguais(aplicarRotacao(sigma, m.d), m.d));
      // Rumos em m: ao longo do arco bissetor (mantém a distância às duas zonas) e lateral.
      const normalBissetor = normalizar(diferenca(zonas[za]!.d, zonas[zb]!.d));
      const aoLongo = normalizar(produtoVetorial(normalBissetor, m.d));
      const lateral = normalizar(produtoVetorial(m.d, aoLongo));

      let colocadas: Colocada[] | null = null;
      let centro = m.d;
      if (estabilizador.length === 1) {
        // Sem simetria própria: grupo livre em volta do ponto, deslocado se preciso.
        busca: for (const desvio of D.desviosLateraisMedio_m) {
          for (const deslocamento of D.deslocamentosMedio_m) {
            let c = avancar(m.d, aoLongo, deslocamento / R).p;
            if (desvio !== 0) c = avancar(c, tangente(c, lateral) ?? lateral, desvio / R).p;
            const posicoes = agrupar(c, linhasPorPonto, longeDasVizinhas);
            if (posicoes) {
              colocadas = linhasPorPonto.map((linha, k) => ({ linha, d: posicoes[k]! }));
              centro = c;
              break busca;
            }
          }
        }
      } else {
        // Fixado por τ: pares espelhados (p, τ·p) do mesmo recurso. ECO-08: recurso com número
        // ímpar de jazidas ganha mais uma, e a quantidade se divide igualmente entre elas.
        const tau = estabilizador.find((s) => !iguais(s, [1, 1, 1]))!;
        const porRecurso = new Map<string, JazidasRow[]>();
        for (const linha of linhasPorPonto) {
          porRecurso.set(linha.recurso, [...(porRecurso.get(linha.recurso) ?? []), linha]);
        }
        const pares: Array<{ linha: JazidasRow; fracao: number }> = [];
        for (const lista of porRecurso.values()) {
          const total = lista.length % 2 === 0 ? lista.length : lista.length + 1;
          for (let k = 0; k < total / 2; k++) {
            pares.push({ linha: lista[0]!, fracao: lista.length / total });
          }
        }
        const tentativa: Colocada[] = [];
        const extras = () => tentativa.map((c) => c.d);
        let ok = true;
        // Pares: em volta do ponto, com a imagem por τ também válida.
        const passos = Math.round(360 / D.passoAngularGrupo_graus);
        for (const [indice, { linha, fracao }] of pares.entries()) {
          if (!ok) break;
          let achou = false;
          busca: for (const raio of D.raiosDoGrupo_m) {
            for (let s = 0; s < passos; s++) {
              const p = em(
                m.d,
                lateral,
                (indice * 360) / pares.length + s * D.passoAngularGrupo_graus,
                raio,
              );
              const q = aplicarRotacao(tau, p);
              if (distancia(p, q) < D.espacamento_m) continue;
              if (!longeDasVizinhas(p, linha) || !valida(p, extras())) continue;
              if (!valida(q, [...extras(), p])) continue;
              tentativa.push({ linha, d: p, fracao }, { linha, d: q, fracao });
              achou = true;
              break busca;
            }
          }
          if (!achou) ok = false;
        }
        if (ok) colocadas = tentativa;
      }
      if (!colocadas) throw new Error(`Seed ${mapa.seed}: zona ${zona} sem lugar`);

      // Replica para os outros pontos da órbita (uma rotação por ponto).
      const rotacoes: Vec3[] = [];
      pontos.forEach((outro, k) => {
        const sigma = grupo.find((s) => iguais(aplicarRotacao(s, m.d), outro.d));
        if (!sigma || resolvido[k]) return;
        resolvido[k] = true;
        rotacoes.push(sigma);
        centros[k] = { d: aplicarRotacao(sigma, centro), zonasDePouso: outro.zonasDePouso };
      });
      registrar(
        colocadas,
        zona,
        (sigma) => {
          const destino = aplicarRotacao(sigma, m.d);
          return pontos.find((p) => iguais(p.d, destino))!.zonasDePouso;
        },
        rotacoes,
      );
    });
    return centros;
  };

  const contestadas = resolverPontosMedios(
    mapa.contestados,
    expandir(linhasDaZona('contestada')),
    'contestada',
  );
  // ECO-08: as jazidas `por_mapa` da zona central se dividem igualmente entre os pontos centrais.
  const porPontoCentral = linhasDaZona('central').flatMap((linha) => {
    const cada = linha.jazidas / mapa.centrais.length;
    if (!Number.isInteger(cada)) {
      throw new Error(`jazidas centrais de ${linha.recurso} não se dividem entre os pontos`);
    }
    return Array.from({ length: cada }, () => linha);
  });
  const centrais = resolverPontosMedios(mapa.centrais, porPontoCentral, 'central');

  // Expansão: a posição a 90–130 m mais afastada dos pontos médios e das outras expansões.
  const linhasExpansao = expandir(linhasDaZona('expansao'));
  const naFaixaDaZona0 = (p: Vec3, linha: JazidasRow) => {
    const d = distancia(p, zona0.d);
    return d >= (linha.dist_min_m ?? 0) && d <= (linha.dist_max_m ?? Infinity);
  };
  const pontosMedios = [...contestadas, ...centrais].map((c) => c.d);
  let melhor: { c: Vec3; nota: number; posicoes: Vec3[] } | null = null;
  const passosAngulares = Math.round(360 / D.passoAngularExpansao_graus);
  for (let s = 0; s < passosAngulares; s++) {
    for (const d of D.distanciasExpansao_m) {
      const c = em(zona0.d, fundo, s * D.passoAngularExpansao_graus, d);
      const copias = grupo.slice(1).map((sigma) => aplicarRotacao(sigma, c));
      const nota = Math.min(
        ...pontosMedios.map((m) => distancia(c, m)),
        ...copias.map((q) => distancia(c, q) - D.distanciaEntreExpansoes_m),
      );
      if (melhor && nota <= melhor.nota) continue;
      const posicoes = agrupar(c, linhasExpansao, naFaixaDaZona0);
      if (!posicoes) continue;
      // As réplicas também precisam de espaço entre si e para o resto.
      const replicas = grupo
        .slice(1)
        .flatMap((sigma) => posicoes.map((p) => aplicarRotacao(sigma, p)));
      if (
        !replicas.every((q) =>
          [...ocupadas, ...posicoes].every((o) => distancia(q, o) >= D.espacamento_m),
        )
      )
        continue;
      melhor = { c, nota, posicoes };
    }
  }
  if (!melhor) throw new Error(`Seed ${mapa.seed}: expansão sem lugar`);
  const expansao = melhor;
  registrar(
    linhasExpansao.map((linha, k) => ({ linha, d: expansao.posicoes[k]! })),
    'expansao',
    (sigma) => [zonaRotacionada(sigma, 0)],
    grupo,
  );
  const expansoes: CentroDeZona[] = grupo.map((sigma) => ({
    d: aplicarRotacao(sigma, expansao.c),
    zonasDePouso: [zonaRotacionada(sigma, 0)],
  }));

  return { jazidas, expansoes, contestadas, centrais };
}
