/**
 * Configuração de Free Battle (§16, FB-01 a FB-04, FLX-07): opções com os padrões de
 * `dados:free_battle`, validação (FB-03) e a resolução das escolhas "aleatória" numa partida
 * concreta, com os comandos que a montam no tick 0.
 */
import { dados, type NacaoId } from '../sim';
import type { Command } from '../sim/core/types';
import type { CenariosId, EstoqueInicialModo, NacoesId, TamanhosMapaId } from '../sim/data';
import { SEMEAR_JAZIDAS_COMMAND } from '../sim/economia';
import { ATIVAR_IA_COMMAND } from '../sim/ia';
import type { Simetria, Vec3 } from '../sim/map/esfera';
import { PRESETS_DE_MAPA } from '../sim/map/presets';
import type { MapaPronto } from '../sim/map/validacao';
import { INICIAR_PARTIDA_COMMAND } from '../sim/producao';

export type Aleatoria = 'aleatoria';
export type ModoNevoaFb = 'normal' | 'explorado' | 'revelado';
export type CondicaoVitoria = 'eliminacao' | 'tempo_limite';

export interface Oponente {
  nacao: NacoesId | Aleatoria;
  dificuldade: string;
}

export interface ConfigFreeBattle {
  nacaoJogador: NacoesId | Aleatoria;
  oponentes: Oponente[];
  cenario: CenariosId;
  tamanho: TamanhosMapaId;
  /** ID do preset (§14.4) ou "aleatoria". */
  mapa: string;
  /** "aleatoria" ou o índice da zona escolhida (FB-02). */
  zonaPouso: Aleatoria | number;
  recursos: EstoqueInicialModo;
  nevoa: ModoNevoaFb;
  vitoria: CondicaoVitoria;
  tempoLimiteMin: number;
  velocidade: number;
}

type Opcao = (typeof dados.free_battle)[number]['opcao'];
const linha = (opcao: Opcao) => dados.free_battle.find((l) => l.opcao === opcao)!;
/** Valores da tabela como lista (as linhas descritivas não viram lista). */
export const valoresDe = (opcao: Opcao): Array<string | number> => {
  const v = linha(opcao).valores;
  return Array.isArray(v) ? v : [];
};
const padraoDe = (opcao: Opcao) => linha(opcao).padrao;

export const NACOES: readonly NacoesId[] = dados.nacoes.map((n) => n.id);
export const DIFICULDADES = valoresDe('dificuldade_oponente') as string[];
/** Cenários com mapa (preset) implementado. */
export const CENARIOS_IMPLEMENTADOS: readonly CenariosId[] = [
  ...new Set(PRESETS_DE_MAPA.filter((p) => !p.soCampanha).map((p) => p.cenario)),
];

export function presetsDe(cenario: CenariosId, tamanho: TamanhosMapaId) {
  return PRESETS_DE_MAPA.filter((p) => p.cenario === cenario && p.tamanho === tamanho);
}

/** Simetria (número de zonas) do mapa de um tamanho: a do preset do tamanho. */
export function zonasDoTamanho(cenario: CenariosId, tamanho: TamanhosMapaId): Simetria {
  return presetsDe(cenario, tamanho)[0]?.zonas ?? (tamanho === 'p' ? 2 : 4);
}

/** Padrões de `dados:free_battle`; "preset do tamanho" é o primeiro preset do tamanho. */
export function configPadrao(): ConfigFreeBattle {
  const cenario = padraoDe('cenario') === 'lua' ? 'lua' : CENARIOS_IMPLEMENTADOS[0]!;
  const tamanho = padraoDe('tamanho_mapa') as TamanhosMapaId;
  const num = Number(padraoDe('num_oponentes'));
  return {
    nacaoJogador: padraoDe('nacao_jogador') as NacoesId,
    oponentes: Array.from({ length: num }, () => ({
      nacao: 'aleatoria',
      dificuldade: String(padraoDe('dificuldade_oponente')),
    })),
    cenario,
    tamanho,
    mapa: presetsDe(cenario, tamanho)[0]?.id ?? 'aleatoria',
    zonaPouso: padraoDe('zona_pouso') as Aleatoria,
    recursos: padraoDe('recursos_iniciais') as EstoqueInicialModo,
    nevoa: padraoDe('nevoa') as ModoNevoaFb,
    vitoria: padraoDe('condicao_vitoria') as CondicaoVitoria,
    tempoLimiteMin: Number(padraoDe('tempo_limite_min')),
    velocidade: Number(String(padraoDe('velocidade')).replace(',', '.')),
  };
}

