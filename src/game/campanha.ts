/**
 * Campanha (CAM-01 a CAM-04, CAM-08, CAM-09, D-73): slots salvos (TEC-21), liberação
 * cumulativa das missões, estrelas e desbloqueio. A lógica aqui é pura; a persistência usa o
 * armazenamento local.
 */
import { dados, type NacaoId } from '../sim';
import type { MissoesRow } from '../sim/data';
import type { Command } from '../sim/core/types';
import { arco, type Vec3 } from '../sim/map/esfera';
import { PRESETS_DE_MAPA } from '../sim/map/presets';
import type { MapaPronto } from '../sim/map/validacao';
import { INICIAR_PARTIDA_COMMAND } from '../sim/producao';
import { MONTAR_SEM_NAVE_COMMAND } from '../sim/producao/inicio';
import { gravar, ler } from './armazenamento';
import { comandosDeInicio, type PartidaResolvida } from './freeBattle';

/** Versões de missão jogáveis nesta versão do jogo. */
const VERSOES_JOGAVEIS = new Set(['v1.0']);

export interface ResultadoDaMissao {
  estrelas: number;
  melhor_s: number;
}

export interface SlotDeCampanha {
  nacao: NacaoId;
  missoes: Record<string, ResultadoDaMissao>;
}

export const NUMERO_DE_SLOTS = 3;

/** Missões da campanha na ordem. */
export function missoes(): MissoesRow[] {
  return [...dados.missoes].sort((a, b) => a.ordem - b.ordem);
}

export const missaoPorId = (id: string): MissoesRow | undefined =>
  dados.missoes.find((m) => m.id === id);

export const jogavel = (m: MissoesRow): boolean => VERSOES_JOGAVEIS.has(m.versao);

/** Itens que acompanham o que os fabrica (CAM-02). */
const DERIVADOS: Record<string, string[]> = {
  satellite_uplink: ['satellite'],
  hover_minelayer: ['mine'],
  missile_silo: ['missile_short', 'missile_long'],
};

/** CAM-02: itens liberados na missão (cumulativo até ela), com os derivados. */
export function liberadosNa(missao: string): string[] {
  const alvo = missaoPorId(missao);
  if (!alvo) return [];
  const itens = new Set<string>();
  for (const m of missoes()) {
    if (m.ordem > alvo.ordem) break;
    const libera = m.libera;
    const lista = Array.isArray(libera) ? libera : libera ? [libera] : [];
    for (const item of lista) {
      itens.add(String(item));
      for (const d of DERIVADOS[String(item)] ?? []) itens.add(d);
    }
  }
  return [...itens];
}

/** CAM-03: ★ concluir; ★★ no tempo-par; ★★★ no tempo-par sem a Nave abaixo de 50% do HP. */
export function estrelas(duracao_s: number, tempoPar_min: number, naveMinimaPct: number): number {
  const noPar = duracao_s <= tempoPar_min * 60 + 1e-9;
  if (!noPar) return 1;
  return naveMinimaPct >= 50 - 1e-9 ? 3 : 2;
}

/** CAM-01: a primeira missão está sempre aberta; as outras, com a anterior concluída. */
export function desbloqueada(slot: SlotDeCampanha, missao: string): boolean {
  const lista = missoes();
  const k = lista.findIndex((m) => m.id === missao);
  if (k < 0 || !jogavel(lista[k]!)) return false;
  if (k === 0) return true;
  return slot.missoes[lista[k - 1]!.id] !== undefined;
}

/** CAM-08: guarda o melhor resultado da missão no slot. */
export function registrar(
  slot: SlotDeCampanha,
  missao: string,
  resultado: ResultadoDaMissao,
): SlotDeCampanha {
  const antes = slot.missoes[missao];
  return {
    ...slot,
    missoes: {
      ...slot.missoes,
      [missao]: {
        estrelas: Math.max(antes?.estrelas ?? 0, resultado.estrelas),
        melhor_s: Math.min(antes?.melhor_s ?? Infinity, resultado.melhor_s),
      },
    },
  };
}

export const totalDeEstrelas = (slot: SlotDeCampanha): number =>
  Object.values(slot.missoes).reduce((s, r) => s + r.estrelas, 0);

const chave = (k: number) => `campanha.slot${k}`;

/** CAM-09: os 3 slots (null = vazio). */
export async function lerSlots(): Promise<Array<SlotDeCampanha | null>> {
  const slots: Array<SlotDeCampanha | null> = [];
  for (let k = 0; k < NUMERO_DE_SLOTS; k++) {
    const s = await ler<SlotDeCampanha | null>(chave(k));
    slots.push(s && typeof s === 'object' && s.nacao ? s : null);
  }
  return slots;
}

