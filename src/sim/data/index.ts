/** Acesso tipado aos dados gerados do SPEC (TEC-12: nenhum número de jogo à mão). */
import alertas from './generated/alertas.json';
import armas from './generated/armas.json';
import atalhos from './generated/atalhos.json';
import cenarios from './generated/cenarios.json';
import custos from './generated/custos.json';
import dificuldade from './generated/dificuldade.json';
import estoqueInicial from './generated/estoque_inicial.json';
import estruturas from './generated/estruturas.json';
import freeBattle from './generated/free_battle.json';
import iaPlano from './generated/ia_plano.json';
import jazidas from './generated/jazidas.json';
import missoes from './generated/missoes.json';
import moveis from './generated/moveis.json';
import multiplicadores from './generated/multiplicadores.json';
import nacoes from './generated/nacoes.json';
import parametros from './generated/parametros.json';
import personalidades from './generated/personalidades.json';
import recursos from './generated/recursos.json';
import type { ParametrosChave, Tabelas } from './generated/types';

export type * from './generated/types';

export const dados: Readonly<Tabelas> = {
  alertas: alertas as unknown as Tabelas['alertas'],
  armas: armas as unknown as Tabelas['armas'],
  atalhos: atalhos as unknown as Tabelas['atalhos'],
  cenarios: cenarios as unknown as Tabelas['cenarios'],
  custos: custos as unknown as Tabelas['custos'],
  dificuldade: dificuldade as unknown as Tabelas['dificuldade'],
  estoque_inicial: estoqueInicial as unknown as Tabelas['estoque_inicial'],
  estruturas: estruturas as unknown as Tabelas['estruturas'],
  free_battle: freeBattle as unknown as Tabelas['free_battle'],
  ia_plano: iaPlano as unknown as Tabelas['ia_plano'],
  jazidas: jazidas as unknown as Tabelas['jazidas'],
  missoes: missoes as unknown as Tabelas['missoes'],
  moveis: moveis as unknown as Tabelas['moveis'],
  multiplicadores: multiplicadores as unknown as Tabelas['multiplicadores'],
  nacoes: nacoes as unknown as Tabelas['nacoes'],
  parametros: parametros as unknown as Tabelas['parametros'],
  personalidades: personalidades as unknown as Tabelas['personalidades'],
  recursos: recursos as unknown as Tabelas['recursos'],
};

const valoresDosParametros = new Map<string, number>(
  dados.parametros.map((linha) => [linha.chave, linha.valor]),
);

/** Valor de um parâmetro de `dados:parametros`. */
export function param(chave: ParametrosChave): number {
  const valor = valoresDosParametros.get(chave);
  if (valor === undefined) throw new Error(`Parâmetro ausente nos dados gerados: ${chave}`);
  return valor;
}