export const VELOCIDADES = valoresDe('velocidade').map((v) => Number(String(v).replace(',', '.')));

/** Motivo (chave de i18n) de um tamanho não servir para o número de jogadores (FB-03). */
export function motivoDoTamanho(
  tamanho: TamanhosMapaId,
  jogadores: number,
): 'fb.invalido.poucos' | 'fb.invalido.muitos' | null {
  const t = dados.tamanhos_mapa.find((x) => x.id === tamanho)!;
  if (jogadores < t.min_jogadores) return 'fb.invalido.poucos';
  if (jogadores > t.max_jogadores) return 'fb.invalido.muitos';
  return null;
}

export interface ProblemaDaConfig {
  campo: keyof ConfigFreeBattle;
  motivo: string;
}

/** FB-03 e coerência das escolhas; vazio quando a configuração pode iniciar. */
export function validar(c: ConfigFreeBattle): ProblemaDaConfig[] {
  const problemas: ProblemaDaConfig[] = [];
  const jogadores = c.oponentes.length + 1;
  const motivo = motivoDoTamanho(c.tamanho, jogadores);
  if (motivo) problemas.push({ campo: 'tamanho', motivo });
  if (!CENARIOS_IMPLEMENTADOS.includes(c.cenario)) {
    problemas.push({ campo: 'cenario', motivo: 'fb.invalido.cenario' });
  }
  if (c.mapa !== 'aleatoria') {
    const preset = PRESETS_DE_MAPA.find((p) => p.id === c.mapa);
    if (!preset || preset.tamanho !== c.tamanho || preset.cenario !== c.cenario) {
      problemas.push({ campo: 'mapa', motivo: 'fb.invalido.mapa' });
    }
  }
  if (c.zonaPouso !== 'aleatoria') {
    const zonas = zonasDoTamanho(c.cenario, c.tamanho);
    if (!Number.isInteger(c.zonaPouso) || c.zonaPouso < 0 || c.zonaPouso >= zonas) {
      problemas.push({ campo: 'zonaPouso', motivo: 'fb.invalido.zona' });
    }
  }
  const fixas = [c.nacaoJogador, ...c.oponentes.map((o) => o.nacao)].filter(
    (n) => n !== 'aleatoria',
  );
  if (new Set(fixas).size !== fixas.length) {
    problemas.push({ campo: 'oponentes', motivo: 'fb.invalido.nacao_repetida' });
  }
  if (c.oponentes.some((o) => !DIFICULDADES.includes(o.dificuldade))) {
    problemas.push({ campo: 'oponentes', motivo: 'fb.invalido.dificuldade' });
  }
  if (!VELOCIDADES.includes(c.velocidade)) {
    problemas.push({ campo: 'velocidade', motivo: 'fb.invalido.velocidade' });
  }
  return problemas;
}

/** Partida concreta: tudo sorteado, pronta para montar. */
export interface PartidaResolvida {
  seed: number;
  jogador: NacaoId;
  nacoes: NacaoId[];
  /** Dificuldade de cada nação de IA. */
  ias: Record<NacaoId, string>;
  mapa: { seed: number; tamanho: TamanhosMapaId; zonas: Simetria; cenario: CenariosId };
  /** Índice da zona de pouso de cada nação, na ordem de `nacoes`. */
  zonas: number[];
  recursos: EstoqueInicialModo;
  nevoa: ModoNevoaFb;
  tempoLimite_s: number | null;
  velocidade: number;
}

