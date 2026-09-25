/**
 * Menu de Pausa (FLX-11), aviso da pausa tática (REG-21) e Fim de Partida (FLX-12, REG-23).
 */
import { corDaNacao } from '../game/paleta';
import { t, type TextKey } from '../i18n';
import { dados } from '../sim';
import { type LinhaDoFim, total } from '../game/fimDePartida';
import { Configuracoes } from './Configuracoes';
import { acoesDaPartida, fimDePartida, menuDePausa, pausado } from './hud';

export function MenuDePausa() {
  const menu = menuDePausa.value;
  if (fimDePartida.value) return null;
  if (menu === 'fechado') {
    return pausado.value ? (
      <div class="aviso-pausa" data-testid="pausa-tatica">
        {t('pausa.tatica')}
      </div>
    ) : null;
  }
  return (
    <div class="pausa" data-testid="menu-de-pausa">
      {menu === 'configuracoes' ? (
        <div class="menus">
          <Configuracoes aoVoltar={() => (menuDePausa.value = 'aberto')} />
        </div>
      ) : (
        <div class="painel-pausa">
          <h2>{t('pausa.titulo')}</h2>
          <button class="primario" data-testid="pausa-continuar" onClick={acoesDaPartida.continuar}>
            {t('pausa.continuar')}
          </button>
          <button
            data-testid="pausa-configuracoes"
            onClick={() => (menuDePausa.value = 'configuracoes')}
          >
            {t('modo.configuracoes')}
          </button>
          <button data-testid="pausa-reiniciar" onClick={acoesDaPartida.reiniciar}>
            {t('pausa.reiniciar')}
          </button>
          <button data-testid="pausa-render-se" onClick={acoesDaPartida.renderSe}>
            {t('pausa.render_se')}
          </button>
          <button data-testid="pausa-sair" onClick={acoesDaPartida.sair}>
            {t('pausa.sair')}
          </button>
        </div>
      )}
    </div>
  );
}

const duracao = (s: number) => {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
};
const nomeDaNacao = (n: string) => t(`nacao.${n}` as TextKey);

const inteiro = (v: number) => Math.round(v).toLocaleString('pt-BR');

/** REG-23: as linhas da tabela (uma estatística por linha, uma nação por coluna). */
const LINHAS: ReadonlyArray<{ rotulo: TextKey; valor: (l: LinhaDoFim) => string }> = [
  { rotulo: 'fim.pontuacao', valor: (l) => inteiro(l.pontuacao) },
  ...dados.recursos.map((r) => ({
    rotulo: `recurso_nome.${r.id}` as TextKey,
    valor: (l: LinhaDoFim) => inteiro(l.coletado[r.id] ?? 0),
  })),
  { rotulo: 'fim.energia_gerada', valor: (l) => inteiro(l.energiaGerada) },
  { rotulo: 'fim.energia_consumida', valor: (l) => inteiro(l.energiaConsumida) },
  { rotulo: 'fim.impressas', valor: (l) => inteiro(total(l.impressas)) },
  { rotulo: 'fim.perdidas', valor: (l) => inteiro(total(l.perdidas)) },
  { rotulo: 'fim.destruidas', valor: (l) => inteiro(total(l.destruidas)) },
  { rotulo: 'fim.construidas', valor: (l) => inteiro(total(l.construidas)) },
  { rotulo: 'fim.estruturas_perdidas', valor: (l) => inteiro(total(l.estruturasPerdidas)) },
  { rotulo: 'fim.explorado', valor: (l) => `${l.exploradoPct}%` },
  { rotulo: 'fim.apm', valor: (l) => inteiro(l.acoesPorMinuto) },
];

export function FimDePartida() {
  const fim = fimDePartida.value;
  if (!fim) return null;
  const eu = fim.linhas[0]!;
  // Unidades por tipo (REG-23), do jogador.
  const tipos = [
    ...new Set([
      ...Object.keys(eu.impressas),
      ...Object.keys(eu.perdidas),
      ...Object.keys(eu.destruidas),
    ]),
  ].sort();
  return (
    <div
      class={`fim-partida ${fim.resultado}`}
      data-testid="fim-de-partida"
      data-resultado={fim.resultado}
    >
      <div class="painel-fim">
        <h1>{t(`fim.${fim.resultado}` as TextKey)}</h1>
        <p class="discreto">
          {t(`fim.motivo.${fim.motivo}` as TextKey)} ·{' '}
          {t('fim.duracao', { tempo: duracao(fim.duracao_s) })}
        </p>
        <table class="estatisticas" data-testid="estatisticas">
          <thead>
            <tr>
              <th />
              {fim.linhas.map((l) => (
                <th key={l.nacao} style={{ color: corDaNacao(l.nacao) }}>
                  {nomeDaNacao(l.nacao)}
                  {l.eliminada && <small>{t('fim.eliminada')}</small>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {LINHAS.map((linha) => (
              <tr key={linha.rotulo}>
                <td class="rotulo">{t(linha.rotulo)}</td>
                {fim.linhas.map((l) => (
                  <td key={l.nacao}>{linha.valor(l)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {tipos.length > 0 && (
          <table class="estatisticas por-tipo">
            <thead>
              <tr>
                <th>{t('fim.suas_unidades')}</th>
                <th>{t('fim.impressas')}</th>
                <th>{t('fim.perdidas')}</th>
                <th>{t('fim.destruidas')}</th>
              </tr>
            </thead>
            <tbody>
              {tipos.map((tipo) => (
                <tr key={tipo}>
                  <td class="rotulo">{t(`item.${tipo}` as TextKey)}</td>
                  <td>{eu.impressas[tipo] ?? 0}</td>
                  <td>{eu.perdidas[tipo] ?? 0}</td>
                  <td>{eu.destruidas[tipo] ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div class="acoes">
          <button data-testid="fim-menu" onClick={acoesDaPartida.sair}>
            {t('fim.menu')}
          </button>
          <button
            class="primario"
            data-testid="fim-jogar-novamente"
            onClick={acoesDaPartida.jogarDeNovo}
          >
            {t('fim.jogar_novamente')}
          </button>
        </div>
      </div>
    </div>
  );
}
