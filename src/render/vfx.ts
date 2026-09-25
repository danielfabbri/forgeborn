/**
 * VFX de combate e de movimento (ART-07): faíscas e poeira das explosões por porte, onda de
 * choque, clarão e decalque de cratera das minas, faíscas no impacto dos lasers, rastro de
 * torpedo, fumaça da bomba em queda e poeira de regolito sob os hovers. Só lê o estado e os
 * eventos. Tamanhos, tempos e cores são de apresentação.
 */
import {
  AdditiveBlending,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
  type Scene,
  CircleGeometry,
  SphereGeometry,
} from 'three';
import {
  dados,
  type EntityId,
  entitiesWith,
  getComponent,
  type SimEvent,
  type SimState,
} from '../sim';
import type { Vec3 } from '../sim/map/esfera';
import { GRAVIDADE_LUA, type Particulas } from './particulas';
import type { CorpoDesenhado } from './unidades';

const ONDA_S = 0.5;
const CLARAO_S = 0.18;
const CRATERA_S = 30;
/** Hovers: acima desta velocidade (m/s) levantam poeira. */
const VEL_POEIRA_M_S = 1;

interface Temporario {
  malha: Mesh;
  inicio: number;
  duracao_s: number;
  /** Escala final (a onda cresce; o clarão e a cratera não). */
  escala: number;
  opacidade: number;
}

const MOVEIS_DE_SOLO = new Set(dados.moveis.filter((m) => m.camada === 'solo').map((m) => m.id));

export class Efeitos {
  private readonly temporarios: Temporario[] = [];
  private readonly geoAnel = new RingGeometry(0.85, 1, 48);
  private readonly geoDisco = new CircleGeometry(1, 32);
  private readonly geoEsfera = new SphereGeometry(1, 12, 8);

  constructor(
    private readonly scene: Scene,
    private readonly raio: number,
    private readonly chao: (d: Vec3) => number,
    private readonly particulas: Particulas,
  ) {}

  private noChao(d: Vec3, acima = 0.1): [number, number, number] {
    const r = this.raio + this.chao(d) + acima;
    return [d[0] * r, d[1] * r, d[2] * r];
  }

  private temporario(
    geo: RingGeometry | CircleGeometry | SphereGeometry,
    cor: string,
    d: Vec3,
    tamanho: number,
    duracao_s: number,
    agora: number,
    o: { escala?: number; aditiva?: boolean; opacidade?: number; deitado?: boolean } = {},
  ): void {
    const malha = new Mesh(
      geo,
      new MeshBasicMaterial({
        color: cor,
        transparent: true,
        opacity: o.opacidade ?? 0.9,
        blending: o.aditiva === false ? undefined : AdditiveBlending,
        side: DoubleSide,
        depthWrite: false,
      }),
    );
    const p = this.noChao(d, 0.15);
    malha.position.set(...p);
    if (o.deitado !== false) malha.lookAt(p[0] + d[0], p[1] + d[1], p[2] + d[2]);
    malha.scale.setScalar(tamanho);
    malha.userData.base = tamanho;
    this.scene.add(malha);
    this.temporarios.push({
      malha,
      inicio: agora,
      duracao_s,
      escala: o.escala ?? 1,
      opacidade: o.opacidade ?? 0.9,
    });
  }

  /** Eventos do tick. `explorado(d)`: o jogador percebe esse ponto (VIS-01)? */
  registrar(
    state: SimState,
    eventos: readonly SimEvent[],
    agora: number,
    explorado: (d: Vec3) => boolean,
  ): void {
    for (const e of eventos) {
      const d = e.dados as Record<string, unknown>;
      if (e.tipo === 'explosao') {
        const centro = d.d as Vec3;
        if (!explorado(centro)) continue;
        const raio = Math.max(1, d.raio as number);
        const origem = this.noChao(centro, 0.3);
        // Faíscas quentes e poeira de regolito, pelo porte (ART-07).
        this.particulas.emitir(
          {
            origem,
            cima: centro,
            n: Math.round(12 * raio * raio),
            velocidade: [raio * 1.5, raio * 5],
            espalhamento: 0.9,
            vida_s: [0.3, 0.8],
            cor: [1, 0.62, 0.22],
            tamanho: 0.35,
            gravidade: GRAVIDADE_LUA,
          },
          'faisca',
        );
        this.particulas.emitir(
          {
            origem,
            cima: centro,
            n: Math.round(8 * raio * raio),
            velocidade: [raio * 0.5, raio * 2],
            espalhamento: 1,
            vida_s: [1.2, 2.6],
            cor: [0.42, 0.41, 0.39],
            tamanho: 0.9,
            gravidade: GRAVIDADE_LUA,
          },
          'poeira',
        );
        // Onda de choque rente ao chão.
        this.temporario(this.geoAnel, '#ffd9a0', centro, raio * 0.3, ONDA_S, agora, {
          escala: raio * 1.4,
          opacidade: 0.7,
        });
        // Mina: clarão e decalque de cratera (ART-07).
        if (d.arma === 'mine_blast') {
          this.temporario(this.geoEsfera, '#ffffff', centro, raio * 0.8, CLARAO_S, agora, {
            deitado: false,
          });
          this.temporario(this.geoDisco, '#15161a', centro, raio * 0.9, CRATERA_S, agora, {
            aditiva: false,
            opacidade: 0.75,
          });
        }
      } else if (e.tipo === 'disparo' && d.alvo !== null && d.alvo !== undefined) {
        // Faíscas no impacto do laser.
        const arma = dados.armas.find((a) => a.id === d.arma);
        if (arma?.projetil !== 'hitscan') continue;
        const pos = getComponent(state, d.alvo as EntityId, 'position');
        if (!pos) continue;
        const r = Math.hypot(pos.x, pos.y, pos.z) || 1;
        const cima: Vec3 = [pos.x / r, pos.y / r, pos.z / r];
        if (!explorado(cima)) continue;
        this.particulas.emitir(
          {
            origem: [pos.x + cima[0] * 0.8, pos.y + cima[1] * 0.8, pos.z + cima[2] * 0.8],
            cima,
            n: 6,
            velocidade: [2, 5],
            espalhamento: 1,
            vida_s: [0.1, 0.3],
            cor: [1, 0.85, 0.55],
            tamanho: 0.2,
          },
          'faisca',
        );
      }
    }
  }

