/**
 * Tutorial da Missão 0 (CAM-05, CAM-07, D-73, D-92): os 10 passos em ordem, cada um com a
 * condição de conclusão lida do estado e dos eventos da simulação (só leitura) e o elemento da
 * interface que o resolve (para o destaque).
 */
import { entitiesWith, getComponent, type NacaoId, param, type SimEvent } from '../sim';
import type { SystemContext } from '../sim/core/pipeline';
import type { Vec3 } from '../sim/map/esfera';
import { direcaoDe, distanciaM } from '../sim/units/superficie';
import { estadoEm, VISIVEL } from '../sim/visao/nevoa';
import { redePrincipal } from '../sim/energia';

export const TOTAL_DE_PASSOS = 10;

/** Seletores (CSS) do que resolve cada passo, para o destaque na interface. */
export const DESTAQUES: Record<number, string[]> = {
  1: ['[data-testid="parados-mineradores"]'],
  2: ['[data-item="hover_explorer"]'],
  3: ['[data-item="printer"]'],
  4: ['[data-item="solar_plant"]', '.abas button:nth-child(2)'],
  5: ['[data-item="storage"]'],
  6: ['[data-item="hover_scout"]'],
  7: ['[data-item="laser_tower"]'],
  8: ['[data-item="wall"]', '[data-item="gate"]'],
  9: ['[data-item="arsenal"]'],
  10: ['[data-item="hover_ex1"]'],
};

function contar(ctx: SystemContext, nacao: NacaoId, tipo: string, prontas = true): number {
  const { state } = ctx;
  return entitiesWith(state, 'owner').filter((id) => {
    if (getComponent(state, id, 'owner')!.nacao !== nacao) return false;
    const t = getComponent(state, id, 'unit')?.tipo ?? getComponent(state, id, 'structure')?.tipo;
    return t === tipo && (!prontas || !getComponent(state, id, 'obra'));
  }).length;
}

export class Tutorial {
  /** Passo atual (1..10); 11 = concluído. */
  passo = 1;
  private entregouFerro = false;
  private ex1Impressos = 0;

  constructor(
    private readonly jogador: NacaoId,
    private readonly marcado: Vec3,
  ) {}

  get concluido(): boolean {
    return this.passo > TOTAL_DE_PASSOS;
  }

  /** O ponto do passo 6 (a zona central mais próxima da Nave). */
  get pontoMarcado(): Vec3 {
    return this.marcado;
  }

  /** Lê os eventos do tick e avança enquanto o passo atual estiver cumprido. */
  atualizar(ctx: SystemContext, eventos: readonly SimEvent[]): boolean {
    for (const e of eventos) {
      const d = e.dados as { nacao?: string; recurso?: string; tipo?: string };
      if (e.tipo === 'entrega' && d.nacao === this.jogador && d.recurso === 'fe') {
        this.entregouFerro = true;
      }
      if (e.tipo === 'impresso' && d.nacao === this.jogador && d.tipo === 'hover_ex1') {
        this.ex1Impressos++;
      }
    }
    const antes = this.passo;
    while (!this.concluido && this.cumprido(ctx, this.passo)) this.passo++;
    return this.passo !== antes;
  }

  private cumprido(ctx: SystemContext, passo: number): boolean {
    const n = this.jogador;
    switch (passo) {
      case 1:
        return this.entregouFerro;
      case 2:
        return contar(ctx, n, 'hover_explorer') >= 2;
      case 3:
        return contar(ctx, n, 'printer') >= 1;
      case 4:
        // D-85: pronta e ligada por cabo à rede da Nave.
        return redePrincipal(ctx.state, n).some(
          (id) => getComponent(ctx.state, id, 'structure')!.tipo === 'solar_plant',
        );
      case 5:
        return this.armazemPertoDoCobre(ctx);
      case 6:
        return contar(ctx, n, 'hover_scout') >= 1 && estadoEm(ctx, n, this.marcado) === VISIVEL;
      case 7:
        return contar(ctx, n, 'laser_tower') >= 1;
      case 8:
        return contar(ctx, n, 'wall') >= 1 && contar(ctx, n, 'gate') >= 1;
      case 9:
        // D-92: pronta e ligada por cabo à rede da Nave (como o passo 4 da Usina Solar).
        return redePrincipal(ctx.state, n).some(
          (id) => getComponent(ctx.state, id, 'structure')!.tipo === 'arsenal',
        );
      case 10:
        return this.ex1Impressos >= 2 && ctx.state.resultado?.vencedor === n;
      default:
        return false;
    }
  }

  private armazemPertoDoCobre(ctx: SystemContext): boolean {
    const { state } = ctx;
    const cobre = entitiesWith(state, 'jazida', 'position')
      .filter((j) => getComponent(state, j, 'jazida')!.recurso === 'cu')
      .map((j) => direcaoDe(getComponent(state, j, 'position')!));
    return entitiesWith(state, 'structure', 'owner', 'position').some((id) => {
      if (getComponent(state, id, 'owner')!.nacao !== this.jogador) return false;
      if (getComponent(state, id, 'structure')!.tipo !== 'storage') return false;
      if (getComponent(state, id, 'obra')) return false;
      const d = direcaoDe(getComponent(state, id, 'position')!);
      return cobre.some((c) => distanciaM(ctx, d, c) <= param('tutorial_raio_armazem_m'));
    });
  }
}
