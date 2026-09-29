/**
 * FLX-14 (D-39): menus e partida trocam por recarga de página. A configuração da partida vai
 * na URL (`?partida=`), junto com a seed; recarregar a página reinicia a mesma partida.
 */
import { type ConfigFreeBattle, configPadrao, validar } from './freeBattle';

export interface PartidaNaUrl {
  config: ConfigFreeBattle;
  seed: number;
}

const base = () => location.pathname;

export function urlDaPartida(config: ConfigFreeBattle, seed: number): string {
  return `${base()}?partida=${encodeURIComponent(JSON.stringify({ config, seed }))}`;
}

/** A partida da URL, ou null se não houver ou for inválida. */
export function lerPartidaDaUrl(parametros: URLSearchParams): PartidaNaUrl | null {
  const bruto = parametros.get('partida');
  if (!bruto) return null;
  try {
    const lido = JSON.parse(bruto) as Partial<PartidaNaUrl>;
    const config = { ...configPadrao(), ...lido.config } as ConfigFreeBattle;
    const seed = Number(lido.seed);
    if (!Number.isFinite(seed) || validar(config).length > 0) return null;
    return { config, seed };
  } catch {
    return null;
  }
}

/** Seed nova para uma partida (fora da simulação o relógio real é permitido, TEC-05). */
export const novaSeed = (): number => Date.now() % 2_147_483_647;

export function irParaPartida(config: ConfigFreeBattle, seed = novaSeed()): void {
  location.href = urlDaPartida(config, seed);
}

export function irParaMenu(): void {
  location.href = `${base()}?menu`;
}

/** CAM-01: a missão da campanha na URL (slot, missão e nação do slot). */
export interface MissaoNaUrl {
  slot: number;
  missao: string;
  nacao: string;
}

export function urlDaMissao(m: MissaoNaUrl): string {
  const q = new URLSearchParams({ campanha: String(m.slot), missao: m.missao, nacao: m.nacao });
  return `${base()}?${q.toString()}`;
}

export function lerMissaoDaUrl(parametros: URLSearchParams): MissaoNaUrl | null {
  const slot = Number(parametros.get('campanha'));
  const missao = parametros.get('missao');
  const nacao = parametros.get('nacao');
  if (!Number.isInteger(slot) || slot < 0 || !missao || !nacao) return null;
  return { slot, missao, nacao };
}

export function irParaMissao(m: MissaoNaUrl): void {
  location.href = urlDaMissao(m);
}

/** CAM-08: volta à Visão do Universo da campanha no slot. */
export function irParaCampanha(slot: number): void {
  location.href = `${base()}?menu=campanha&slot=${slot}`;
}
