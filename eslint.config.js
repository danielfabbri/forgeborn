import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// TEC-03 e TEC-05: a simulação é pura, determinística e roda sem DOM (navegador ou Node).
const SIM_GLOBAIS_PROIBIDOS = [
  'window',
  'document',
  'navigator',
  'location',
  'localStorage',
  'sessionStorage',
  'indexedDB',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'performance',
  'setTimeout',
  'setInterval',
  'clearTimeout',
  'clearInterval',
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'Worker',
  'crypto',
];

const fronteiraDaSimulacao = {
  files: ['src/sim/**/*.ts'],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          { group: ['three', 'three/*'], message: 'TEC-03: a simulação não importa Three.js.' },
          {
            group: ['preact', 'preact/*', '@preact/*'],
            message: 'TEC-03: a simulação não importa Preact.',
          },
          {
            regex: '(^|/)(render|ui|input|audio|game)(/|$)',
            message: 'TEC-03: a simulação não depende de render, ui, input, audio nem game.',
          },
          {
            regex: '^(node:|fs$|path$|os$|child_process$|worker_threads$)',
            message: 'TEC-03: a simulação também roda no navegador; sem APIs do Node.',
          },
        ],
      },
    ],
    'no-restricted-globals': [
      'error',
      ...SIM_GLOBAIS_PROIBIDOS.map((name) => ({
        name,
        message: 'TEC-03/TEC-05: API de DOM ou de tempo real proibida na simulação.',
      })),
    ],
    'no-restricted-properties': [
      'error',
      { object: 'Math', property: 'random', message: 'TEC-05: use o RNG seedado da simulação.' },
      { object: 'Date', property: 'now', message: 'TEC-05: tempo real é proibido na simulação.' },
    ],
    'no-restricted-syntax': [
      'error',
      {
        selector: "NewExpression[callee.name='Date']",
        message: 'TEC-05: tempo real é proibido na simulação.',
      },
    ],
  },
};

export default defineConfig(
  globalIgnores([
    'dist/',
    'coverage/',
    'test-results/',
    'playwright-report/',
    'src/sim/data/generated/',
    'tests/fixtures/',
  ]),
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['tools/**/*.ts', 'tests/**/*.ts', '*.config.{js,ts}'],
    languageOptions: { globals: globals.node },
  },
  fronteiraDaSimulacao,
  prettier,
);
