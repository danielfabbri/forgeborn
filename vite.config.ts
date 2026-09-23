import preact from '@preact/preset-vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
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
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
