import { t, type TextKey } from '../i18n';
import { configuracoes } from '../game/configuracoes';
import { clipPathDe, corDoRecurso, FORMA_DO_RECURSO } from '../game/paleta';
import { dados } from '../sim';
import { acoesDoPainel, avisoProducao, fotosDoPainel, painelProducao } from './producao';

const nome = (item: string) => t(`item.${item}` as TextKey);

/** UI-04: a foto do modelo no botão do cartão. */
function Foto({ item }: { item: string }) {
  const url = fotosDoPainel.de?.(item) ?? null;
  return url ? (
    <img class="foto-item" src={url} alt="" draggable={false} />
  ) : (
    <span class="foto-item vazia">{nome(item)}</span>
  );
}

/**
 * UI-04: ao passar o mouse, o nome e a receita completa (o que falta em vermelho), a energia
 * e o tempo de impressão.
 */
function Custo({ item, estoque }: { item: string; estoque: Record<string, number> }) {
  const custo = dados.custos.find((c) => c.id === item);
  if (!custo) return null;
  const daltonico = configuracoes.value.daltonismo !== 'nenhum';
  return (
    <div class="dica-item" data-testid="dica-item">
      <strong>{nome(item)}</strong>
      <div class="receita">
        {dados.recursos
          .filter((r) => (custo[r.id as 'fe'] as number) > 0)
          .map((r) => {
            const precisa = custo[r.id as 'fe'] as number;
            const falta = (estoque[r.id] ?? 0) < precisa;
            return (
              <span key={r.id} class={falta ? 'falta' : ''} data-recurso={r.id}>
                <span
                  class="icone"
                  style={{
                    background: corDoRecurso(r.id),
                    ...(daltonico
                      ? { clipPath: clipPathDe(FORMA_DO_RECURSO[r.id] ?? 'quadrado') }
                      : {}),
                  }}
                />
                {t(`recurso.${r.id}` as TextKey)} {precisa}
              </span>
            );
          })}
      </div>
      <div class="discreto">
        {t('producao.energia', { n: custo.en_impressao })} ·{' '}
        {t('producao.tempo', { n: custo.tempo_s })}
      </div>
    </div>
  );
}

/** Painel de produção: fila do produtor, menus da Impressora e posicionamento (UI-08). */
export function PainelProducao() {
  const estado = painelProducao.value;
  const aviso = avisoProducao.value;
  const acoes = acoesDoPainel.atual;
  const mostrar = estado.produtor || estado.obra || estado.posicionando || estado.reparando;
  return (
    <>
      {aviso && (
        <div class="aviso-producao" data-testid="aviso-producao">
          {aviso.texto}
        </div>
      )}
      {mostrar && (
        <div class="painel-producao" data-testid="painel-producao">
          {estado.posicionando && (
            <div data-testid="posicionando">
              {t('producao.posicionando', { item: nome(estado.posicionando) })}
              {estado.motivo && (
                <div class="motivo" data-testid="motivo">
                  {t(`motivo.${estado.motivo}` as TextKey)}
                </div>
              )}
            </div>
          )}
          {estado.reparando && <div>{t('producao.reparar')}</div>}
          {estado.obra && (
            <div data-testid="obra">
              <strong>{nome(estado.obra.tipo)}</strong>
              <div>
                {estado.obra.instalada
                  ? t('producao.em_obra', { pct: Math.floor(estado.obra.progresso * 100) })
                  : t('producao.reservada')}
              </div>
              <button
                type="button"
                onClick={() => acoes?.cancelarObra(estado.obra!.id)}
                data-testid="cancelar-obra"
              >
                {t('producao.cancelar_obra')}
              </button>
            </div>
          )}
          {estado.produtor && !estado.posicionando && (
            <div>
              <strong>{nome(estado.produtor.tipo)}</strong>
              {estado.produtor.tipo === 'printer' && (
                <div class="abas">
                  <button
                    type="button"
                    class={estado.menu === 'unidades' ? 'ativa' : ''}
                    onClick={() => acoes?.abrirMenu('unidades')}
                  >
                    U {t('producao.menu_unidades')}
                  </button>
                  <button
                    type="button"
                    class={estado.menu === 'estruturas' ? 'ativa' : ''}
                    onClick={() => acoes?.abrirMenu('estruturas')}
                  >
                    B {t('producao.menu_estruturas')}
                  </button>
                </div>
              )}
              {estado.recolhidos !== null && (
                <div class="abas">
                  <button
                    type="button"
                    class={estado.recolhidos ? 'ativa' : ''}
                    onClick={() => acoes?.recolherMineradores()}
                    data-testid="recolher-mineradores"
                  >
                    Q{' '}
                    {estado.recolhidos
                      ? t('producao.liberar_mineradores')
                      : t('producao.recolher_mineradores')}
                  </button>
                </div>
              )}
              {estado.suporte !== null && (
                <div class="abas">
                  <button
                    type="button"
                    class={estado.suporte ? 'ativa' : ''}
                    onClick={() => acoes?.alternarSuporte()}
                    data-testid="alternar-suporte"
                    aria-pressed={estado.suporte}
                  >
                    T{' '}
                    {estado.suporte
                      ? t('producao.suporte_ligado')
                      : t('producao.suporte_desligado')}
                  </button>
                </div>
              )}
              {estado.minas && (
                <div data-testid="carregador-minas">
                  {t('producao.minas', { n: estado.minas.n, max: estado.minas.max })}
                </div>
              )}
              <div class="opcoes cartao" data-testid="opcoes">
                {estado.opcoes.map((opcao) => (
                  <button
                    type="button"
                    key={opcao.item}
                    class="opcao-cartao"
                    onClick={() => acoes?.escolher(opcao.item)}
                    data-item={opcao.item}
                    aria-label={nome(opcao.item)}
                  >
                    <Foto item={opcao.item} />
                    <kbd>{opcao.tecla}</kbd>
                    <Custo item={opcao.item} estoque={estado.estoque} />
                  </button>
                ))}
              </div>
              {!estado.produtor.cartaoDeAcao && (
                <div class="fila" data-testid="fila">
                  {t('producao.fila')}:
                  {estado.produtor.fila.length === 0 && <span> {t('producao.vazia')}</span>}
                  {estado.produtor.fila.map((item, k) => (
                    <div class="item-fila" key={`${k}-${item.item}`}>
                      <span>{nome(item.item)}</span>
                      <span class="barra">
                        <span style={{ width: `${Math.floor(item.progresso * 100)}%` }} />
                      </span>
                      <button
                        type="button"
                        title={t('producao.cancelar')}
                        onClick={() => acoes?.cancelarItem(estado.produtor!.id, k)}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}
