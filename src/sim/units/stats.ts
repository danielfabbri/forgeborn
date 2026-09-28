import { dados, type EstruturasRow, type MoveisId, type MoveisRow, param } from '../data';

const moveis = new Map(dados.moveis.map((linha) => [linha.id, linha]));
const estruturas = new Map(dados.estruturas.map((linha) => [linha.id, linha]));

export function statsMovel(tipo: MoveisId): MoveisRow {
  const linha = moveis.get(tipo);
  if (!linha) throw new Error(`Unidade desconhecida: ${tipo}`);
  return linha;
}

export function statsEstrutura(tipo: string): EstruturasRow {
  const linha = estruturas.get(tipo as EstruturasRow['id']);
  if (!linha) throw new Error(`Estrutura desconhecida: ${tipo}`);
  return linha;
}

export const ehAerea = (tipo: MoveisId): boolean => statsMovel(tipo).camada === 'ar';
/** MOV-08 (D-90): embarcação (camada de água). */
export const ehEmbarcacao = (tipo: MoveisId): boolean => statsMovel(tipo).camada === 'agua';

/** MOV-01: altura em que os hovers flutuam acima do terreno (apresentação). */
export const ALTURA_HOVER_M = 0.6;

export const altitudeDrone = (): number => param('altitude_drone_m');
