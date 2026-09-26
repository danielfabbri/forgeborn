/**
 * Criação de corpos com os limites da nação (REG-16 a REG-19). Toda criação passa por aqui:
 * uma ordem que excede um limite é recusada e emite o alerta AL-11.
 */
import { obstaculoDaEstrutura } from './segmentos';
import { createEntity, entitiesWith, getComponent, setComponent } from '../core/entities';
import type { SystemContext } from '../core/pipeline';
import type { EntityId, NacaoId } from '../core/types';
import { type ArmasId, type EstruturasId, type MoveisId, param } from '../data';
import { norteEm, type Vec3 } from '../map/esfera';
import { bateriaInicial } from '../energia/bateria';
import { ALTURA_HOVER_M, altitudeDrone, ehAerea, statsEstrutura, statsMovel } from './stats';
import { chaoEm, type Posicao, posicionar } from './superficie';

export type Limite = 'limite_corpos' | 'limite_bases_lancamento' | 'limite_minas_ativas';

function contar(ctx: SystemContext, nacao: NacaoId, limite: Limite): number {
  const { state } = ctx;
  const daNacao = (id: EntityId) => getComponent(state, id, 'owner')?.nacao === nacao;
  switch (limite) {
    case 'limite_corpos':
      return entitiesWith(state, 'unit', 'owner').filter(daNacao).length;
    case 'limite_bases_lancamento':
      return entitiesWith(state, 'structure', 'owner').filter(
        (id) => daNacao(id) && getComponent(state, id, 'structure')!.tipo === 'satellite_uplink',
      ).length;
    case 'limite_minas_ativas':
      return entitiesWith(state, 'mine', 'owner').filter(daNacao).length;
  }
}

/** REG-19: true se cabe mais um; senão emite AL-11 e devolve false. */
export function dentroDoLimite(ctx: SystemContext, nacao: NacaoId, limite: Limite): boolean {
  if (contar(ctx, nacao, limite) < param(limite)) return true;
  ctx.emit('alerta', { id: 'AL-11', nacao, limite });
  return false;
}

const NUNCA_S = 1e9;

/** Estado de combate de todo corpo com HP (ENE-15, ECO-13, CMB-12). */
function comecarCombate(ctx: SystemContext, id: EntityId): void {
  // "Nunca": um tempo finito enorme, para o estado seguir serializável em JSON (TEC-08).
  setComponent(ctx.state, id, 'combate', {
    semCombate_s: NUNCA_S,
    semDano_s: NUNCA_S,
    ultimoAtacante: null,
    ultimoDanoNacao: null,
  });
}

/** §8.6: armadas começam Agressivas; estruturas não têm postura. */
function armar(ctx: SystemContext, id: EntityId, arma: string | null, movel: boolean): void {
  if (!arma) return;
  setComponent(ctx.state, id, 'arma', {
    id: arma as ArmasId,
    recarga_s: 0,
    alvo: null,
    postura: movel ? 'agressiva' : null,
    origem: null,
    perseguindo: null,
    alvoDireto: null,
    retomar: null,
    demanda_en_s: 0,
    atendido: 1,
  });
}

/** REG-09: a nação passa a contar para a eliminação quando tem Nave ou Impressora. */
function marcarPresente(ctx: SystemContext, nacao: NacaoId): void {
  const placar = ctx.state.placar[nacao];
  if (placar) placar.presente = true;
}

function posicao(ctx: SystemContext, d: Vec3, altura: number): Posicao {
  const pos = { x: 0, y: 0, z: 0 };
  posicionar(ctx, pos, d, altura);
  return pos;
}

