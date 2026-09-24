import { BarraSuperior } from './BarraSuperior';
import { DebugOverlay } from './DebugOverlay';
import { PainelProducao } from './PainelProducao';
import { FimDePartida, PainelSelecao, Tooltip } from './PainelSelecao';

export function App() {
  return (
    <>
      <BarraSuperior />
      <PainelSelecao />
      <PainelProducao />
      <Tooltip />
      <FimDePartida />
      <DebugOverlay />
    </>
  );
}
