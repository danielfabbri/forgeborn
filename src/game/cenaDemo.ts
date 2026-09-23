/**
 * Cena de demonstração do M2: cada nação recebe a Nave, uma estrutura de cada tipo e uma
 * unidade de cada tipo na sua zona de pouso. Sai quando existir o início de partida (T-056).
 */
import type { Criacao } from '../sim/debug/criar';
import type { NacaoId } from '../sim';
import type { EstruturasId, MoveisId } from '../sim/data';

interface Zona {
  x: number;
  z: number;
}

const ESTRUTURAS: Array<[EstruturasId, number, number]> = [
  ['laser_tower', 24, 10],
  ['storage', 0, 26],
  ['solar_plant', -24, 10],
  ['nuclear_plant', -18, -24],
  ['satellite_uplink', 12, -30],
];

const UNIDADES: MoveisId[] = [
  'hover_explorer',
  'printer',
  'hover_ex1',
  'hover_opq',
  'hover_minelayer',
  'hover_scout',
  'drone_bomber',
  'drone_laser',
  'mobile_silo',
  'mobile_battery',
];

/** Unidade de observação que patrulha perto da Nave (a sonda E2E acompanha a primeira). */
export function patrulheiro(nacao: NacaoId, zona: Zona): Criacao {
  return { unidade: 'hover_scout', nacao, x: zona.x + 18, z: zona.z + 14 };
}

export function cenaDaNacao(nacao: NacaoId, zona: Zona, unidadesExtras = 0): Criacao[] {
  // A base olha para o centro do mapa: os eixos locais giram com a zona.
  const a = Math.atan2(-zona.z, -zona.x);
  const [c, s] = [Math.cos(a), Math.sin(a)];
  const em = (u: number, v: number) => ({ x: zona.x + u * c - v * s, z: zona.z + u * s + v * c });
  const criacoes: Criacao[] = [{ estrutura: 'ship', nacao, ...em(0, 0) }];
  for (const [tipo, u, v] of ESTRUTURAS) criacoes.push({ estrutura: tipo, nacao, ...em(u, v) });
  UNIDADES.forEach((tipo, k) => {
    criacoes.push({ unidade: tipo, nacao, ...em(16 + (k % 5) * 4.5, -12 + Math.floor(k / 5) * 6) });
  });
  // Extras (teste de carga) em anéis dentro do platô, a 4,5 m uns dos outros.
  let k = 0;
  for (let raio = 36; k < unidadesExtras; raio += 5) {
    const cabem = Math.floor((2 * Math.PI * raio) / 4.5);
    for (let i = 0; i < cabem && k < unidadesExtras; i++, k++) {
      const t = (2 * Math.PI * i) / cabem;
      const tipo = UNIDADES[k % UNIDADES.length]!;
      criacoes.push({ unidade: tipo, nacao, ...em(Math.cos(t) * raio, Math.sin(t) * raio) });
    }
  }
  return criacoes;
}
