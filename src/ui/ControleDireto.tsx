/**
 * HUD do controle direto (CTL-14): mira, HP, bateria, recarga da arma, trava do torpedo,
 * bússola com sinais de radar, carga do hover e as dicas. "SINAL PERDIDO" (CTL-13).
 */
import { t, type TextKey } from '../i18n';
import { controleDireto, sinalPerdido } from './hud';

/** Metade da janela da bússola (graus): apresentação. */
const JANELA_GRAUS = 90;
const PONTOS: Array<[number, TextKey]> = [
  [0, 'direto.norte'],
  [90, 'direto.leste'],
  [180, 'direto.sul'],
  [270, 'direto.oeste'],
];

/** Posição (0..1) de um rumo na faixa da bússola, ou null fora da janela. */
export function naBussola(rumo: number, centro: number): number | null {
  const delta = ((rumo - centro + 540) % 360) - 180;
  if (Math.abs(delta) > JANELA_GRAUS) return null;
  return 0.5 + delta / (2 * JANELA_GRAUS);
}

function Barra({ rotulo, fracao, classe }: { rotulo: string; fracao: number; classe: string }) {
  return (
    <div class={`barra-direto ${classe}`}>
      <span>{rotulo}</span>
      <div class="trilho">
        <div class="cheio" style={{ width: `${Math.max(0, Math.min(1, fracao)) * 100}%` }} />
      </div>
    </div>
  );
}

export function HudControleDireto() {
  const perdido = sinalPerdido.value;
  const c = controleDireto.value;
  if (perdido) {
    return (
      <div class="sinal-perdido" data-testid="sinal-perdido">
        <div class="estatica" />
        <p>{t('direto.sinal_perdido')}</p>
      </div>
    );
  }
  if (!c) return null;
  return (
    <div class={`hud-direto ${c.modo}`} data-testid="hud-direto" data-modo={c.modo}>
      <div class={`mira ${c.mira ?? ''}`} data-testid="mira" data-alvo={c.mira ?? ''}>
        {c.trava !== null && (
          <svg class="trava" viewBox="0 0 40 40">
            <circle
              cx="20"
              cy="20"
              r="17"
              pathLength="1"
              stroke-dasharray={`${c.trava} 1`}
              class={c.trava >= 1 ? 'travado' : ''}
            />
          </svg>
        )}
      </div>
      <div class="bussola" data-testid="bussola">
        {PONTOS.map(([graus, rotulo]) => {
          const x = naBussola(graus, c.rumo);
          return x === null ? null : (
            <span key={graus} class="ponto" style={{ left: `${x * 100}%` }}>
              {t(rotulo)}
            </span>
          );
        })}
        {c.sinais.map((rumo, k) => {
          const x = naBussola(rumo, c.rumo);
          return x === null ? null : (
            <span key={`s${k}`} class="sinal" style={{ left: `${x * 100}%` }} />
          );
        })}
        <span class="centro" />
      </div>
      <div class="status-direto">
        <Barra rotulo={t('direto.hp')} fracao={c.hp / c.hpMax} classe="hp" />
        {c.en && <Barra rotulo={t('direto.en')} fracao={c.en.atual / c.en.max} classe="en" />}
        {c.recarga !== null && <Barra rotulo={t('direto.arma')} fracao={c.recarga} classe="arma" />}
        {c.carga && (
          <Barra rotulo={t('direto.carga')} fracao={c.carga.atual / c.carga.max} classe="carga" />
        )}
      </div>
      <div class="dicas-direto">
        {t('direto.dica')}
        {c.habilidade && ` · ${t('direto.dica_habilidade', { acao: t(c.habilidade as TextKey) })}`}
      </div>
    </div>
  );
}
