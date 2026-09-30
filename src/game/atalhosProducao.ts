/**
 * Atalhos de produção de §12.4: Nave (E, I) e os menus da Impressora (U unidades, B
 * estruturas). Tecla (código do teclado) → item de `dados:custos`.
 */
import type { CustosId } from '../sim/data';

export interface OpcaoDeMenu {
  /** Rótulo mostrado no painel. */
  tecla: string;
  codigo: string;
  item: CustosId;
}

const opcao = (tecla: string, item: CustosId): OpcaoDeMenu => ({
  tecla,
  codigo: /^\d$/.test(tecla) ? `Digit${tecla}` : `Key${tecla}`,
  item,
});

export const MENU_NAVE: OpcaoDeMenu[] = [opcao('E', 'hover_explorer'), opcao('I', 'printer')];

/** UI-16 (D-62): cartão do Hover de Plantio de Minas (T: plantar mina no ponto). */
export const MENU_MINAS: OpcaoDeMenu[] = [opcao('T', 'mine')];

/** Unidades sem fila com cartão de ação (UI-16). */
export const COM_CARTAO_DE_ACAO: ReadonlySet<string> = new Set(['hover_minelayer']);

/** §12.4 (Base de Lançamento) S: Satélite (UNI-04, D-55). */
export const MENU_BASE: OpcaoDeMenu[] = [opcao('S', 'satellite')];

export const MENU_UNIDADES: OpcaoDeMenu[] = [
  opcao('E', 'hover_explorer'),
  opcao('M', 'hover_minelayer'),
  opcao('O', 'hover_scout'),
  opcao('V', 'mobile_silo'),
  opcao('C', 'mobile_battery'),
];

export const MENU_ESTRUTURAS: OpcaoDeMenu[] = [
  opcao('T', 'laser_tower'),
  opcao('A', 'storage'),
  opcao('S', 'solar_plant'),
  opcao('N', 'nuclear_plant'),
  opcao('L', 'satellite_uplink'),
  opcao('M', 'wall'),
  opcao('P', 'gate'),
  opcao('F', 'missile_silo'),
  opcao('R', 'aa_battery'),
  opcao('G', 'mag_tower'),
  opcao('E', 'antenna'),
  opcao('D', 'power_hub'),
  opcao('O', 'port'),
  opcao('H', 'hangar'),
  opcao('B', 'arsenal'),
];

/** §12.4 (Porto) T Transporte, A Artilharia, N Antena (UNI-16, D-90). */
export const MENU_PORTO: OpcaoDeMenu[] = [
  opcao('T', 'boat_transport'),
  opcao('A', 'boat_artillery'),
  opcao('N', 'boat_antenna'),
];

/** §12.4 (Base de Lança-Mísseis) C curto, L longo (UNI-10, D-63). */
export const MENU_MISSEIS: OpcaoDeMenu[] = [
  opcao('C', 'missile_short'),
  opcao('L', 'missile_long'),
];

/** §12.4 (Hangar de Drones) B / L / K (UNI-21, D-91). */
export const MENU_HANGAR: OpcaoDeMenu[] = [
  opcao('B', 'drone_bomber'),
  opcao('L', 'drone_laser'),
  opcao('K', 'drone_kamikaze'),
];

/** §12.4 (Fábrica de Artilharia) 1 / 2 / 3 (UNI-22, D-92). */
export const MENU_ARSENAL: OpcaoDeMenu[] = [
  opcao('1', 'hover_ex1'),
  opcao('2', 'hover_opq'),
  opcao('3', 'siege_tank'),
];