  /** Por quadro: rastros, poeira dos hovers, faíscas da impressão e o fim dos temporários. */
  sync(
    state: SimState,
    corpos: readonly CorpoDesenhado[],
    agora: number,
    dt: number,
    explorado: (id: EntityId) => boolean,
    linhasDeImpressao: ReadonlyArray<{
      x: number;
      y: number;
      z: number;
      cima: [number, number, number];
      raio: number;
    }> = [],
  ): void {
    // ART-06: faíscas na linha de impressão.
    for (const l of linhasDeImpressao) {
      if (Math.random() > dt * 20) continue;
      const a = Math.random() * Math.PI * 2;
      const lado: Vec3 = [Math.cos(a), Math.sin(a), Math.cos(a + 1)];
      this.particulas.emitir(
        {
          origem: [
            l.x + lado[0] * l.raio * 0.6,
            l.y + lado[1] * l.raio * 0.6,
            l.z + lado[2] * l.raio * 0.6,
          ],
          cima: l.cima,
          n: 2,
          velocidade: [0.5, 2],
          espalhamento: 1,
          vida_s: [0.2, 0.5],
          cor: [1, 0.8, 0.5],
          tamanho: 0.18,
          gravidade: GRAVIDADE_LUA,
        },
        'faisca',
      );
    }
    // Rastro do torpedo e fumaça da bomba.
    for (const id of entitiesWith(state, 'projetil', 'position')) {
      if (!explorado(id)) continue;
      const p = getComponent(state, id, 'projetil')!;
      const pos = getComponent(state, id, 'position')!;
      const r = Math.hypot(pos.x, pos.y, pos.z) || 1;
      const torpedo = p.tipo === 'torpedo';
      this.particulas.emitir(
        {
          origem: [pos.x, pos.y, pos.z],
          cima: [pos.x / r, pos.y / r, pos.z / r],
          n: torpedo ? 2 : 1,
          velocidade: [0, 0.4],
          espalhamento: 1,
          vida_s: torpedo ? [0.25, 0.5] : [0.6, 1.2],
          cor: torpedo ? [0.7, 0.85, 1] : [0.55, 0.53, 0.5],
          tamanho: torpedo ? 0.22 : 0.4,
        },
        torpedo ? 'faisca' : 'poeira',
      );
    }
    // Poeira de regolito sob os hovers em movimento.
    for (const c of corpos) {
      if (!c.movel || !MOVEIS_DE_SOLO.has(c.tipo as never)) continue;
      const loc = getComponent(state, c.id, 'locomotion');
      if (!loc || loc.speed < VEL_POEIRA_M_S) continue;
      // Umas 6 partículas por segundo em velocidade máxima.
      if (Math.random() > dt * 6 * Math.min(1, loc.speed / 6)) continue;
      this.particulas.emitir(
        {
          origem: [c.x, c.y, c.z],
          cima: c.cima,
          n: 2,
          velocidade: [0.3, 1.2],
          espalhamento: 1,
          vida_s: [0.8, 1.6],
          cor: [0.5, 0.49, 0.46],
          tamanho: 0.5,
          gravidade: GRAVIDADE_LUA,
        },
        'poeira',
      );
    }
    this.particulas.atualizar(dt);

    for (let k = this.temporarios.length - 1; k >= 0; k--) {
      const t = this.temporarios[k]!;
      const fracao = (agora - t.inicio) / (t.duracao_s * 1000);
      const material = t.malha.material as MeshBasicMaterial;
      if (fracao >= 1) {
        this.scene.remove(t.malha);
        material.dispose();
        this.temporarios.splice(k, 1);
        continue;
      }
      const base = t.malha.userData.base as number;
      if (t.escala !== 1) t.malha.scale.setScalar(base + (t.escala - base) * fracao);
      material.opacity = t.opacidade * (1 - fracao);
    }
  }
}
