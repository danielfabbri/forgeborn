/**
 * Batedor da IA (IA-01): até `ia_batedores` Hovers de Observação exploram as zonas de pouso
 * alheias e os pontos médios do mapa, um de cada vez. Plantar Sentinelas nas rotas entra com a
 * T-072.
 */
import type { Ponto } from '../core/components';
import { getComponent } from '../core/entities';
import type { SystemContext } from '../core/pipeline';

import { dados, param } from '../data';
import { avancar, girar, norteEm } from '../map/esfera';
import { distanciaM, raioDoMundo } from '../units/superficie';
import { explorado } from '../visao/nevoa';
import { comandar, dosTipos } from './base';
import type { Quadro } from './quadro';

/**
 * Anel das jazidas de expansão em volta da base, na distância média de `dados:jazidas` (zona
 * `expansao`): é onde ficam Ti e as jazidas de fora da base.
 */
function anelDeExpansao(ctx: SystemContext, base: Ponto): Ponto[] {
  const linhas = dados.jazidas.filter((j) => j.zona === 'expansao');
  if (linhas.length === 0) return [];
  const media =
    linhas.reduce((s, j) => {
      const min = j.dist_min_m ?? 0;
      return s + (min + (j.dist_max_m ?? min)) / 2;
    }, 0) / linhas.length;
  return anel(ctx, base, media);
}

/**
 * IA-14 (D-90): num mapa com líquido, a costa perto da base (onde cabe o Porto), entre a terra
 * firme das zonas e `ia_porto_distancia_m`, em dois anéis.
 */
function aneisDaCosta(ctx: SystemContext, base: Ponto): Ponto[] {
  if (!ctx.mundo?.mapa.mar) return [];
  const de = param('mar_folga_zona_m');
  const ate = param('ia_porto_distancia_m');
  return [...anel(ctx, base, de + (ate - de) / 3), ...anel(ctx, base, de + ((ate - de) * 2) / 3)];
}

/** Pontos num anel de raio `metros` em volta da base, espaçados de uma visão do batedor. */
function anel(ctx: SystemContext, base: Ponto, media: number): Ponto[] {
  const R = raioDoMundo(ctx);
  // Pontos espaçados de uma visão inteira do batedor, para o anel todo ser visto.
  const visao = dados.moveis.find((m) => m.id === 'hover_scout')!.visao_m;
  const n = Math.max(1, Math.ceil((2 * Math.PI * media) / (2 * visao)));
  return Array.from(
    { length: n },
    (_, k) => avancar(base, girar(norteEm(base), base, (k * 2 * Math.PI) / n), media / R).p,
  );
}

/** Pontos de exploração do mapa: zonas de pouso e pontos médios (contestados e centrais). */
function pontosDoMapa(ctx: SystemContext): Ponto[] {
  const mapa = ctx.mundo?.mapa as
    | {
        zonasDePouso?: Array<{ d: Ponto }>;
        contestados?: Array<{ d: Ponto }>;
        centrais?: Array<{ d: Ponto }>;
      }
    | undefined;
  if (!mapa) return [];
  return [
    ...(mapa.zonasDePouso ?? []).map((z) => z.d),
    ...(mapa.contestados ?? []).map((p) => p.d),
    ...(mapa.centrais ?? []).map((p) => p.d),
  ];
}

/** Folga (s) do prazo de cada ida do batedor. */
const FOLGA_DO_PRAZO_S = 30;

export function decidirBatedor(ctx: SystemContext, q: Quadro): void {
  const pontos = [
    ...anelDeExpansao(ctx, q.base),
    ...aneisDaCosta(ctx, q.base),
    ...pontosDoMapa(ctx),
  ];
  if (pontos.length === 0) return;
  const batedores = dosTipos(ctx.state, q.nacao, 'hover_scout').slice(0, param('ia_batedores'));
  const prazos = (q.ia.prazoDoBatedor ??= {});
  for (const id of batedores) {
    const ordem = getComponent(ctx.state, id, 'order')!.tipo;
    // Um ponto que o batedor não alcança (atrás de um paredão) não o prende: vencido o prazo, segue.
    const vencido = ordem === 'mover' && prazos[id] !== undefined && ctx.tick > prazos[id]!;
    if (ordem !== 'nenhuma' && !vencido) continue;
    // Marca como visitados os pontos já explorados.
    pontos.forEach((p, k) => {
      if (!q.ia.visitados.includes(k) && explorado(ctx, q.nacao, p)) q.ia.visitados.push(k);
    });
    let pendentes = pontos.map((p, k) => ({ p, k })).filter(({ k }) => !q.ia.visitados.includes(k));
    if (pendentes.length === 0) {
      // Tudo visto: recomeça a ronda (a névoa volta sobre o que não está à vista).
      q.ia.visitados = [];
      pendentes = pontos.map((p, k) => ({ p, k }));
    }
    const d = getComponent(ctx.state, id, 'position')!;
    const r = Math.hypot(d.x, d.y, d.z);
    const aqui: Ponto = [d.x / r, d.y / r, d.z / r];
    pendentes.sort((a, b) => distanciaM(ctx, aqui, a.p) - distanciaM(ctx, aqui, b.p) || a.k - b.k);
    const destino = pendentes[0]!;
    q.ia.visitados.push(destino.k);
    // Prazo: o dobro do tempo de viagem em linha reta, mais uma folga fixa.
    const vel = dados.moveis.find((m) => m.id === 'hover_scout')!.vel_m_s;
    const viagem_s = (2 * distanciaM(ctx, aqui, destino.p)) / vel + FOLGA_DO_PRAZO_S;
    prazos[id] = ctx.tick + Math.round(viagem_s / ctx.dt);
    comandar(ctx, q.nacao, 'mover', {
      ids: [id],
      x: destino.p[0],
      y: destino.p[1],
      z: destino.p[2],
    });
  }
}
