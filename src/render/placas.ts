/**
 * §14.8/D-98: textura procedural do solo de Vênus — placas de basalto largas e planas, separadas
 * por fendas escuras (Worley/células periódico, sem o aspecto de poeira do regolito dos outros
 * corpos rochosos). Mesmo formato de `regolith.ts` (altura periódica → albedo + normais).
 */
import { empacotarTexturas, hash, ruidoPeriodico, TAM, type TexturasRegolito } from './regolith';

/** Células de placa por período (ladrilho sem emenda). */
const CELULAS = 7;
/** Jitter do centro de cada célula (0 = grade regular, 1 = célula inteira de folga). */
const JITTER = 0.7;

/** Centro (com jitter) da célula de placa `(cx, cz)`, já na célula desdobrada (sem wrap). */
function centroDaPlaca(cx: number, cz: number): { x: number; z: number } {
  return {
    x: cx + 0.5 + (hash(cx, cz, 71) - 0.5) * JITTER,
    z: cz + 0.5 + (hash(cx, cz, 72) - 0.5) * JITTER,
  };
}

/** Worley periódico: distância ao ponto mais próximo (f1) e ao segundo mais próximo (f2). */
function worleyPeriodico(
  x: number,
  z: number,
  periodo: number,
): { f1: number; f2: number; idX: number; idZ: number } {
  const cx0 = Math.floor(x);
  const cz0 = Math.floor(z);
  let f1 = Infinity;
  let f2 = Infinity;
  let idX = 0;
  let idZ = 0;
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      const cx = (((cx0 + dx) % periodo) + periodo) % periodo;
      const cz = (((cz0 + dz) % periodo) + periodo) % periodo;
      const p = centroDaPlaca(cx, cz);
      // Centro da célula vizinha "desdobrado" (sem o módulo), pra medir a distância certa.
      const px = cx0 + dx + (p.x - cx);
      const pz = cz0 + dz + (p.z - cz);
      const d = Math.hypot(x - px, z - pz);
      if (d < f1) {
        f2 = f1;
        f1 = d;
        idX = cx;
        idZ = cz;
      } else if (d < f2) {
        f2 = d;
      }
    }
  }
  return { f1, f2, idX, idZ };
}

/** Altura (0..1-ish, periódica): placas quase planas (leve variação por placa) com fenda nas bordas. */
function relevoDePlacas(): Float32Array {
  const altura = new Float32Array(TAM * TAM);
  for (let j = 0; j < TAM; j++) {
    for (let i = 0; i < TAM; i++) {
      const x = (i / TAM) * CELULAS;
      const z = (j / TAM) * CELULAS;
      const { f1, f2, idX, idZ } = worleyPeriodico(x, z, CELULAS);
      const alturaPlaca = (hash(idX, idZ, 73) - 0.5) * 0.5;
      // 0 bem na fenda, 1 longe dela: a borda da célula vira um sulco escuro e baixo.
      const longeDaFenda = Math.min(1, (f2 - f1) / 0.1);
      const fino = (ruidoPeriodico(x * 5, z * 5, CELULAS * 5, 74) - 0.5) * 0.12;
      altura[j * TAM + i] = alturaPlaca * longeDaFenda + fino - (1 - longeDaFenda) * 0.55;
    }
  }
  return altura;
}

export function criarTexturasPlacas(): TexturasRegolito {
  // Base um pouco mais escura e com mais contraste que o regolito: as fendas leem como rachaduras.
  return empacotarTexturas(relevoDePlacas(), 0.62, 0.45);
}
