# Forgeborn — instruções para agentes

RTS 3D de exploração espacial que roda no navegador (TypeScript + Three.js). O projeto segue **Spec Driven Development**: nada é implementado sem estar especificado. Documentos do projeto em pt-BR.

## Fontes de verdade, nesta ordem

1. `SPEC.md`: regras, números, telas e arquitetura. Vence qualquer divergência.
2. `TASKS.md`: ordem de implementação, dependências, critérios de aceite e status.
3. Código e testes: implementam o SPEC.

`doc.txt` é o briefing original. Serve só como referência histórica: não edite e não use para contradizer o SPEC.

## Fluxo obrigatório

1. Identifique a tarefa `T-NNN` em `TASKS.md`. Se o pedido não tiver tarefa correspondente, proponha a tarefa (e, se faltar, a regra no SPEC) antes de escrever código.
2. Confira `Dep:`. Não comece uma tarefa com dependência aberta sem avisar o usuário.
3. Leia as regras citadas em `Spec:`. Não leia o SPEC inteiro: busque o ID (`grep -n "ECO-14" SPEC.md`) e leia a seção dele.
4. Escreva primeiro os testes, a partir dos critérios de aceite, citando o ID da regra no nome: `it('ECO-14: material só conta ao ser descarregado')`.
5. Implemente.
6. Rode os checks (Definição de pronto), marque a tarefa e resuma o que foi coberto.

## Mudar regra ou número

Nunca mude comportamento ou número de jogo direto no código. A ordem é sempre:

1. `SPEC.md`: altere a regra ou a tabela, registre no Changelog (§26) e suba a versão (GOV-08). O texto das regras cita chaves, não valores (GOV-04), e as tabelas `<!-- dados:* -->` seguem o formato de GOV-06.
2. `TASKS.md`: ajuste as tarefas afetadas e a versão do SPEC no cabeçalho.
3. `npm run spec:sync`, depois o código, depois os testes.

Se um invariante (INV-NN) quebrar depois de um ajuste, não afrouxe o teste: reverta o número ou mude o invariante no SPEC, de propósito e com changelog.

## Lacunas e ambiguidades

- Não invente regra nem número. Registre uma questão Q-NN no SPEC §24, com o padrão que você proporia, e pergunte ao usuário antes de implementar a parte afetada.
- Decisões D-NN com status "Proposta" já valem como regra. Implemente conforme o SPEC, sem bloquear a tarefa por isso.
- Itens de §22 (fora de escopo) só entram com pedido explícito do usuário.

## Regras do código

- Números de jogo vêm só de `src/sim/data/generated/`, gerado por `npm run spec:sync`. Nunca escreva valor de balanceamento à mão e nunca edite os JSON gerados.
- `src/sim/` é pura e determinística: sem `three`, `preact` ou DOM; sem `Math.random` nem `Date.now` (use o RNG seedado da simulação); iteração em ordem estável de IDs.
- Toda ação do jogador ou da IA entra na simulação como Comando serializável. Render e UI só leem snapshots e eventos; nunca alteram o estado.
- IDs e chaves de dados exatamente como no SPEC (`hover_explorer`, `carga_hover_u`). Identificadores de código em inglês.
- Texto visível ao jogador só em `src/i18n/pt-BR.json`.
- IDs nunca são reutilizados nem renumerados (GOV-03). Regra nova usa o próximo número livre do prefixo; tarefa nova, o próximo número livre da faixa do marco.

## Definição de pronto

Uma tarefa só vira `[x]` quando:

- todos os critérios de aceite têm teste passando;
- `npm test`, `npm run lint` e `npm run spec:check` estão verdes (os scripts surgem em T-002, T-004 e T-005; antes disso, confira manualmente);
- nenhum número de jogo foi escrito à mão;
- a linha da tarefa recebeu `[x]` e a data no formato AAAA-MM-DD.

Ao concluir, informe quais IDs do SPEC a tarefa cobriu e qual teste prova cada um.

## Comandos (a partir de T-002)

| Comando | Uso |
|---|---|
| `npm run dev` | Jogo local |
| `npm test` | Testes (inclui `spec:check`) |
| `npm run lint` | Lint, incluindo a fronteira da simulação |
| `npm run spec:sync` | Gera os dados a partir das tabelas do SPEC |
| `npm run spec:check` | Valida o SPEC e os dados gerados |
| `npm run sim:match -- --seed N --ais normal,normal` | Partida headless IA × IA |
| `npm run balance:report` | Recalcula as tabelas informativas de §21.2 |

## Git

- Mensagens de commit começam com o ID da tarefa: `T-031: ciclo de coleta do hover`.
- Mudança de SPEC vai num commit próprio: `SPEC 0.2.0: aprova decisões D-01 a D-22`.
