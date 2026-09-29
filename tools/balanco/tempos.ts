/**
 * §21.2: tempos de abate de referência por DPS contínuo, 1 atacante contra 1 alvo, sem
 * movimento nem splash, a partir dos dados gerados. `null` = a arma não atinge a camada do alvo.
 */
import { dados } from '../../src/sim/data';

export interface Linha {
  rotulo: string;
  arma: string;
}

export interface Coluna {
  rotulo: string;
  hp: number;
  classe: 'leve' | 'blindada' | 'estrutura';
  camada: 'solo' | 'ar';
}

const movel = (id: string) => dados.moveis.find((m) => m.id === id)!;
const estrutura = (id: string) => dados.estruturas.find((e) => e.id === id)!;

export const ATACANTES: Linha[] = [
  { rotulo: 'EX1', arma: movel('hover_ex1').arma! },
  { rotulo: 'OPQ', arma: movel('hover_opq').arma! },
  { rotulo: 'Drone Laser', arma: movel('drone_laser').arma! },
  { rotulo: 'Bombardeiro', arma: movel('drone_bomber').arma! },
  { rotulo: 'Torre', arma: estrutura('laser_tower').arma! },
  { rotulo: 'Defesa da Nave', arma: estrutura('ship').arma! },
];

function doMovel(rotulo: string, id: string): Coluna {
  const m = movel(id);
  return {
    rotulo,
    hp: m.hp,
    classe: m.blindagem as Coluna['classe'],
    camada: m.camada as 'solo' | 'ar',
  };
}

function daEstrutura(rotulo: string, id: string): Coluna {
  return { rotulo, hp: estrutura(id).hp, classe: 'estrutura', camada: 'solo' };
}

export const ALVOS: Coluna[] = [
  doMovel('EX1', 'hover_ex1'),
  doMovel('OPQ', 'hover_opq'),
  doMovel('Drone Laser', 'drone_laser'),
  doMovel('Bombardeiro', 'drone_bomber'),
  doMovel('Hover Expl.', 'hover_explorer'),
  doMovel('Impressora', 'printer'),
  daEstrutura('Torre', 'laser_tower'),
  daEstrutura('Armazém', 'storage'),
  daEstrutura('Nave', 'ship'),
];

/** Segundos para o atacante abater o alvo, ou null se não o atinge (ou é a própria Nave). */
export function tempoDeAbate(linha: Linha, coluna: Coluna): number | null {
  if (linha.rotulo === 'Defesa da Nave' && coluna.rotulo === 'Nave') return null;
  const arma = dados.armas.find((a) => a.id === linha.arma)!;
  if (!arma.alvos.includes(coluna.camada) || !arma.recarga_s) return null;
  const mult = dados.multiplicadores.find((m) => m.tipo_dano === arma.tipo_dano)![coluna.classe];
  const dps = Math.max(1, arma.dano * mult) / arma.recarga_s;
  return coluna.hp / dps;
}

/** A tabela de §21.2 em Markdown, com vírgula decimal. */
export function tabelaMarkdown(): string {
  const cabecalho = `| Atacante → alvo (s) | ${ALVOS.map((c) => c.rotulo).join(' | ')} |`;
  const separador = `|---|${ALVOS.map(() => '---').join('|')}|`;
  const linhas = ATACANTES.map((l) => {
    const celulas = ALVOS.map((c) => {
      const t = tempoDeAbate(l, c);
      return t === null ? '—' : t.toFixed(1).replace('.', ',');
    });
    return `| ${l.rotulo} | ${celulas.join(' | ')} |`;
  });
  return [cabecalho, separador, ...linhas].join('\n');
}
