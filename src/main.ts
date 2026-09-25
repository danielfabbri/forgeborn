/**
 * Entrada do jogo (§3): menus ou partida. A partida roda numa página própria (FLX-14): com
 * `?partida=` (Free Battle), a cena de demonstração (`?demo`, `?e2e`, `?estresse=`) ou os atalhos
 * de desenvolvimento (`?ia=`, `?camera=`). Sem eles, splash, abertura e menus.
 */
import './styles.css';
import { effect } from '@preact/signals';
import { aplicarVolumes, desbloquearNoPrimeiroGesto, quandoDesbloquear } from './audio/contexto';
import { tocarSom } from './audio/sfx';
import {
  aplicarEscalaDaInterface,
  carregarConfiguracoes,
  configuracoes,
} from './game/configuracoes';
import { esconderCarregamento, mostrarCarregamento, pintar, progresso } from './telas/carregamento';

const parametros = new URLSearchParams(location.search);
const direto = ['partida', 'demo', 'e2e', 'estresse', 'ia', 'camera'].some((p) =>
  parametros.has(p),
);

async function iniciar(): Promise<void> {
  mostrarCarregamento(direto ? 'partida' : 'splash');
  progresso(0.1, 'carregando.configuracoes');
  const config = await carregarConfiguracoes();
  aplicarEscalaDaInterface(document.documentElement, config.escalaInterface);
  // TEC-22/AUD-05: o áudio abre no primeiro gesto; os volumes das Configurações valem na hora.
  desbloquearNoPrimeiroGesto();
  quandoDesbloquear(() => aplicarVolumes(configuracoes.value.volumes));
  effect(() => aplicarVolumes(configuracoes.value.volumes));
  // AUD-04: clique de interface em todo botão.
  document.addEventListener(
    'click',
    (e) => {
      const botao = (e.target as Element | null)?.closest?.('button');
      if (botao && !botao.disabled) tocarSom('clique');
    },
    true,
  );
  progresso(0.3, 'carregando.modulos');
  await pintar();
  if (direto) {
    const partida = await import('./game/partida');
    progresso(0.6, 'carregando.planeta');
    await pintar();
    partida.iniciarPartida();
  } else {
    const menus = await import('./telas/menus');
    progresso(1);
    await pintar();
    menus.iniciarMenus(parametros.has('menu') ? 'modo' : 'abertura');
  }
  esconderCarregamento();
}

void iniciar();
