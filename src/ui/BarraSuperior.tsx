import { configuracoes } from '../game/configuracoes';
import { clipPathDe, FORMA_DO_RECURSO } from '../game/paleta';
import { t, type TextKey } from '../i18n';
import { acoesDaPartida, barraSuperior } from './hud';

const COR_DO_INDICADOR = { verde: '#46e08a', amarelo: '#f7c948', vermelho: '#ff4d4d' } as const;

/** UI-01: recursos (com o que está em trânsito), energia (ENE-22), corpos, relógio e menu. */
export function BarraSuperior() {
  const barra = barraSuperior.value;
  const daltonico = configuracoes.value.daltonismo !== 'nenhum';
  const energia = barra.energia;
  return (
    <div class="barra-superior" data-testid="barra-superior">
      {barra.recursos.map((r) => (
        <span
          class="recurso"
          key={r.id}
          data-testid={`recurso-${r.id}`}
          title={t(`recurso_nome.${r.id}` as TextKey)}
        >
          <span
            class="icone"
            style={{
              background: r.cor,
              // UI-11: no modo daltônico, cada recurso tem a sua forma.
              ...(daltonico
                ? { clipPath: clipPathDe(FORMA_DO_RECURSO[r.id] ?? 'quadrado'), borderRadius: 0 }
                : {}),
            }}
          />
          {t(`recurso.${r.id}` as TextKey)} <strong>{Math.floor(r.quantidade)}</strong>
          {r.transito >= 1 && <small> +{Math.floor(r.transito)}</small>}
        </span>
      ))}
      {energia && (
        <span class="energia" data-testid="energia" data-indicador={energia.indicador}>
          <span class="icone" style={{ background: COR_DO_INDICADOR[energia.indicador] }} />
          {t('hud.energia')} +{energia.geracao.toFixed(1)} −{energia.consumo.toFixed(1)} ·{' '}
          {Math.floor(energia.banco)}/{energia.capacidade}
        </span>
      )}
      <span data-testid="corpos">
        {t('hud.corpos')} {barra.corpos.n}/{barra.corpos.limite}
      </span>
      <span class="relogio" data-testid="relogio">
        {barra.relogio}
      </span>
      <button
        class="botao-menu"
        data-testid="botao-menu"
        onClick={() => acoesDaPartida.abrirMenu()}
      >
        {t('barra.menu')}
      </button>
    </div>
  );
}
