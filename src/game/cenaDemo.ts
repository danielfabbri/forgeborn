/**
 * Cena de demonstração do M2: cada nação recebe a Nave, uma estrutura de cada tipo e uma
 * unidade de cada tipo na sua zona de pouso. Sai quando existir o início de partida (T-056).
 */
import type { NacaoId } from '../sim';
import type { EstruturasId, MoveisId } from '../sim/data';
import type { Criacao } from '../sim/debug/criar';
import { avancar, normalizar, produtoVetorial, type Vec3 } from '../sim/map/esfera';
import { rumoSemRampa, type ZonaDePouso } from '../sim/map/lunar';

/**
 * Ponto (u, v) em metros no plano tangente da zona: u para o lado das rampas (a frente da
 * base), v para a esquerda.
 */
function emVoltaDa(zona: ZonaDePouso, raio: number): (u: number, v: number) => { d: Vec3 } {
  const frente = rumoSemRampa(zona).map((c) => -c) as Vec3;
  const esquerda = produtoVetorial(zona.d, frente);
  return (u, v) => {
    const dist = Math.hypot(u, v);
    if (dist < 1e-9) return { d: zona.d };
    const rumo = normalizar([
      frente[0] * u + esquerda[0] * v,
      frente[1] * u + esquerda[1] * v,
      frente[2] * u + esquerda[2] * v,
    ]);
    return { d: avancar(zona.d, rumo, dist / raio).p };
  };
}

// Na metade da frente (rampas) e nos lados, longe do arco das jazidas iniciais (atrás).
const ESTRUTURAS: Array<[EstruturasId, number, number]> = [
  ['laser_tower', 28, 4],
  ['storage', 2, 28],
  ['solar_plant', 16, 24],
  ['nuclear_plant', 20, -20],
  ['satellite_uplink', 2, -30],
];

/** Hovers de exploração extras, entre a Nave e as jazidas iniciais (a diretiva os põe a minerar). */
const EXPLORADORES: Array<[number, number]> = [
  [-14, -6],
  [-14, -2],
  [-14, 2],
  [-14, 6],
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
export function patrulheiro(nacao: NacaoId, zona: ZonaDePouso, raio: number): Criacao {
  return { unidade: 'hover_scout', nacao, ...emVoltaDa(zona, raio)(-18, 14) };
}

/** Ponto de patrulha do patrulheiro (do outro lado da Nave). */
export function destinoDaPatrulha(zona: ZonaDePouso, raio: number): Vec3 {
  return emVoltaDa(zona, raio)(-18, -14).d;
}

export function cenaDaNacao(
  nacao: NacaoId,
  zona: ZonaDePouso,
  raio: number,
  unidadesExtras = 0,
): Criacao[] {
  const em = emVoltaDa(zona, raio);
  const criacoes: Criacao[] = [{ estrutura: 'ship', nacao, ...em(0, 0) }];
  // A Base da cena já vem com o satélite impresso (D-55), para mostrar a órbita.
  for (const [tipo, u, v] of ESTRUTURAS) {
    criacoes.push({
      estrutura: tipo,
      nacao,
      ...em(u, v),
      ...(tipo === 'satellite_uplink' ? { comSatelite: true } : {}),
    });
  }
  for (const [u, v] of EXPLORADORES)
    criacoes.push({ unidade: 'hover_explorer', nacao, ...em(u, v) });
  UNIDADES.forEach((tipo, k) => {
    criacoes.push({ unidade: tipo, nacao, ...em(16 + (k % 5) * 4.5, -12 + Math.floor(k / 5) * 6) });
  });
  // Extras (teste de carga) em anéis dentro do platô, a 4,5 m uns dos outros.
  let k = 0;
  for (let anel = 36; k < unidadesExtras; anel += 5) {
    const cabem = Math.floor((2 * Math.PI * anel) / 4.5);
    for (let i = 0; i < cabem && k < unidadesExtras; i++, k++) {
      const t = (2 * Math.PI * i) / cabem;
      const tipo = UNIDADES[k % UNIDADES.length]!;
      criacoes.push({ unidade: tipo, nacao, ...em(Math.cos(t) * anel, Math.sin(t) * anel) });
    }
  }
  return criacoes;
}
