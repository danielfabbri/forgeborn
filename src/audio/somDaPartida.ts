/**
 * Som da partida (AUD-02, AUD-04): os eventos da simulação viram efeitos, com volume pela
 * distância até o ponto da câmera; só soa o que o jogador pode perceber (visível ou explorado,
 * VIS-01), para o som não entregar o que a névoa esconde. O ambiente (zumbido dos hovers e
 * atrito da mineração) acompanha os corpos perto da câmera.
 */
import type { EntityId, SimEvent } from '../sim';
import type { Vec3 } from '../sim/map/esfera';
import { Ambiente, type Som, tocarSom } from './sfx';

/** Apresentação: até onde (m) um som do mundo se ouve a partir do ponto da câmera. */
const ALCANCE_AUDIVEL_M = 70;

export interface FontesDoSom {
  /** Onde o jogador "está": o ponto focal da câmera, ou a unidade no controle direto. */
  ouvinte: () => Vec3;
  /** Posição (mundo) de um corpo, se ele existe e o jogador o percebe. */
  posicao: (id: EntityId) => Vec3 | null;
  /** O ponto (direção) está explorado pelo jogador? */
  explorado: (d: Vec3) => boolean;
  raio: number;
  /** Tipo da arma pelo id (para o som do disparo). */
  projetil: (arma: string) => string | null;
}

function volumePela(distancia: number): number {
  return Math.max(0, 1 - distancia / ALCANCE_AUDIVEL_M);
}

export class SomDaPartida {
  readonly ambiente = new Ambiente();

  constructor(private readonly f: FontesDoSom) {}

  /** Onde o jogador ouve agora (mundo). */
  ouvinte(): Vec3 {
    return this.f.ouvinte();
  }

  private noMundo(som: Som, p: Vec3 | null): void {
    if (!p) return;
    const o = this.f.ouvinte();
    const v = volumePela(Math.hypot(p[0] - o[0], p[1] - o[1], p[2] - o[2]));
    if (v > 0.02) tocarSom(som, v);
  }

  private naSuperficie(d: Vec3): Vec3 {
    return [d[0] * this.f.raio, d[1] * this.f.raio, d[2] * this.f.raio];
  }

  eventos(eventos: readonly SimEvent[]): void {
    for (const e of eventos) {
      const d = e.dados as Record<string, unknown>;
      switch (e.tipo) {
        case 'disparo': {
          const tipo = this.f.projetil(d.arma as string);
          const som: Som = tipo === 'guiado' ? 'torpedo' : tipo === 'balistico' ? 'bomba' : 'laser';
          this.noMundo(som, this.f.posicao(d.atirador as EntityId));
          break;
        }
        case 'explosao': {
          const centro = d.d as Vec3;
          if (!this.f.explorado(centro)) break;
          const grande = (d.raio as number) >= 4;
          this.noMundo(grande ? 'explosao_grande' : 'explosao_pequena', this.naSuperficie(centro));
          break;
        }
        case 'impresso':
          this.noMundo('impressao', this.f.posicao(d.id as EntityId));
          break;
        case 'morte': {
          const onde = d.d as Vec3 | undefined;
          if (onde && this.f.explorado(onde)) this.noMundo('morte', this.naSuperficie(onde));
          break;
        }
        case 'estrutura_concluida':
          this.noMundo('concluido', this.f.posicao(d.id as EntityId));
          break;
      }
    }
  }
}
