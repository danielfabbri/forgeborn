/**
 * Validação obrigatória do mapa gerado (CEN-11) e geração com recuo para a próxima seed.
 *
 * "Rotas distintas" entre zonas vizinhas: acha-se a rota mais curta, bloqueia-se um corredor de
 * `larguraCorredor_m` em volta dela fora dos platôs (o que tranca também a rampa usada) e exige-se
 * que ainda exista rota. Na prática, as duas rotas saem por rampas diferentes.
 */
import type { CenariosId, TamanhosMapaId } from '../data';
import { componenteConectado, noComponente, temFolga } from './conectividade';
import { celulaDe, derivarGrades, type GradeNavegacao, type GradesDoMapa } from './grids';
import { type DistribuicaoDeJazidas, distribuirJazidas } from './jazidas';
import { GERADOR_LUA, gerarMapaLunar, type MapaLunar, type Simetria } from './lunar';

export type MotivoInvalido =
  | 'zonas_desconectadas'
  | 'rotas_insuficientes'
  | 'jazida_inalcancavel'
  | 'jazida_perto_de_paredao'
  | 'distribuicao_impossivel';

export interface ProblemaDeMapa {
  motivo: MotivoInvalido;
  detalhe: string;
}

export const VALIDACAO = {
  folgaPenhasco_m: 6, // CEN-11
  larguraCorredor_m: 12,
  raioLivrePlato_m: GERADOR_LUA.raioPlato + GERADOR_LUA.folgaTopo + GERADOR_LUA.larguraPenhasco,
  maxTentativas: 50,
} as const;

/** Rota mais curta (4-vizinhança) entre duas células, como lista de índices; null se não há. */
function rotaMaisCurta(
  nav: GradeNavegacao,
  bloqueado: Uint8Array,
  origem: number,
  destino: number,
): number[] | null {
  const { colunas, linhas } = nav;
  const anterior = new Int32Array(colunas * linhas).fill(-1);
  const fila = new Int32Array(colunas * linhas);
  let inicio = 0;
  let fim = 0;
  anterior[origem] = origem;
  fila[fim++] = origem;
  const visitar = (v: number, de: number) => {
    if (anterior[v] !== -1 || bloqueado[v] === 1 || nav.passavel[v] !== 1) return;
    anterior[v] = de;
    fila[fim++] = v;
  };
  while (inicio < fim) {
    const atual = fila[inicio++]!;
    if (atual === destino) break;
    const x = atual % colunas;
    if (x + 1 < colunas) visitar(atual + 1, atual);
    if (x > 0) visitar(atual - 1, atual);
    if (atual + colunas < colunas * linhas) visitar(atual + colunas, atual);
    if (atual >= colunas) visitar(atual - colunas, atual);
  }
  if (anterior[destino] === -1) return null;
  const rota: number[] = [];
  for (let c = destino; c !== origem; c = anterior[c]!) rota.push(c);
  rota.push(origem);
  return rota.reverse();
}

function indiceDe(nav: GradeNavegacao, x: number, z: number): number {
  const [ci, cj] = celulaDe(nav, x, z)!;
  return cj * nav.colunas + ci;
}

/** Há ao menos duas rotas distintas entre as zonas de pouso a e b? */
function temDuasRotas(mapa: MapaLunar, nav: GradeNavegacao, a: number, b: number): boolean {
  const zonaA = mapa.zonasDePouso[a]!;
  const zonaB = mapa.zonasDePouso[b]!;
  const semBloqueio = new Uint8Array(nav.colunas * nav.linhas);
  const origem = indiceDe(nav, zonaA.x, zonaA.z);
  const destino = indiceDe(nav, zonaB.x, zonaB.z);
  const primeira = rotaMaisCurta(nav, semBloqueio, origem, destino);
  if (!primeira) return false;

  const bloqueado = new Uint8Array(nav.colunas * nav.linhas);
  const alcance = Math.ceil(VALIDACAO.larguraCorredor_m / nav.celula_m);
  const centro = (c: number): [number, number] => {
    const x = c % nav.colunas;
    return [
      -nav.meio_m + (x + 0.5) * nav.celula_m,
      -nav.meio_m + ((c - x) / nav.colunas + 0.5) * nav.celula_m,
    ];
  };
  const noPlato = (x: number, z: number) =>
    Math.hypot(x - zonaA.x, z - zonaA.z) < VALIDACAO.raioLivrePlato_m ||
    Math.hypot(x - zonaB.x, z - zonaB.z) < VALIDACAO.raioLivrePlato_m;
  for (const celula of primeira) {
    const [px, pz] = centro(celula);
    const cx = celula % nav.colunas;
    const cy = (celula - cx) / nav.colunas;
    for (let dy = -alcance; dy <= alcance; dy++) {
      for (let dx = -alcance; dx <= alcance; dx++) {
        const vx = cx + dx;
        const vy = cy + dy;
        if (vx < 0 || vy < 0 || vx >= nav.colunas || vy >= nav.linhas) continue;
        const v = vy * nav.colunas + vx;
        const [x, z] = centro(v);
        if (Math.hypot(x - px, z - pz) > VALIDACAO.larguraCorredor_m || noPlato(x, z)) continue;
        bloqueado[v] = 1;
      }
    }
  }
  return rotaMaisCurta(nav, bloqueado, origem, destino) !== null;
}

