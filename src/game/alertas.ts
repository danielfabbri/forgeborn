/**
 * Alertas (UI-06, AUD-05, `dados:alertas`): junta os alertas que a simulação emite com os que
 * dependem do que o jogador vê (dano fora da tela, rede em déficit, corpos na Reserva, hovers
 * ociosos), aplica o `cooldown_s` de cada um e guarda a pilha para o HUD. Só leitura do estado.
 */
import { type EntityId, getComponent, type NacaoId, type SimEvent, type SimState } from '../sim';
import { dados } from '../sim/data';
import type { Vec3 } from '../sim/map/esfera';
import { direcaoDe } from '../sim/units/superficie';

export type Prioridade = 'baixa' | 'media' | 'alta' | 'critica';

export interface Alerta {
  /** Número de ordem (chave da pilha). */
  seq: number;
  id: string;
  prioridade: Prioridade;
  /** Variáveis do texto (`alerta.AL-NN` no i18n). */
  vars: Record<string, string | number>;
  /** Onde aconteceu, para o clique e o Espaço levarem a câmera; null sem lugar. */
  local: Vec3 | null;
  /** Tempo de jogo (s) em que apareceu. */
  t_s: number;
}

/** UI-06: até 5 alertas visíveis. */
export const MAX_VISIVEIS = 5;

const TABELA = new Map(dados.alertas.map((a) => [a.id, a]));

export interface OpcoesDaCentral {
  jogador: NacaoId;
  /** O corpo está na tela agora? (AL-01 e AL-02 só valem fora dela.) */
  naTela: (id: EntityId) => boolean;
}

export class CentralDeAlertas {
  readonly pilha: Alerta[] = [];
  private seq = 0;
  private readonly ultimo = new Map<string, number>();
  private emDeficit = false;
  private naReserva = new Set<EntityId>();
  private ociosos = new Set<EntityId>();

  constructor(private readonly o: OpcoesDaCentral) {}

  /** O alerta mais recente com lugar (Espaço, UI-06). */
  get ultimoComLocal(): Alerta | null {
    for (let k = this.pilha.length - 1; k >= 0; k--)
      if (this.pilha[k]!.local) return this.pilha[k]!;
    return null;
  }

  /** Tenta publicar; respeita o `cooldown_s` (AUD-05). Devolve o alerta ou null. */
  private publicar(
    id: string,
    t_s: number,
    vars: Record<string, string | number> = {},
    local: Vec3 | null = null,
  ): Alerta | null {
    const linha = TABELA.get(id as never);
    if (!linha) return null;
    const antes = this.ultimo.get(id);
    if (antes !== undefined && t_s - antes < linha.cooldown_s - 1e-9) return null;
    this.ultimo.set(id, t_s);
    const alerta: Alerta = {
      seq: ++this.seq,
      id,
      prioridade: linha.prioridade as Prioridade,
      vars,
      local,
      t_s,
    };
    this.pilha.push(alerta);
    if (this.pilha.length > 50) this.pilha.shift();
    return alerta;
  }

  /** Processa os eventos de um tick e o estado; devolve os alertas novos. */
  processar(eventos: readonly SimEvent[], state: SimState, t_s: number): Alerta[] {
    const { jogador } = this.o;
    const novos: Alerta[] = [];
    const add = (a: Alerta | null) => a && novos.push(a);
    const dono = (id: EntityId) => getComponent(state, id, 'owner')?.nacao;
    const lugar = (id: EntityId): Vec3 | null => {
      const p = getComponent(state, id, 'position');
      return p ? direcaoDe(p) : null;
    };

    for (const e of eventos) {
      const d = e.dados as Record<string, unknown>;
      if (e.tipo === 'alerta') {
        if (d.nacao !== jogador) continue;
        const vars: Record<string, string | number> = {};
        for (const [k, v] of Object.entries(d)) {
          if (typeof v === 'string' || typeof v === 'number') vars[k] = v;
        }
        if (d.faltam && typeof d.faltam === 'object') vars.faltam = JSON.stringify(d.faltam);
        add(this.publicar(d.id as string, t_s, vars, (d.d as Vec3 | undefined) ?? null));
      } else if (e.tipo === 'dano') {
        // AL-14 (a Nave, sempre), AL-01 (unidade) e AL-02 (estrutura) fora da tela.
        const alvo = d.alvo as EntityId;
        if (dono(alvo) !== jogador) continue;
        const estrutura = getComponent(state, alvo, 'structure');
        if (estrutura?.tipo === 'ship') add(this.publicar('AL-14', t_s, {}, lugar(alvo)));
        else if (this.o.naTela(alvo)) continue;
        else if (estrutura) add(this.publicar('AL-02', t_s, {}, lugar(alvo)));
        else if (getComponent(state, alvo, 'unit'))
          add(this.publicar('AL-01', t_s, {}, lugar(alvo)));
      } else if (e.tipo === 'impresso' && d.nacao === jogador) {
        // AL-05: item de fila concluído.
        add(this.publicar('AL-05', t_s, { item: d.tipo as string }, lugar(d.id as EntityId)));
      } else if (e.tipo === 'estrutura_concluida' && dono(d.id as EntityId) === jogador) {
        add(this.publicar('AL-05', t_s, { item: d.tipo as string }, lugar(d.id as EntityId)));
      }
    }

    // AL-04: a rede entrou em racionamento.
    const deficit = state.energia[jogador]?.racionamento ?? false;
    if (deficit && !this.emDeficit) add(this.publicar('AL-04', t_s));
    this.emDeficit = deficit;

    // AL-08: corpos que entraram agora no Modo Reserva; AL-09: hovers que ficaram ociosos.
    const reserva = new Set<EntityId>();
    const ociosos = new Set<EntityId>();
    for (const id of state.entities) {
      if (dono(id) !== jogador) continue;
      const bateria = getComponent(state, id, 'bateria');
      if (bateria && bateria.en <= 1e-9) reserva.add(id);
      const coleta = getComponent(state, id, 'coleta');
      if (
        coleta &&
        coleta.estado === 'ocioso' &&
        getComponent(state, id, 'order')?.tipo === 'nenhuma' &&
        !getComponent(state, id, 'pilotado') &&
        !getComponent(state, id, 'locomotion')?.destino
      ) {
        ociosos.add(id);
      }
    }
    const entraram = [...reserva].filter((id) => !this.naReserva.has(id));
    if (entraram.length > 0) {
      add(this.publicar('AL-08', t_s, { n: entraram.length }, lugar(entraram[0]!)));
    }
    const pararam = [...ociosos].filter((id) => !this.ociosos.has(id));
    if (pararam.length > 0) add(this.publicar('AL-09', t_s, {}, lugar(pararam[0]!)));
    this.naReserva = reserva;
    this.ociosos = ociosos;
    return novos;
  }

  /** Os visíveis agora: os mais recentes, até MAX_VISIVEIS, dentro de `duracao_s`. */
  visiveis(t_s: number, duracao_s: number): Alerta[] {
    return this.pilha
      .filter((a) => t_s - a.t_s <= duracao_s)
      .slice(-MAX_VISIVEIS)
      .reverse();
  }
}