export async function lerSlot(k: number): Promise<SlotDeCampanha | null> {
  return (await lerSlots())[k] ?? null;
}

export async function salvarSlot(k: number, slot: SlotDeCampanha | null): Promise<void> {
  await gravar(chave(k), slot);
}

/** D-73: mapa (preset curado, CEN-12) de cada missão da campanha v1.0. */
const MAPA_DA_MISSAO: Record<string, string> = {
  m00: 'campo_de_testes',
  m01: 'mare_imbrium',
  m02: 'cratera_shackleton',
  m03: 'valles_marineris',
};

/** Oponentes sem Nave (CAM-06): o tipo e onde são montados. */
export const OPONENTES_SEM_NAVE = new Set(['posto_passivo', 'alvos_treino']);

export interface PartidaDaMissao {
  missao: MissoesRow;
  slot: number;
  resolvida: PartidaResolvida;
  /** Nações sem Nave e o tipo de cada uma (CAM-06). */
  semNave: Array<{ nacao: NacaoId; tipo: string }>;
}

/** CAM-01: a partida da missão, com a nação do slot e as demais na ordem de `dados:nacoes`. */
export function resolverMissao(
  missaoId: string,
  nacaoJogador: NacaoId,
  slot: number,
): PartidaDaMissao | null {
  const missao = missaoPorId(missaoId);
  const preset = PRESETS_DE_MAPA.find((p) => p.id === MAPA_DA_MISSAO[missaoId]);
  if (!missao || !preset) return null;
  const lista = Array.isArray(missao.oponentes) ? missao.oponentes : [missao.oponentes];
  const outras = dados.nacoes.map((n) => n.id).filter((n) => n !== nacaoJogador);
  const oponentes = lista.map((tipo, k) => ({ nacao: outras[k]!, tipo: String(tipo) }));
  const ias: Record<string, string> = {};
  const semNave: PartidaDaMissao['semNave'] = [];
  for (const o of oponentes) {
    if (OPONENTES_SEM_NAVE.has(o.tipo)) semNave.push(o);
    else ias[o.nacao] = o.tipo;
  }
  return {
    missao,
    slot,
    semNave,
    resolvida: {
      seed: preset.seed,
      jogador: nacaoJogador,
      nacoes: [nacaoJogador, ...oponentes.map((o) => o.nacao)],
      ias: ias as Record<NacaoId, string>,
      mapa: {
        seed: preset.seed,
        tamanho: preset.tamanho,
        zonas: preset.zonas,
        cenario: preset.cenario,
      },
      zonas: [0, ...oponentes.map((_, k) => (k + 1) % preset.zonas)],
      recursos: 'padrao',
      nevoa: 'normal',
      tempoLimite_s: null,
      velocidade: 1,
    },
  };
}

/** CAM-07: o ponto marcado (zona central de ECO-08 mais próxima da zona do jogador). */
export function pontoMarcado(pronto: MapaPronto, zonaJogador: Vec3): Vec3 {
  const pontos = pronto.mapa.centrais.length > 0 ? pronto.mapa.centrais : pronto.mapa.contestados;
  let melhor = pontos[0]!.d;
  for (const p of pontos) if (arco(p.d, zonaJogador) < arco(melhor, zonaJogador)) melhor = p.d;
  return melhor;
}

/** Comandos do tick 0 da missão: início sem os oponentes sem Nave, liberação e o posto. */
export function comandosDaMissao(pm: PartidaDaMissao, pronto: MapaPronto): Command[] {
  const p = pm.resolvida;
  const semNave = new Set(pm.semNave.map((s) => s.nacao));
  const comNave = p.nacoes.map((n, k) => ({ n, k })).filter(({ n }) => !semNave.has(n));
  const base = comandosDeInicio(
    { ...p, nacoes: comNave.map((c) => c.n), zonas: comNave.map((c) => p.zonas[c.k]!) },
    pronto,
  );
  const liberados = liberadosNa(pm.missao.id);
  for (const c of base) {
    if (c.tipo === INICIAR_PARTIDA_COMMAND)
      (c.dados as Record<string, unknown>).liberados = liberados;
  }
  const zonaJogador = pronto.mapa.zonasDePouso[p.zonas[0]!]!.d;
  for (const s of pm.semNave) {
    const k = p.nacoes.indexOf(s.nacao);
    const centro =
      s.tipo === 'alvos_treino'
        ? pontoMarcado(pronto, zonaJogador)
        : pronto.mapa.zonasDePouso[p.zonas[k]!]!.d;
    base.push({
      tick: 0,
      nacao: s.nacao,
      tipo: MONTAR_SEM_NAVE_COMMAND,
      dados: { tipo: s.tipo, centro } as never,
    });
  }
  return base;
}
