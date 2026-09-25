/**
 * Morte, destroços, explosões ambientais, eliminação e fim de partida (sistema `morte`).
 *
 * CMB-27: com HP ≤ 0 o corpo é destruído na hora e deixa destroço (ECO-27). A Bateria Móvel, a
 * Usina Nuclear e a Nave explodem (CMB-23 a CMB-26), e a nuclear deixa radiação. REG-09: sem
 * Nave e sem Impressora a nação é eliminada, e os corpos dela se desligam e explodem sem dano ao
 * longo de 5 s (REG-10). REG-11: vence a última; REG-12: no tempo limite, a maior pontuação.
 */
import { contar } from '../core/estatisticas';
import {
  createEntity,
  destroyEntity,
  entitiesWith,
  getComponent,
  setComponent,
} from '../core/entities';
import type { CommandHandler, SystemContext } from '../core/pipeline';
import type { SimState } from '../core/state';
import type { EntityId, NacaoId } from '../core/types';
import { dados, param, type RecursosId } from '../data';
import { cargaDoSilo } from '../economia/estoque';
import type { Vec3 } from '../map/esfera';
import { abandonarObra } from '../producao/obra';
import { chaoEm, direcaoDe, posicionar } from '../units/superficie';
import { danoEmArea } from './dano';

/** REG-10: a autodestruição da nação eliminada se espalha por 5 s. */
const AUTODESTRUICAO_S = 5;

const custos = new Map(dados.custos.map((c) => [c.id as string, c]));
const RECURSOS = dados.recursos.map((r) => r.id);

function tipoDe(state: SimState, id: EntityId): string | null {
  return (
    getComponent(state, id, 'unit')?.tipo ??
    getComponent(state, id, 'structure')?.tipo ??
    (getComponent(state, id, 'mine') ? 'mine' : null)
  );
}

/** VR do corpo (`dados:custos`); a Nave não tem custo (REG-15). */
function vrDe(tipo: string): number {
  return custos.get(tipo)?.vr ?? 0;
}

/** REG-22: pontuação da nação. */
export function pontuacao(state: SimState, nacao: NacaoId): number {
  const placar = state.placar[nacao];
  if (!placar) return 0;
  let estruturas = 0;
  for (const id of entitiesWith(state, 'structure', 'owner')) {
    if (getComponent(state, id, 'owner')!.nacao !== nacao) continue;
    estruturas += vrDe(getComponent(state, id, 'structure')!.tipo);
  }
  return (
    placar.vrColetado * param('pontos_por_vr_coletado') +
    placar.vrDestruido * param('pontos_por_vr_destruido') +
    (estruturas * param('pontos_estruturas_vivas_pct')) / 100 +
    placar.navesDestruidas * param('bonus_nave_destruida') +
    (state.resultado?.vencedor === nacao ? param('bonus_vitoria') : 0)
  );
}

/** VR das estruturas vivas (desempate de REG-12). */
function vrEstruturas(state: SimState, nacao: NacaoId): number {
  return entitiesWith(state, 'structure', 'owner')
    .filter((id) => getComponent(state, id, 'owner')!.nacao === nacao)
    .reduce((s, id) => s + vrDe(getComponent(state, id, 'structure')!.tipo), 0);
}

/** ECO-26/ECO-27: composição do destroço. */
function composicaoDoDestroco(state: SimState, id: EntityId, tipo: string) {
  const composicao: Partial<Record<RecursosId, number>> = {};
  if (tipo === 'ship') {
    for (const r of RECURSOS) {
      const chave = `destroco_nave_${r}`;
      if (dados.parametros.some((p) => p.chave === chave)) composicao[r] = param(chave as never);
    }
    return composicao;
  }
  const custo = custos.get(tipo);
  const pct = param('rendimento_destroco_pct') / 100;
  for (const r of RECURSOS) {
    const u = Math.floor((custo?.[r] ?? 0) * pct);
    if (u > 0) composicao[r] = u;
  }
  const silo = getComponent(state, id, 'silo');
  if (silo && cargaDoSilo(silo) > 0) {
    const pctCarga = param('rendimento_carga_silo_pct') / 100;
    for (const [r, u] of Object.entries(silo.carga) as Array<[RecursosId, number]>) {
      const parte = Math.floor(u * pctCarga);
      if (parte > 0) composicao[r] = (composicao[r] ?? 0) + parte;
    }
  }
  return composicao;
}

