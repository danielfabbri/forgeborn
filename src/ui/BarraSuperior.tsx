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
        <span
          class="energia"
          data-testid="energia"
          data-indicador={energia.indicador}
          title={t('hud.energia_ajuda')}
        >
          <span class="icone" style={{ background: COR_DO_INDICADOR[energia.indicador] }} />
          {t('hud.energia')} +{energia.geracao.toFixed(1)}/s −{energia.consumo.toFixed(1)}/s ·{' '}
          {t('hud.banco')} {Math.floor(energia.banco)}/{energia.capacidade}
          {(barra.redesIsoladas ?? 0) > 0 && (
            <small data-testid="redes-isoladas">
              {' · '}
              {t('rede.isoladas', { n: barra.redesIsoladas ?? 0 })}
            </small>
          )}
        </span>
      )}
      <span data-testid="corpos">
        {t('hud.corpos')} {barra.corpos.n}/{barra.corpos.limite}
      </span>
      {/* UI-17 (D-81): temperamento das outras nações em relação a mim. */}
      {barra.nacoes.map((n) => (
        <span
          key={n.id}
          class={`temperamento ${n.estado}`}
          data-testid={`temperamento-${n.id}`}
          data-estado={n.estado}
          title={t(`temperamento.ajuda.${n.estado}` as TextKey)}
          style={{ borderColor: n.cor }}
        >
          <span class="icone" style={{ background: n.cor }} />
          {t(`nacao.${n.id}` as TextKey)}:{' '}
          {n.estado === 'alerta' && n.prazo !== null
            ? t('temperamento.alerta', { s: Math.ceil(n.prazo) })
            : t(`temperamento.${n.estado}` as TextKey)}
        </span>
      ))}
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
