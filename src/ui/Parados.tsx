/**
 * UI-15: botões fixos ao lado do minimapa com os mineradores e as impressoras parados. O clique
 * seleciona o próximo parado (em ciclo) e centraliza a câmera nele.
 */
import { t } from '../i18n';
import { acoesDosParados, parados, type TipoDeParado } from './hud';

function Botao({ tipo, icone }: { tipo: TipoDeParado; icone: string }) {
  const n = parados.value[tipo];
  return (
    <button
      type="button"
      class={`parado${n > 0 ? ' com-parados' : ''}`}
      data-testid={`parados-${tipo}`}
      title={t(`parados.${tipo}`)}
      onClick={() => acoesDosParados.proximo(tipo)}
    >
      <span class="icone" aria-hidden="true">
        {icone}
      </span>
      <span class="n">{n}</span>
    </button>
  );
}

export function BotoesDeParados() {
  return (
    <div class="parados" data-testid="parados">
      <Botao tipo="mineradores" icone="⛏" />
      <Botao tipo="impressoras" icone="⎙" />
    </div>
  );
}