/** CEN-11: devolve os problemas do mapa; lista vazia = mapa válido. */
export function validarMapa(
  mapa: MapaLunar,
  grades: GradesDoMapa,
  distribuicao: DistribuicaoDeJazidas,
): ProblemaDeMapa[] {
  const nav = grades.navegacao;
  const problemas: ProblemaDeMapa[] = [];
  const zona0 = mapa.zonasDePouso[0]!;
  const [ci, cj] = celulaDe(nav, zona0.x, zona0.z)!;
  const componente = componenteConectado(nav, ci, cj);

  mapa.zonasDePouso.forEach((zona, k) => {
    if (!noComponente(nav, componente, zona.x, zona.z)) {
      problemas.push({
        motivo: 'zonas_desconectadas',
        detalhe: `zona ${k} sem caminho até a zona 0`,
      });
    }
  });
  if (problemas.length === 0) {
    const n = mapa.zonasDePouso.length;
    const pares = n === 2 ? [[0, 1]] : Array.from({ length: n }, (_, k) => [k, (k + 1) % n]);
    for (const [a, b] of pares) {
      if (!temDuasRotas(mapa, nav, a!, b!)) {
        problemas.push({
          motivo: 'rotas_insuficientes',
          detalhe: `zonas ${a} e ${b} com uma rota só`,
        });
      }
    }
  }
  distribuicao.jazidas.forEach((jazida, k) => {
    const onde = `jazida ${k} (${jazida.recurso}, ${jazida.zona}) em (${jazida.x.toFixed(1)}, ${jazida.z.toFixed(1)})`;
    if (!noComponente(nav, componente, jazida.x, jazida.z)) {
      problemas.push({ motivo: 'jazida_inalcancavel', detalhe: onde });
    }
    if (!temFolga(nav, jazida.x, jazida.z, VALIDACAO.folgaPenhasco_m)) {
      problemas.push({ motivo: 'jazida_perto_de_paredao', detalhe: onde });
    }
  });
  return problemas;
}

export interface MapaPronto {
  seed: number;
  mapa: MapaLunar;
  grades: GradesDoMapa;
  jazidas: DistribuicaoDeJazidas;
  /** Seeds recusadas antes desta, com os motivos. */
  rejeitadas: Array<{ seed: number; problemas: ProblemaDeMapa[] }>;
}

/** Gera e valida um mapa; seed inválida passa para a próxima (CEN-11). */
export function gerarMapaValido(
  seed: number,
  tamanho: TamanhosMapaId,
  zonas: Simetria,
  cenario: CenariosId,
): MapaPronto {
  const rejeitadas: MapaPronto['rejeitadas'] = [];
  for (let tentativa = 0; tentativa < VALIDACAO.maxTentativas; tentativa++) {
    const atual = seed + tentativa;
    const mapa = gerarMapaLunar(atual, tamanho, zonas);
    const grades = derivarGrades(mapa);
    let jazidas: DistribuicaoDeJazidas;
    try {
      jazidas = distribuirJazidas(mapa, grades, cenario);
    } catch (erro) {
      const detalhe = erro instanceof Error ? erro.message : String(erro);
      rejeitadas.push({ seed: atual, problemas: [{ motivo: 'distribuicao_impossivel', detalhe }] });
      continue;
    }
    const problemas = validarMapa(mapa, grades, jazidas);
    if (problemas.length === 0) return { seed: atual, mapa, grades, jazidas, rejeitadas };
    rejeitadas.push({ seed: atual, problemas });
  }
  throw new Error(`Nenhum mapa válido em ${VALIDACAO.maxTentativas} seeds a partir de ${seed}`);
}