/** PRNG pequeno para os sorteios de fora da simulação (mulberry32). */
function sorteador(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function embaralhar<T>(lista: T[], sorte: () => number): T[] {
  const r = [...lista];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(sorte() * (i + 1));
    [r[i], r[j]] = [r[j]!, r[i]!];
  }
  return r;
}

/** Sorteia o que é "aleatória" (nações, mapa, zonas). A mesma seed dá a mesma partida. */
export function resolver(c: ConfigFreeBattle, seed: number): PartidaResolvida {
  const problemas = validar(c);
  if (problemas.length > 0) {
    throw new Error(`Configuração inválida: ${problemas.map((p) => p.motivo).join(', ')}`);
  }
  const sorte = sorteador(seed);
  const livres = embaralhar(
    NACOES.filter((n) => n !== c.nacaoJogador && !c.oponentes.some((o) => o.nacao === n)),
    sorte,
  );
  const jogador = c.nacaoJogador === 'aleatoria' ? livres.shift()! : c.nacaoJogador;
  const oponentes = c.oponentes.map((o) => ({
    nacao: o.nacao === 'aleatoria' ? livres.shift()! : o.nacao,
    dificuldade: o.dificuldade,
  }));
  const zonas = zonasDoTamanho(c.cenario, c.tamanho);
  const preset = PRESETS_DE_MAPA.find((p) => p.id === c.mapa);
  const mapaSeed = preset ? preset.seed : Math.floor(sorte() * 2_147_483_647);

  // Zonas: o jogador fica com a escolhida (FB-02) ou todas são sorteadas.
  const indices = Array.from({ length: zonas }, (_, k) => k);
  let porNacao: number[];
  if (c.zonaPouso === 'aleatoria') {
    porNacao = embaralhar(indices, sorte).slice(0, oponentes.length + 1);
  } else {
    const escolhida = c.zonaPouso;
    const restantes = embaralhar(
      indices.filter((k) => k !== escolhida),
      sorte,
    );
    porNacao = [escolhida, ...restantes.slice(0, oponentes.length)];
  }

  return {
    seed,
    jogador,
    nacoes: [jogador, ...oponentes.map((o) => o.nacao)],
    ias: Object.fromEntries(oponentes.map((o) => [o.nacao, o.dificuldade])) as Record<
      NacaoId,
      string
    >,
    mapa: { seed: mapaSeed, tamanho: c.tamanho, zonas, cenario: c.cenario },
    zonas: porNacao,
    recursos: c.recursos,
    nevoa: c.nevoa,
    tempoLimite_s: c.vitoria === 'tempo_limite' ? c.tempoLimiteMin * 60 : null,
    velocidade: c.velocidade,
  };
}

type Comando = Command;

/** Comandos do tick 0 que montam a partida: jazidas, início (REG-04 a REG-08) e IAs. */
export function comandosDeInicio(p: PartidaResolvida, pronto: MapaPronto): Comando[] {
  const zonaDe = (k: number): Vec3 => pronto.mapa.zonasDePouso[p.zonas[k]!]!.d;
  const comandos: Comando[] = [
    {
      tick: 0,
      nacao: p.jogador,
      tipo: SEMEAR_JAZIDAS_COMMAND,
      dados: pronto.jazidas.jazidas.map((j) => ({
        recurso: j.recurso,
        quantidade: j.quantidade,
        d: j.d,
      })) as never,
    },
    {
      tick: 0,
      nacao: p.jogador,
      tipo: INICIAR_PARTIDA_COMMAND,
      dados: {
        modo: p.recursos,
        nevoa: p.nevoa,
        tempoLimite_s: p.tempoLimite_s,
        nacoes: p.nacoes.map((nacao, k) => ({ nacao, zona: zonaDe(k) })),
      } as never,
    },
  ];
  for (const nacao of p.nacoes) {
    const nivel = p.ias[nacao];
    if (nivel)
      comandos.push({ tick: 0, nacao, tipo: ATIVAR_IA_COMMAND, dados: { nivel } as never });
  }
  return comandos;
}
