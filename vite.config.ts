import preact from '@preact/preset-vite';
import { defineConfig } from 'vitest/config';

export default defineConfig(({ mode }) => ({
  plugins: [preact()],
  server: {
    // Porta própria, longe da 5173 padrão do Vite (usada por outros projetos na máquina).
    port: 5180,
  },
  build: {
    // Three.js sozinho passa de 500 kB; o orçamento real de download é o da TEC-18.
    chunkSizeWarningLimit: 1500,
  },
  test: {
    // Orçamentos de tempo (tests/perf) rodam à parte, sem outros arquivos disputando a CPU:
    // npm run test:perf usa --mode perf.
    include: mode === 'perf' ? ['tests/perf/**/*.test.ts'] : ['tests/**/*.test.ts'],
    exclude: mode === 'perf' ? ['node_modules/**'] : ['tests/perf/**', 'node_modules/**'],
    fileParallelism: mode !== 'perf',
    // Testes de simulação rodam milhares de ticks; com todos os arquivos em paralelo, os mais
    // pesados passam dos 5 s padrão. Os orçamentos de tempo de verdade ficam em tests/perf.
    testTimeout: 30_000,
    environment: 'node',
  },
}));