function criarDestroco(ctx: SystemContext, id: EntityId, tipo: string, d: Vec3): void {
  const composicao = composicaoDoDestroco(ctx.state, id, tipo);
  if (Object.values(composicao).every((u) => !u)) return;
  const estrutura = getComponent(ctx.state, id, 'structure') !== undefined;
  const destroco = createEntity(ctx.state);
  const pos = { x: 0, y: 0, z: 0 };
  posicionar(ctx, pos, d, chaoEm(ctx, d));
  setComponent(ctx.state, destroco, 'position', pos);
  setComponent(ctx.state, destroco, 'destroco', {
    composicao,
    restante_s: param(estrutura ? 'duracao_destroco_estrutura_s' : 'duracao_destroco_unidade_s'),
  });
}

/** CMB-23 a CMB-26: explosões ambientais, que ferem todas as nações (0% na borda, D-32). */
function explodir(ctx: SystemContext, tipo: string, d: Vec3): void {
  const chaves: Record<string, [string, string]> = {
    mobile_battery: ['explosao_bateria_dano', 'explosao_bateria_raio_m'],
    nuclear_plant: ['explosao_nuclear_dano', 'explosao_nuclear_raio_m'],
    ship: ['explosao_nave_dano', 'explosao_nave_raio_m'],
  };
  const par = chaves[tipo];
  if (!par) return;
  const raio = param(par[1] as never);
  danoEmArea(ctx, {
    centro: d,
    raio,
    dano: param(par[0] as never),
    tipo: 'ambiental',
    bordaPct: 0,
    camadas: ['solo', 'ar'],
    atacante: null,
    nacao: null,
  });
  ctx.emit('explosao', { d, raio, arma: tipo });
  if (tipo === 'nuclear_plant') {
    const zona = createEntity(ctx.state);
    const pos = { x: 0, y: 0, z: 0 };
    posicionar(ctx, pos, d, chaoEm(ctx, d));
    setComponent(ctx.state, zona, 'position', pos);
    setComponent(ctx.state, zona, 'radiacao', { restante_s: param('radiacao_duracao_s') });
  }
}

/** Remove o corpo e as referências que só ele segurava. */
function removerCorpo(ctx: SystemContext, id: EntityId): void {
  const { state } = ctx;
  if (getComponent(state, id, 'obra')) abandonarObra(ctx, id);
  // Impressora destruída: as estruturas só reservadas na fila dela somem (já estavam pagas).
  const producer = getComponent(state, id, 'producer');
  for (const item of producer?.fila ?? []) {
    const obra = item.obra !== null ? getComponent(state, item.obra, 'obra') : undefined;
    if (obra && !obra.instalada) destroyEntity(state, item.obra!);
  }
  if (getComponent(state, id, 'obstacle')) state.versaoObstaculos++;
  destroyEntity(state, id);
}

/** CMB-27: destruição de um corpo com HP ≤ 0. */
function morrer(ctx: SystemContext, id: EntityId): void {
  const { state } = ctx;
  const tipo = tipoDe(state, id);
  const nacao = getComponent(state, id, 'owner')?.nacao ?? null;
  const d = direcaoDe(getComponent(state, id, 'position')!);
  const autodestruicao = getComponent(state, id, 'autodestruicao') !== undefined;
  const por = autodestruicao ? null : (getComponent(state, id, 'combate')?.ultimoDanoNacao ?? null);
  if (por && nacao && por !== nacao && tipo) {
    const placar = state.placar[por]!;
    placar.vrDestruido += vrDe(tipo);
    if (tipo === 'ship') placar.navesDestruidas++;
  }
  // REG-23: perdas e abates (a autodestruição da eliminação não conta; minas não são corpos).
  if (tipo && nacao && !autodestruicao && !getComponent(state, id, 'mine')) {
    const movel = getComponent(state, id, 'unit') !== undefined;
    const dono = state.estatisticas[nacao];
    if (dono) contar(movel ? dono.perdidas : dono.estruturasPerdidas, tipo);
    const abatedor = por && por !== nacao ? state.estatisticas[por] : undefined;
    if (abatedor && movel) contar(abatedor.destruidas, tipo);
  }
  ctx.emit('morte', { id, tipo, nacao, por, d });
  if (nacao && getComponent(state, id, 'unit') && !autodestruicao) {
    ctx.emit('alerta', { id: 'AL-18', nacao, unidade: tipo, d });
  }
  if (tipo && !getComponent(state, id, 'mine')) criarDestroco(ctx, id, tipo, d);
  removerCorpo(ctx, id);
  // REG-10/CMB-26: a autodestruição não causa dano.
  if (tipo && !autodestruicao) explodir(ctx, tipo, d);
}

