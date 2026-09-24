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
