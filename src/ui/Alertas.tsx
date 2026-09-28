/**
 * Pilha de alertas (UI-06): até 5 visíveis à esquerda, na voz da IA do jogador (§2.4). Clicar
 * leva a câmera ao local; Espaço vai ao último alerta.
 */
import type { Alerta } from '../game/alertas';
import { t, type TextKey } from '../i18n';
import { acoesDosAlertas, alertasVisiveis } from './hud';

/** Texto do alerta com as variáveis traduzidas (nomes de itens, recursos, rumos e nações). */
export function textoDoAlerta(a: Alerta): string {
  const v = a.vars;
  const vars: Record<string, string | number> = {};
  switch (a.id) {
    case 'AL-03':
      vars.n = v.n ?? 0;
      vars.direcao = t(`rumo.${v.direcao}` as TextKey);
      break;
    case 'AL-05':
      vars.item = t(`item.${v.item}` as TextKey);
      break;
    case 'AL-06': {
      const faltam = JSON.parse(String(v.faltam ?? '{}')) as Record<string, number>;
      vars.lista = Object.entries(faltam)
        .map(([r, u]) => `${Math.ceil(u)} ${t(`recurso.${r}` as TextKey)}`)
        .join(', ');
      break;
    }
    case 'AL-07':
      vars.recurso = t(`recurso_nome.${v.recurso}` as TextKey);
      break;
    case 'AL-08':
      vars.n = v.n ?? 0;
      break;
    case 'AL-11':
      vars.limite = t(`limite.${v.limite}` as TextKey);
      break;
    case 'AL-13':
      vars.nacao = t(`nacao.${v.eliminada}` as TextKey);
      break;
    case 'AL-19':
    case 'AL-20':
    case 'AL-21':
    case 'AL-22':
      vars.nacao = t(`nacao.${v.outra}` as TextKey);
      break;
    case 'AL-23':
      vars.item = t(`item.${v.item}` as TextKey);
      break;
    case 'AL-18':
      vars.unidade = t(`item.${v.unidade}` as TextKey);
      break;
  }
  return t(`alerta.${a.id}` as TextKey, vars);
}

export function PilhaDeAlertas() {
  const alertas = alertasVisiveis.value;
  if (alertas.length === 0) return null;
  return (
    <div class="alertas" data-testid="alertas">
      {alertas.map((a) => (
        <button
          key={a.seq}
          class={`alerta ${a.prioridade}`}
          data-testid="alerta"
          data-id={a.id}
          disabled={!a.local}
          onClick={() => acoesDosAlertas.irPara(a)}
        >
          {textoDoAlerta(a)}
        </button>
      ))}
    </div>
  );
}
