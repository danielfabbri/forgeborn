/**
 * Resumo da seleção para o painel (UI-03, UI-13): um corpo (retrato, HP, EN, estado, carga,
 * arma), vários corpos agrupados por tipo com mini-barras, ou uma jazida.
 */
import { corDaNacao } from './paleta';
import { dados, type EntityId, getComponent, param, type SimState } from '../sim';
import { cargaDoSilo } from '../sim/economia/estoque';
import type { EstadoDaSelecao } from '../ui/hud';
import { estadoDaUnidade, resumoDaJazida } from './hud';
import { cabosDe, leituraDaRedeDe, precisaDeEnergia } from '../sim/energia';

function modeloDe(state: SimState, id: EntityId): string | null {
  if (getComponent(state, id, 'satelite')) return 'satellite';
  return (
    getComponent(state, id, 'unit')?.tipo ?? getComponent(state, id, 'structure')?.tipo ?? null
  );
}

/** HP do corpo; o satélite (D-51) guarda o dele no próprio componente. */
function vidaDe(state: SimState, id: EntityId): { hp: number; max: number } | undefined {
  return getComponent(state, id, 'vida') ?? getComponent(state, id, 'satelite');
}

function armaDe(modelo: string): { dano: number; alcance: number } | null {
  if (modelo === 'satellite') {
    const laser = dados.armas.find((a) => a.id === 'sat_laser')!;
    return { dano: laser.dano, alcance: laser.alcance_m };
  }
  const linha =
    dados.moveis.find((m) => m.id === modelo) ?? dados.estruturas.find((e) => e.id === modelo);
  const arma = linha?.arma ? dados.armas.find((a) => a.id === linha.arma) : undefined;
  return arma ? { dano: arma.dano, alcance: arma.alcance_m } : null;
}

function cargaDe(state: SimState, id: EntityId) {
  const coleta = getComponent(state, id, 'coleta');
  if (coleta) {
    return { atual: coleta.carga, max: param('carga_hover_u'), recurso: coleta.cargaRecurso };
  }
  const silo = getComponent(state, id, 'silo');
  if (silo) return { atual: cargaDoSilo(silo), max: param('capacidade_silo_u'), recurso: null };
  return null;
}

/** UNI-20 (D-90): embarcadas no Transporte, ou null. */
function passageirosDe(state: SimState, id: EntityId): { n: number; max: number } | null {
  const carga = getComponent(state, id, 'transporte');
  return carga ? { n: carga.passageiros.length, max: param('transporte_capacidade') } : null;
}

export function resumoDaSelecao(state: SimState, selecao: readonly EntityId[]): EstadoDaSelecao {
  if (selecao.length === 1) {
    const jazida = resumoDaJazida(state, selecao[0]!);
    if (jazida) return { tipo: 'jazida', ...jazida };
  }
  const corpos = selecao.filter((id) => modeloDe(state, id) && vidaDe(state, id));
  if (corpos.length === 0) return { tipo: 'nenhum' };
  if (corpos.length === 1) {
    const id = corpos[0]!;
    const modelo = modeloDe(state, id)!;
    const vida = vidaDe(state, id)!;
    const bateria = getComponent(state, id, 'bateria');
    const nacao = getComponent(state, id, 'owner')?.nacao;
    return {
      tipo: 'corpo',
      id,
      modelo,
      cor: corDaNacao(nacao),
      hp: vida.hp,
      hpMax: vida.max,
      en: bateria ? { atual: bateria.en, max: bateria.max } : null,
      estado: estadoDaUnidade(state, id),
      carga: cargaDe(state, id),
      arma: armaDe(modelo),
      postura: getComponent(state, id, 'arma')?.postura ?? null,
      ...redeDoPainel(state, id),
      passageiros: passageirosDe(state, id),
    };
  }
  const grupos = new Map<string, { modelo: string; ids: EntityId[]; hp: number[] }>();
  for (const id of corpos) {
    const modelo = modeloDe(state, id)!;
    let grupo = grupos.get(modelo);
    if (!grupo) grupos.set(modelo, (grupo = { modelo, ids: [], hp: [] }));
    const vida = vidaDe(state, id)!;
    grupo.ids.push(id);
    grupo.hp.push(vida.hp / vida.max);
  }
  return { tipo: 'grupo', grupos: [...grupos.values()] };
}

/** ENE-22/ENE-25 (D-85): a rede da estrutura no painel (só as que usam energia) e os cabos. */
function redeDoPainel(
  state: SimState,
  id: EntityId,
): Pick<Extract<EstadoDaSelecao, { tipo: 'corpo' }>, 'rede' | 'cabos'> {
  if (!getComponent(state, id, 'structure') || getComponent(state, id, 'obra')) return {};
  const cabos = cabosDe(state, id).length;
  if (!precisaDeEnergia(state, id)) return { rede: null, cabos };
  const leitura = leituraDaRedeDe(state, id);
  return { rede: leitura && leitura.membros > 1 ? leitura : 'sem_rede', cabos };
}
