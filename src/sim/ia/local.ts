/** Onde a IA posiciona estruturas: o primeiro local válido (PRD-10) numa espiral em volta de um ponto. */
import type { Ponto } from '../core/components';
import type { SystemContext } from '../core/pipeline';
import type { EntityId, NacaoId } from '../core/types';
import { dados, type EstruturasId } from '../data';
import { entitiesWith, getComponent } from '../core/entities';
import { avancar, girar, norteEm, tangente, type Vec3 } from '../map/esfera';
import { validarPosicionamento } from '../producao/obra';
import { raioDaPegada } from '../units/criar';
import { direcaoDe, distanciaM, raioDoMundo } from '../units/superficie';
import { alcancaAlguma, redePrincipal, tipoPrecisaDeEnergia } from '../energia/cabos';

/** Corredor entre a estrutura nova e as vizinhas: o diâmetro do maior casco de unidade de solo. */
const CORREDOR_M =
  2 * Math.max(...dados.moveis.filter((m) => m.camada === 'solo').map((m) => m.raio_m));

/**
 * A IA não fecha a própria base: a pegada nova (pelo círculo que a cobre) fica a pelo menos um
 * corredor de qualquer estrutura ou jazida.
 */
function deixaPassagem(ctx: SystemContext, tipo: EstruturasId, d: Vec3): boolean {
  const { state } = ctx;
  const raio = raioDaPegada(tipo);
  for (const id of entitiesWith(state, 'position')) {
    const estrutura = getComponent(state, id, 'structure');
    const outro = estrutura
      ? raioDaPegada(estrutura.tipo)
      : getComponent(state, id, 'jazida')
        ? (getComponent(state, id, 'obstacle')?.raio ?? 0)
        : null;
    if (outro === null) continue;
    const distancia = distanciaM(ctx, d, direcaoDe(getComponent(state, id, 'position')!));
    if (distancia - raio - outro < CORREDOR_M) return false;
  }
  return true;
}

/** Anéis da busca (m a partir do centro) e pontos por anel: só o padrão da procura. */
const ANEIS_M = [14, 18, 22, 26, 30, 35, 40, 46, 52];
const PONTOS_POR_ANEL = 12;

/**
 * Procura um local válido para `tipo` em volta de `centro`, começando pelo lado de `preferir`
 * (se dado), e devolve a direção ou null.
 */
export function procurarLocal(
  ctx: SystemContext,
  nacao: NacaoId,
  tipo: EstruturasId,
  centro: Ponto,
  preferir: Ponto | null = null,
  aneis: readonly number[] = ANEIS_M,
  alcance?: readonly EntityId[],
): Vec3 | null {
  const R = raioDoMundo(ctx);
  const inicio = (preferir && tangente(centro, preferir)) || norteEm(centro);
  // IA-13 (D-85): quem precisa de energia só vai onde a rede da Nave alcança por cabo.
  const rede = alcance ?? (tipoPrecisaDeEnergia(tipo) ? redePrincipal(ctx.state, nacao) : null);
  for (const anel of aneis) {
    for (let k = 0; k < PONTOS_POR_ANEL; k++) {
      // Alterna os lados: 0, +1, −1, +2, −2… a partir do rumo preferido.
      const passo = k % 2 === 0 ? k / 2 : -(k + 1) / 2;
      const rumo = girar(inicio, centro, (passo * 2 * Math.PI) / PONTOS_POR_ANEL);
      const d = avancar(centro, rumo, anel / R).p;
      if (rede && !alcancaAlguma(ctx, tipo, d, rede)) continue;
      if (validarPosicionamento(ctx, tipo, d, nacao) === null && deixaPassagem(ctx, tipo, d))
        return d;
    }
  }
  return null;
}