export function criarUnidade(
  ctx: SystemContext,
  nacao: NacaoId,
  tipo: MoveisId,
  d: Vec3,
): EntityId | null {
  if (!dentroDoLimite(ctx, nacao, 'limite_corpos')) return null;
  const { state } = ctx;
  const id = createEntity(state);
  const aerea = ehAerea(tipo);
  setComponent(state, id, 'owner', { nacao });
  setComponent(state, id, 'unit', { tipo });
  setComponent(
    state,
    id,
    'position',
    posicao(ctx, d, aerea ? altitudeDrone() : chaoEm(ctx, d) + ALTURA_HOVER_M),
  );
  setComponent(state, id, 'locomotion', {
    // Nasce olhando para o norte local (CEN-15).
    rumo: norteEm(d),
    speed: 0,
    rota: [],
    destino: null,
    fluxo: null,
    limiteVel: null,
    ocioso_s: 0,
    travado_s: 0,
    ancora: null,
  });
  setComponent(state, id, 'order', { tipo: 'nenhuma', patrulha: null });
  const hp = statsMovel(tipo).hp;
  setComponent(state, id, 'vida', { hp, max: hp });
  comecarCombate(ctx, id);
  armar(ctx, id, statsMovel(tipo).arma, true);
  if (tipo === 'printer') marcarPresente(ctx, nacao);
  if (tipo === 'hover_minelayer') {
    setComponent(state, id, 'lancaMinas', {
      carregador: 0,
      fabricando: null,
      plantios: [],
      plantio_s: 0,
    });
  }
  // ENE-08: sai da impressão com a bateria cheia (a Bateria Móvel, com parte).
  setComponent(state, id, 'bateria', {
    ...bateriaInicial(tipo),
    autoRecarga: true,
    recebendo: false,
  });
  setComponent(state, id, 'recarga', {
    estado: 'nenhuma',
    estrutura: null,
    retorno: null,
    automatica: false,
  });
  if (tipo === 'mobile_battery') setComponent(state, id, 'suporte', { ligado: true, alvos: [] });
  if (aerea) setComponent(state, id, 'air', { estado: 'voando', timer_s: 0 });
  if (tipo === 'printer') setComponent(state, id, 'producer', { pontoDeEncontro: null, fila: [] });
  if (tipo === 'hover_explorer') {
    // Recém-impresso: ocioso para a Diretiva de Coleta (ECO-19).
    setComponent(state, id, 'coleta', {
      estado: 'ocioso',
      jazida: null,
      recurso: null,
      carga: 0,
      cargaRecurso: null,
      entrega: null,
      timer_s: 0,
      manual: false,
      sucata: null,
    });
    getComponent(state, id, 'order')!.tipo = 'tarefa';
  }
  if (tipo === 'mobile_silo') {
    setComponent(state, id, 'silo', {
      estado: 'solto',
      timer_s: 0,
      carga: {},
      ancora: null,
      cicloAutomatico: true,
      limiar_pct: param('limiar_ciclo_silo_pct'),
      entrega: null,
    });
  }
  return id;
}

/** Círculo que cobre a pegada quadrada (MOV-04); é a borda usada nas distâncias (D-28, D-29). */
export function raioDaPegada(tipo: EstruturasId): number {
  return (statsEstrutura(tipo).pegada_m / 2) * Math.SQRT2;
}

/** Estrutura pronta (cena de depuração, início de partida). */
export function criarEstrutura(
  ctx: SystemContext,
  nacao: NacaoId,
  tipo: EstruturasId,
  d: Vec3,
  /** D-56: rumo do segmento (Muro, Portão). */
  rumo: Vec3 | null = null,
): EntityId | null {
  const id = reservarEstrutura(ctx, nacao, tipo, d);
  if (id === null) return null;
  if (rumo) getComponent(ctx.state, id, 'structure')!.rumo = rumo;
  instalarEstrutura(ctx, id);
  const vida = getComponent(ctx.state, id, 'vida')!;
  vida.hp = vida.max;
  ativarEstrutura(ctx, id);
  return id;
}

/**
 * Corpo da estrutura sem obstáculo, HP nem funções: a pegada reservada entre posicionar e
 * instalar o canteiro (D-29).
 */
export function reservarEstrutura(
  ctx: SystemContext,
  nacao: NacaoId,
  tipo: EstruturasId,
  d: Vec3,
): EntityId | null {
  if (tipo === 'satellite_uplink' && !dentroDoLimite(ctx, nacao, 'limite_bases_lancamento')) {
    return null;
  }
  const { state } = ctx;
  const id = createEntity(state);
  setComponent(state, id, 'owner', { nacao });
  setComponent(state, id, 'structure', { tipo });
  setComponent(state, id, 'position', posicao(ctx, d, chaoEm(ctx, d)));
  return id;
}

