/**
 * Leituras do HUD a partir do estado (só leitura): estado de cada unidade para o painel de
 * seleção (UI-03), barras sobre as unidades (UI-07), relógio da barra superior (UI-01) e o
 * resumo de jazidas (UI-13).
 */
import { type EntityId, entitiesWith, getComponent, param, type SimState } from '../sim';
import { estadoDaBateria } from '../sim/energia';

/** Chave i18n do que a unidade está fazendo (`estado.*`). */
export function estadoDaUnidade(state: SimState, id: EntityId): string {
  const obra = getComponent(state, id, 'obra');
  if (obra) return obra.instalada ? 'estado.em_obra' : 'estado.reservada';
  // D-51: satélite subindo, reposicionando ou parado em órbita.
  const satelite = getComponent(state, id, 'satelite');
  if (satelite) {
    if (satelite.estado === 'lancando') return 'estado.lancando';
    if (satelite.alvo !== null) return 'estado.atacando';
    return satelite.destino ? 'estado.reposicionando' : 'estado.em_orbita';
  }
  // CMB-28: hover recolhido; UNI-09: portão.
  const abrigo = getComponent(state, id, 'abrigo');
  if (abrigo) return abrigo.estado === 'dentro' ? 'estado.abrigado' : 'estado.indo_abrigo';
  const portao = getComponent(state, id, 'portao');
  if (portao) {
    if (portao.trancado) return 'estado.portao_trancado';
    return portao.abertura > 0 ? 'estado.portao_aberto' : 'estado.portao_fechado';
  }
  const bateria = getComponent(state, id, 'bateria');
  const recarga = getComponent(state, id, 'recarga');
  if (recarga?.estado === 'indo') return 'estado.indo_recarregar';
  if (recarga?.estado === 'fila') return 'estado.fila_recarga';
  if (recarga?.estado === 'acoplada') return 'estado.recarregando';
  if (bateria && estadoDaBateria(bateria) === 'reserva') return 'estado.reserva';
  if (getComponent(state, id, 'fuga')) return 'estado.fugindo';
  const trabalho = getComponent(state, id, 'trabalho');
  if (trabalho) {
    if (trabalho.tipo === 'construir') return 'estado.construindo';
    return trabalho.tipo === 'reparar' ? 'estado.reparando' : 'estado.reciclando';
  }
  if ((getComponent(state, id, 'lancaMinas')?.plantios.length ?? 0) > 0) return 'estado.plantando';
  const producer = getComponent(state, id, 'producer');
  const item = producer?.fila[0];
  if (item) return item.obra !== null ? 'estado.construindo' : 'estado.imprimindo';
  const coleta = getComponent(state, id, 'coleta');
  if (coleta && coleta.estado !== 'ocioso') return `estado.${coleta.estado}`;
  const silo = getComponent(state, id, 'silo');
  if (silo && silo.estado !== 'solto') return `estado.silo_${silo.estado}`;
  const air = getComponent(state, id, 'air');
  if (air?.estado === 'pousado') return 'estado.pousado';
  const ordem = getComponent(state, id, 'order')?.tipo;
  if (ordem === 'mover') return 'estado.movendo';
  if (ordem === 'mover_ignorando') return 'estado.movendo_ignorando';
  if (ordem === 'atacar_mover') return 'estado.ataque_movimento';
  if (ordem === 'atacar' || getComponent(state, id, 'arma')?.alvo != null) return 'estado.atacando';
  if (ordem === 'patrulhar') return 'estado.patrulhando';
  if (ordem === 'manter') return 'estado.mantendo';
  return 'estado.ocioso';
}

export interface Barras {
  /** Fração de HP (0..1), ou null se não mostra. */
  hp: number | null;
  /** Fração de EN (0..1), ou null (estruturas não têm bateria). */
  en: number | null;
}

/**
 * UI-07: no modo automático, barras em corpos selecionados, danificados ou com bateria Baixa;
 * no modo "sempre", em todos.
 */
export function barrasDe(
  state: SimState,
  id: EntityId,
  selecionado: boolean,
  sempre: boolean,
): Barras | null {
  // D-51: o satélite guarda o HP no próprio componente.
  const vida = getComponent(state, id, 'vida') ?? getComponent(state, id, 'satelite');
  if (!vida) return null;
  const bateria = getComponent(state, id, 'bateria');
  // UI-07 (D-61): no modo automático, só as selecionadas.
  if (!sempre && !selecionado) return null;
  return {
    hp: Math.max(0, Math.min(1, vida.hp / vida.max)),
    en: bateria ? Math.max(0, Math.min(1, bateria.en / bateria.max)) : null,
  };
}

/** UI-07: cor da barra de HP, de verde (cheia) a amarelo e vermelho (vazia). */
export function corDoHp(fracao: number): [number, number, number] {
  const verde: [number, number, number] = [0.27, 0.88, 0.54];
  const amarelo: [number, number, number] = [0.98, 0.8, 0.25];
  const vermelho: [number, number, number] = [1, 0.3, 0.3];
  const mistura = (a: number[], b: number[], t: number) =>
    a.map((v, k) => v + (b[k]! - v) * t) as [number, number, number];
  return fracao >= 0.5
    ? mistura(amarelo, verde, (fracao - 0.5) / 0.5)
    : mistura(vermelho, amarelo, fracao / 0.5);
}

/** UI-01: relógio da partida (m:ss) a partir do tick. */
export function relogio(tick: number, tickHz: number): string {
  const total = Math.floor(tick / tickHz);
  const min = Math.floor(total / 60);
  const seg = total % 60;
  return `${min}:${seg.toString().padStart(2, '0')}`;
}

/** UI-01: corpos da nação (unidades móveis, REG-16) e o limite. */
export function corpos(state: SimState, nacao: string): { n: number; limite: number } {
  const n = entitiesWith(state, 'unit', 'owner').filter(
    (id) => getComponent(state, id, 'owner')!.nacao === nacao,
  ).length;
  return { n, limite: param('limite_corpos') };
}

/** UI-13: recurso, restante/inicial e hovers designados da jazida. */
export function resumoDaJazida(
  state: SimState,
  id: EntityId,
): { recurso: string; quantidade: number; inicial: number; hovers: number } | null {
  const jazida = getComponent(state, id, 'jazida');
  if (!jazida) return null;
  const hovers = entitiesWith(state, 'coleta').filter(
    (h) => getComponent(state, h, 'coleta')!.jazida === id,
  ).length;
  return {
    recurso: jazida.recurso,
    quantidade: jazida.quantidade,
    inicial: jazida.inicial,
    hovers,
  };
}
