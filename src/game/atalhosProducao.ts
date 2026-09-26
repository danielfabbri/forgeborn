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
export const COM_CARTAO_DE_ACAO: ReadonlySet<string> = new Set([
  'hover_minelayer',
  'mobile_battery',
]);

/** §12.4 (Base de Lançamento) S: Satélite (UNI-04, D-55). */
export const MENU_BASE: OpcaoDeMenu[] = [opcao('S', 'satellite')];

export const MENU_UNIDADES: OpcaoDeMenu[] = [
  opcao('E', 'hover_explorer'),
  opcao('1', 'hover_ex1'),
  opcao('2', 'hover_opq'),
  opcao('M', 'hover_minelayer'),
  opcao('O', 'hover_scout'),
  opcao('B', 'drone_bomber'),
  opcao('L', 'drone_laser'),
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
];

/** §12.4 (Base de Lança-Mísseis) C curto, L longo (UNI-10, D-63). */
export const MENU_MISSEIS: OpcaoDeMenu[] = [
  opcao('C', 'missile_short'),
  opcao('L', 'missile_long'),
];