/** Canteiro instalado (PRD-11): vira obstáculo e ganha `hp_inicial_canteiro_pct`% do HP. */
export function instalarEstrutura(ctx: SystemContext, id: EntityId): void {
  const { state } = ctx;
  const tipo = getComponent(state, id, 'structure')!.tipo;
  setComponent(state, id, 'obstacle', obstaculoDaEstrutura(state, id, raioDaPegada(tipo)));
  const max = statsEstrutura(tipo).hp;
  setComponent(state, id, 'vida', { hp: (max * param('hp_inicial_canteiro_pct')) / 100, max });
  comecarCombate(ctx, id);
  state.versaoObstaculos++;
}

/** Estrutura a 100% ganha as funções (PRD-12). */
export function ativarEstrutura(ctx: SystemContext, id: EntityId): void {
  const { state } = ctx;
  const tipo = getComponent(state, id, 'structure')!.tipo;
  // PRD-12: a arma só funciona com a estrutura pronta.
  // A Antiaérea dispara pelo sistema dela (UNI-12), não pelo das armas.
  if (tipo !== 'aa_battery') armar(ctx, id, statsEstrutura(tipo).arma, false);
  if (tipo === 'ship') {
    marcarPresente(ctx, getComponent(state, id, 'owner')!.nacao);
    setComponent(state, id, 'producer', { pontoDeEncontro: null, fila: [] });
    // ENE-03/ENE-04: a impressão na Nave consome da rede com prioridade 3.
    setComponent(state, id, 'consumidor', {
      prioridade: 3,
      demanda_en_s: 0,
      atendido: 1,
      offline: false,
    });
  }
  // ENE-12: portas de recarga (Nave e usinas).
  const portas = statsEstrutura(tipo).portas;
  if (portas > 0) {
    setComponent(state, id, 'portas', {
      ocupantes: Array.from({ length: portas }, () => null),
      fila: [],
    });
  }
  // UNI-04 (D-55): a Base de Lançamento imprime o Satélite com a energia da rede (PRD-06).
  if (tipo === 'satellite_uplink') {
    setComponent(state, id, 'producer', { pontoDeEncontro: null, fila: [] });
    setComponent(state, id, 'consumidor', {
      prioridade: 3,
      demanda_en_s: 0,
      atendido: 1,
      offline: false,
    });
  }
  // UNI-10 (D-63): a Base de Lança-Mísseis fabrica mísseis com a energia da rede.
  if (tipo === 'missile_silo') {
    setComponent(state, id, 'producer', { pontoDeEncontro: null, fila: [] });
    setComponent(state, id, 'consumidor', {
      prioridade: 3,
      demanda_en_s: 0,
      atendido: 1,
      offline: false,
    });
    setComponent(state, id, 'lancador', { prontos: [], recarga_s: 0 });
  }
  // UNI-12/UNI-13 (D-64, D-65): antiaérea e campo magnético têm sistemas próprios.
  if (tipo === 'aa_battery') setComponent(state, id, 'antiaerea', { recarga_s: 0 });
  if (tipo === 'mag_tower') setComponent(state, id, 'magnetico', { banco: 0, ativo: false });
  // UNI-09: o Portão nasce fechado e destrancado.
  if (tipo === 'gate') {
    setComponent(state, id, 'portao', { abertura: 0, trancado: false, semUnidade_s: 0 });
  }
  // ENE-06: a Usina Nuclear nasce ligada e se abastece no primeiro tick.
  if (tipo === 'nuclear_plant') {
    setComponent(state, id, 'reator', {
      ligado: true,
      ciclo_s: 0,
      religando_s: 0,
      semUranio: false,
    });
  }
}

export function criarMina(ctx: SystemContext, nacao: NacaoId, d: Vec3): EntityId | null {
  if (!dentroDoLimite(ctx, nacao, 'limite_minas_ativas')) return null;
  const { state } = ctx;
  const id = createEntity(state);
  setComponent(state, id, 'owner', { nacao });
  setComponent(state, id, 'mine', { armada: false, timer_s: param('tempo_armar_mina_s') });
  setComponent(state, id, 'vida', { hp: param('mina_hp'), max: param('mina_hp') });
  setComponent(state, id, 'position', posicao(ctx, d, chaoEm(ctx, d)));
  return id;
}
