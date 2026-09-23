# Forgeborn — Nascidos da Forja

RTS 3D de exploração espacial que roda no navegador. Em 2035, quatro inteligências artificiais disputam o Sistema Solar com corpos impressos em 3D.

O projeto segue **Spec Driven Development**:

| Arquivo | Papel |
|---|---|
| [SPEC.md](SPEC.md) | Fonte da verdade: regras, números, telas e arquitetura |
| [TASKS.md](TASKS.md) | Plano de implementação, com critérios de aceite e status |
| [CLAUDE.md](CLAUDE.md) | Regras de trabalho para agentes de IA |
| [doc.txt](doc.txt) | Briefing original (histórico) |

## Como rodar

Requer Node.js 22 ou mais recente.

```bash
npm install
npm run dev
```

O jogo abre em http://localhost:5180 (Ctrl+Shift+D mostra o overlay de depuração).

| Comando | Uso |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Typecheck e build de produção em `dist/` |
| `npm test` | `spec:check` e testes (Vitest) |
| `npm run test:e2e` | Testes E2E (Playwright; no Windows usa o Edge instalado) |
| `npm run lint` | ESLint e Prettier |
| `npm run typecheck` | TypeScript: app, simulação sem DOM e ferramentas |
| `npm run spec:sync` | Gera os dados de jogo a partir do SPEC |
| `npm run spec:check` | Valida o SPEC e os dados gerados |
| `npm run sim:match` | Partida headless IA × IA |
| `npm run balance:report` | Relatório de balanceamento |

O TypeScript está fixado na 6.0.x porque o typescript-eslint ainda não suporta a 7.x.
