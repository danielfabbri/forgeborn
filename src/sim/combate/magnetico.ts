/**
 * Torre Magnética (UNI-13, D-65). Unidades móveis inimigas no campo de `mag_raio_m` ficam mais
 * lentas e perdem energia; o efeito cai em linha até a borda, vale menos em blindadas e não se
 * soma entre torres (vale o mais forte). A torre guarda o drenado até `mag_banco_max_en` e
 * repassa aos aliados no campo, os de menor % primeiro.
 */
import { entitiesWith, getComponent, removeComponent, setComponent } from '../core/entities';
import type { SystemContext } from '../core/pipeline';
import type { EntityId } from '../core/types';
import { param } from '../data';
import { porcentagem } from '../energia/bateria';
import { statsMovel } from '../units/stats';
import { direcaoDe, distanciaM } from '../units/superficie';

/** Intensidade (0..1) do campo sobre a unidade: linear até a borda, menor em blindadas. */
function intensidade(distancia: number, blindada: boolean): number {
  const f = Math.max(0, 1 - distancia / param('mag_raio_m'));
  return blindada ? (f * param('mag_fator_blindada_pct')) / 100 : f;
}

export function passoMagnetico(ctx: SystemContext): void {
  const { state, dt } = ctx;
  // A lentidão é refeita a cada tick (o movimento do próximo tick a usa).
  for (const id of entitiesWith(state, 'lentidao')) removeComponent(state, id, 'lentidao');
  const torres = entitiesWith(state, 'magnetico', 'owner', 'position').filter(
    (id) => !getComponent(state, id, 'obra'),
  );
  if (torres.length === 0) return;
  const unidades = entitiesWith(state, 'unit', 'owner', 'position');
  const raio = param('mag_raio_m');
  for (const torre of torres) {
    const mag = getComponent(state, torre, 'magnetico')!;
    const nacao = getComponent(state, torre, 'owner')!.nacao;
    const dt0 = direcaoDe(getComponent(state, torre, 'position')!);
    const aliados: EntityId[] = [];
    mag.ativo = false;
    for (const u of unidades) {
      const distancia = distanciaM(ctx, dt0, direcaoDe(getComponent(state, u, 'position')!));
      if (distancia > raio) continue;
      if (getComponent(state, u, 'owner')!.nacao === nacao) {
        aliados.push(u);
        continue;
      }
      const tipo = getComponent(state, u, 'unit')!.tipo;
      const f = intensidade(distancia, statsMovel(tipo).blindagem === 'blindada');
      if (f <= 0) continue;
      mag.ativo = true;
      const fator = (f * param('mag_lentidao_max_pct')) / 100;
      const atual = getComponent(state, u, 'lentidao');
      if (!atual) setComponent(state, u, 'lentidao', { fator });
      else atual.fator = Math.max(atual.fator, fator);
      // Dreno até encher o banco da torre.
      const b = getComponent(state, u, 'bateria');
      const espaco = param('mag_banco_max_en') - mag.banco;
      if (!b || espaco <= 1e-9) continue;
      const en = Math.min(param('mag_dreno_max_en_s') * f * dt, b.en, espaco);
      b.en -= en;
      mag.banco += en;
    }
    // Repasse aos aliados no campo, os de menor % primeiro.
    const alvos = aliados
      .filter((u) => {
        const b = getComponent(state, u, 'bateria');
        return b !== undefined && b.en < b.max - 1e-9;
      })
      .sort(
        (a, b) =>
          porcentagem(getComponent(state, a, 'bateria')!) -
            porcentagem(getComponent(state, b, 'bateria')!) || a - b,
      )
      .slice(0, param('mag_max_aliados'));
    for (const u of alvos) {
      if (mag.banco <= 1e-9) break;
      const b = getComponent(state, u, 'bateria')!;
      const en = Math.min(param('mag_repasse_en_s') * dt, b.max - b.en, mag.banco);
      b.en += en;
      mag.banco -= en;
      mag.ativo = true;
    }
  }
}
