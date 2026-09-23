/**
 * Driver de passo fixo (TEC-04): converte tempo real em ticks da simulação e chama o render
 * com a fração entre o estado anterior e o atual. A velocidade de jogo (REG-20) multiplica o
 * tempo real; pausado, só renderiza.
 */
export interface FixedLoopOptions {
  tickHz: number;
  /** Executa um tick da simulação. */
  step: () => void;
  /** Desenha com `alpha` ∈ [0, 1) entre o estado anterior e o atual. */
  render: (alpha: number) => void;
  /** Quadros mais longos que isto (aba em segundo plano) não viram rajada de ticks. */
  maxFrameMs?: number;
}

export interface FixedLoop {
  /** Multiplicador de velocidade de jogo. */
  speed: number;
  paused: boolean;
  /** Avança `dtMs` de tempo real, roda os ticks devidos e renderiza. Devolve quantos ticks rodaram. */
  advance(dtMs: number): number;
}

export function createFixedLoop(options: FixedLoopOptions): FixedLoop {
  const stepMs = 1000 / options.tickHz;
  const maxFrameMs = options.maxFrameMs ?? 250;
  let accumulator = 0;

  const loop: FixedLoop = {
    speed: 1,
    paused: false,
    advance(dtMs: number): number {
      let steps = 0;
      if (!loop.paused) {
        accumulator += Math.min(Math.max(dtMs, 0), maxFrameMs) * loop.speed;
        while (accumulator >= stepMs) {
          options.step();
          accumulator -= stepMs;
          steps++;
        }
      }
      options.render(accumulator / stepMs);
      return steps;
    },
  };
  return loop;
}