/** REG-09/REG-10/REG-13: elimina a nação; os corpos dela explodem sem dano em 5 s. */
export function eliminar(ctx: SystemContext, nacao: NacaoId): void {
  const { state } = ctx;
  const placar = state.placar[nacao];
  if (!placar || placar.eliminada) return;
  placar.eliminada = true;
  for (const outra of state.nacoes)
    ctx.emit('alerta', { id: 'AL-13', nacao: outra, eliminada: nacao });
  const corpos = entitiesWith(state, 'owner').filter(
    (id) => getComponent(state, id, 'owner')!.nacao === nacao,
  );
  corpos.forEach((id, k) => {
    setComponent(state, id, 'autodestruicao', {
      em_s: ((k + 1) / corpos.length) * AUTODESTRUICAO_S,
    });
  });
}

/** REG-09: sem Nave e sem Impressora pronta. */
function semForja(state: SimState, nacao: NacaoId): boolean {
  return !entitiesWith(state, 'owner').some((id) => {
    if (getComponent(state, id, 'owner')!.nacao !== nacao) return false;
    if (getComponent(state, id, 'autodestruicao')) return false;
    const tipo = tipoDe(state, id);
    if (tipo === 'ship') return !getComponent(state, id, 'obra');
    return tipo === 'printer';
  });
}

function fimDePartida(ctx: SystemContext): void {
  const { state } = ctx;
  if (state.resultado) return;
  const presentes = state.nacoes.filter((n) => state.placar[n]!.presente);
  const vivas = presentes.filter((n) => !state.placar[n]!.eliminada);
  if (presentes.length >= 2 && vivas.length <= 1) {
    state.resultado = { vencedor: vivas[0] ?? null, motivo: 'eliminacao', tick: ctx.tick };
    ctx.emit('fim_de_partida', { ...state.resultado });
    return;
  }
  // REG-12: tempo limite — maior pontuação; empate, mais VR em estruturas vivas.
  if (state.tempoLimite_s !== null && (ctx.tick + 1) * ctx.dt >= state.tempoLimite_s - 1e-9) {
    const ordem = [...vivas].sort(
      (a, b) =>
        pontuacao(state, b) - pontuacao(state, a) ||
        vrEstruturas(state, b) - vrEstruturas(state, a),
    );
    const [primeira, segunda] = ordem;
    const empate =
      primeira !== undefined &&
      segunda !== undefined &&
      pontuacao(state, primeira) === pontuacao(state, segunda) &&
      vrEstruturas(state, primeira) === vrEstruturas(state, segunda);
    state.resultado = {
      vencedor: empate ? null : (primeira ?? null),
      motivo: 'tempo',
      tick: ctx.tick,
    };
    ctx.emit('fim_de_partida', { ...state.resultado });
  }
}

export function sistemaMorte(ctx: SystemContext): void {
  const { state, dt } = ctx;
  for (const id of entitiesWith(state, 'autodestruicao')) {
    const a = getComponent(state, id, 'autodestruicao')!;
    a.em_s -= dt;
    if (a.em_s > 1e-9) continue;
    const vida = getComponent(state, id, 'vida');
    if (vida) vida.hp = 0;
    else removerCorpo(ctx, id);
  }
  // Explosões podem matar outros corpos no mesmo tick (reação em cadeia).
  for (;;) {
    const mortos = entitiesWith(state, 'vida').filter(
      (id) => getComponent(state, id, 'vida')!.hp <= 0,
    );
    if (mortos.length === 0) break;
    for (const id of mortos) {
      if (state.entities.includes(id)) morrer(ctx, id);
    }
  }
  for (const id of entitiesWith(state, 'destroco')) {
    const destroco = getComponent(state, id, 'destroco')!;
    destroco.restante_s -= dt;
    if (destroco.restante_s <= 0) destroyEntity(state, id);
  }
  for (const nacao of state.nacoes) {
    const placar = state.placar[nacao]!;
    if (placar.presente && !placar.eliminada && semForja(state, nacao)) eliminar(ctx, nacao);
  }
  fimDePartida(ctx);
}

export const comandosDeMorte: Record<string, CommandHandler> = {
  /** REG-13: render-se elimina a nação na hora. */
  render_se: (ctx, comando) => eliminar(ctx, comando.nacao),
};
