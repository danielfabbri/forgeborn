# FORGEBORN — TASKS.md

**Plano de implementação (Spec Driven Development)**

| Campo | Valor |
|---|---|
| Derivado de | `SPEC.md` v1.11.0 |
| Data | 2026-09-23 |
| Próximo marco | MVP — Free Battle Lua |

> O `SPEC.md` diz **o quê** e **quanto**; este arquivo diz **em que ordem** e **como verificar**. Nenhuma tarefa cria regra nova: se faltar regra, ela entra primeiro no SPEC.

## Como trabalhar

1. Pegue a próxima tarefa **desbloqueada** (dependências concluídas), de preferência no caminho crítico.
2. Leia todos os IDs do SPEC citados na tarefa. Se algo estiver ambíguo, registre uma questão Q-NN no SPEC §24 e pergunte antes de inventar.
3. Escreva primeiro os testes, a partir dos critérios de aceite. O nome do teste cita o ID da regra (TEC-24).
4. Implemente. Números de balanceamento vêm de `src/sim/data/generated/`, nunca escritos à mão (TEC-12).
5. Com `npm test`, `npm run lint` e `npm run spec:check` verdes, marque `[x]` e anote a data.
6. Mudou uma regra ou um número? Primeiro o SPEC, depois este arquivo, depois o código (GOV-02).

**Legenda:** `[ ]` a fazer · `[~]` em andamento · `[x]` feito · `[!]` bloqueado.
**Tamanho:** `P` ≤ 0,5 dia · `M` 1–2 dias · `G` 3–5 dias.

## Marcos

| Marco | Tarefas | Resultado verificável |
|---|---|---|
| M0 Fundação | T-000 – T-008 | Projeto roda; dados gerados do SPEC; simulação headless determinística |
| M1 Mundo | T-010 – T-016 | Planeta lunar gerado por seed, grades, câmera RTS |
| M2 Entidades e movimento | T-020 – T-027 | Selecionar e mover unidades placeholder com pathfinding |
| M3 Economia | T-030 – T-038 | Coleta → entrega → estoque, com diretiva, silo e reciclagem |
| M4 Energia | T-040 – T-049 | Rede, baterias, recarga, usinas e Bateria Móvel |
| M5 Produção | T-050 – T-059 | Filas, construção, assistência, reparo e início de partida |
| M6 Combate | T-060 – T-068 | Armas, dano, minas, explosões, eliminação e invariantes |
| M7 Visão | T-070 – T-077 | Névoa de 3 estados, Sentinela, satélite, minimapa |
| M8 HUD | T-080 – T-087 | Interface completa em pt-BR |
| M9 IA | T-090 – T-096 | 4 dificuldades × 4 personalidades; IA × IA estável |
| M10 Telas e Free Battle | T-100 – T-108 | **MVP: Free Battle Lua jogável do início ao fim** |
| M11 Controle direto | T-110 – T-113 | 1ª e 3ª pessoa com Sincronia |
| M12 Arte e áudio | T-120 – T-129 | Visual e som finais da Lua |
| M13 Campanha | T-130 – T-135 | Universo + missões 1–2 → **v1.0** |
| M14 Release web | T-140 – T-143 | Performance, compatibilidade e deploy |
| M15 Pós-v1 | T-150 – T-160 | Cenários e missões 3–8, salvar partida, inglês |
| M16 Vastidão | T-161 – T-169 | Corpos do tamanho proporcional, ritmo de exploração (D-79) |
| M17 Rede e cidades | T-170 – T-179 | Rede elétrica por cabos (D-85) |
| M18 Mares | T-180 – T-189 | Mares, Porto e embarcações (D-90) |

## Caminho crítico até o MVP

T-001 → T-002 → T-004 → T-006 → T-016 → T-010 → T-013 → T-022 → T-023 → T-030 → T-031 → T-032 → T-040 → T-041 → T-050 → T-053 → T-056 → T-060 → T-061 → T-063 → T-070 → T-090 → T-093 → T-104 → T-106

Podem andar em paralelo ao caminho crítico: T-000 (produto), render (T-008, T-014, T-015, T-020), telas (T-100 – T-103) e HUD (M8), assim que suas dependências fecharem.

---

## M0 — Fundação

- [ ] **T-000 — Aprovar o SPEC v0.1** · produto · Spec: §23, §24 · Dep: —
  - Revisar as decisões D-01 a D-22, D-25 e D-26 (D-23 e D-24 já foram aprovadas) e responder Q-01 a Q-05.
  - Aceite: cada decisão marcada como "Aprovada" ou alterada com entrada no Changelog; SPEC sobe de versão MINOR.
- [x] **T-001 — Repositório** · P · Spec: GOV-02 · Dep: — · Feito: 2026-09-23
  - `git init`, `.gitignore` (node_modules, dist, coverage), README curto apontando para `SPEC.md`, `TASKS.md`, `CLAUDE.md` e `doc.txt`.
  - Aceite: primeiro commit contém os quatro documentos.
- [x] **T-002 — Scaffold do projeto** · M · Spec: TEC-01, TEC-03 · Dep: T-001 · Feito: 2026-09-23
  - Vite + TypeScript strict + Three.js + Preact/Signals + Vitest + Playwright + ESLint/Prettier; pastas de TEC-03; scripts `dev`, `build`, `test`, `lint`, `spec:sync`, `spec:check`, `sim:match`, `balance:report` (os três últimos podem começar como stubs).
  - Aceite: `npm run dev` mostra uma cena Three.js vazia; `npm test`, `npm run lint` e `npm run build` verdes.
- [x] **T-003 — Fronteira da simulação** · P · Spec: TEC-03, TEC-05 · Dep: T-002 · Feito: 2026-09-23
  - Regra de lint: `src/sim/**` não importa `three`, `preact` nem APIs de DOM; `Math.random` e `Date.now` proibidos ali.
  - Aceite: um arquivo-fixture com import proibido faz o lint falhar; o código real passa.
- [x] **T-004 — `spec:sync`** · M · Spec: GOV-04, GOV-05, GOV-06, TEC-11 · Dep: T-002 · Feito: 2026-09-23
  - Parser das tabelas `<!-- dados:NOME -->` do `SPEC.md` → `src/sim/data/generated/NOME.json` + `types.ts`. Tabelas com o mesmo nome são concatenadas.
  - Aceite: gera um arquivo para cada nome de tabela `dados:*`; converte `0,5` → 0.5, `—` → null, `sim`/`nao` → booleanos; células com `+` viram listas só quando todas as partes são IDs snake_case ou números (`solo+ar` vira lista, `Ctrl+1..9` continua texto); duas execuções seguidas produzem saída idêntica.
- [x] **T-005 — `spec:check`** · M · Spec: TEC-11 · Dep: T-004 · Feito: 2026-09-23
  - Validações: gerados atualizados; `vr` = Σ receita × VR; pesos de cada personalidade somam 100; IDs e chaves de parâmetro únicos; referências válidas (armas das tabelas de unidades, `produzido_por`, cenários e `libera` das missões); citações em crase com formato de chave (snake_case, sem espaço, barra ou ponto) existem como chave de parâmetro, coluna ou ID de alguma tabela; curingas `*` casam com ao menos uma chave.
  - Aceite: cada validação tem teste com uma cópia quebrada do SPEC e mensagem que aponta tabela e linha; o SPEC atual passa.
- [x] **T-006 — Núcleo da simulação** · G · Spec: TEC-04 – TEC-09, REG-20 · Dep: T-003, T-004 · Feito: 2026-09-23
  - Loop de passo fixo, RNG seedado, entidades e componentes, ordem de sistemas de TEC-06, comandos serializáveis, barramento de eventos, snapshot JSON.
  - Aceite: mesma seed + mesmos comandos ⇒ hash de estado idêntico após 10.000 ticks; snapshot → restauração → mesmo hash.
- [x] **T-007 — Runner headless** · P · Spec: TEC-25 · Dep: T-006 · Feito: 2026-09-23
  - CLI `sim:match` com seed, IAs e duração máxima. Sem IA por enquanto: roda os ticks e imprime o hash final e o tempo médio do tick.
  - Aceite: roda em Node sem DOM e termina com código 0.
- [x] **T-008 — Loop de render e overlay de depuração** · M · Spec: TEC-04, TEC-26 · Dep: T-006 · Feito: 2026-09-23
  - `requestAnimationFrame` com interpolação entre estados; overlay Ctrl+Shift+D com FPS, ms do tick e contagem de entidades.
  - Aceite: uma entidade de teste se move suavemente com a simulação em `tick_hz` e o render a 60+ fps.

## M1 — Mundo

- [x] **T-016 — Geometria da esfera** · M · Spec: CEN-14, CEN-15 · Dep: T-006 · Feito: 2026-09-23
  - Cubo-esfera equiangular: ponto ↔ (face, u, v) ↔ célula, vizinhança de 8 atravessando arestas (7 nos vértices do cubo), arco de grande círculo, passo ao longo do arco com transporte do rumo, norte local.
  - Aceite: ida e volta ponto → célula → centro a menos de meia célula; vizinhança simétrica (se B é vizinha de A, A é vizinha de B); soma das áreas das células = 4π·raio² ± 0,1%; as rotações de CEN-06 levam célula em célula; andar 2π·raio pelo equador volta ao ponto de partida.
- [x] **T-010 — Gerador de mapas lunares** · G · Spec: CEN-06 – CEN-09, CEN-13 · Dep: T-016 · Refeita no planeta (D-24) · Feito: 2026-09-23
  - Heightmap de 16 bits nas 6 faces: crateras, colinas, sulcos, platôs de pouso com rampas, simetria rotacional N = 2 ou 4, sem borda.
  - Aceite: mesma seed ⇒ mesmo hash; teste de simetria (altura em p e em g·p iguais, ± 1 cm, para cada rotação g do grupo); platôs com inclinação < 5° em relação à vertical local; zonas nos pontos de CEN-07.
- [x] **T-011 — Distribuição de jazidas** · M · Spec: ECO-07, ECO-08, CEN-10 · Dep: T-010 · Refeita no planeta (D-24) · Feito: 2026-09-23
  - Aceite: contagens e quantidades = `dados:jazidas` × perfil do cenário; distâncias (arcos) dentro das faixas; contestadas e centrais nos pontos médios de ECO-08, com as jazidas centrais divididas entre os 2 pontos.
- [x] **T-012 — Validação do gerador e presets** · M · Spec: CEN-11, CEN-12, §14.4 · Dep: T-011, T-013 · Refeita no planeta (D-24) · Feito: 2026-09-23
  - Aceite: 100 seeds testadas, inválidas rejeitadas com o motivo; presets Mare Imbrium (P), Mare Tranquillitatis (M) e Oceanus Procellarum (G) fixados de novo.
- [x] **T-013 — Grades derivadas** · M · Spec: TEC-13, MOV-01, PRD-10 · Dep: T-010 · Refeita no planeta (D-24) · Feito: 2026-09-23
  - Navegação (`celula_navegacao_m`), construção (`celula_construcao_m`) e névoa (`celula_nevoa_m`), nas 6 faces.
  - Aceite: com heightmap sintético, células acima de `inclinacao_max_hover_graus` (vertical local) são intransponíveis e acima de `inclinacao_max_construcao_graus` não aceitam construção, inclusive nas arestas do cubo.
- [~] **T-014 — Renderização do terreno** · G · Spec: TEC-13, ART-08, ART-11, §14.4 · Dep: T-010, T-008 · Refeita no planeta (D-24) · Falta: aprovação das capturas em `docs/referencia/t014-*.png` e `t015-rts-perto.png`
  - Chunks por face com LOD e emendas sem fresta nas arestas, material de regolito, sol que acompanha o foco (ART-11) com sombras, céu estrelado com a Terra escura. Sem entorno: o planeta é o mundo inteiro.
  - Aceite: planeta M a ≥ 60 fps no preset Médio no hardware-alvo (TEC-15); nenhuma fresta visível nas arestas do cubo; captura de referência aprovada pelo produto.
- [x] **T-015 — Câmera RTS** · M · Spec: CTL-01 – CTL-03, CTL-16 · Dep: T-014 · Refeita no planeta (D-24) · Feito: 2026-09-23
  - Aceite: pan por setas e bordas dando a volta no planeta sem a câmera girar sozinha; zoom de 15 a 120 m com inclinação dinâmica e visão planetária até 3,5 × `raio_m`; rotação pelo botão do meio; Home aponta para o norte.

## M2 — Entidades, seleção e movimento

- [~] **T-020 — Modelos placeholder e identidade de nação** · M · Spec: ART-02, ART-03, TEC-16, TEC-18 · Dep: T-014 · Refeita no planeta (D-24) · Falta: aprovação das capturas `docs/referencia/t020-*.png`
  - Modelos procedurais com as silhuetas das fichas (§8.5); tarja e olho emissivos com a cor da nação por instância.
  - Aceite: as 10 unidades móveis e as 6 estruturas são distinguíveis a 60 m de altura; 400 unidades instanciadas em ≤ 300 draw calls.
- [x] **T-021 — Seleção e grupos** · M · Spec: CTL-04 – CTL-06 · Dep: T-020 · Refeita no planeta (D-24) · Feito: 2026-09-23
  - Aceite: clique, caixa, Shift, duplo clique, Ctrl+clique e grupos Ctrl+1..9 funcionam conforme o SPEC; caixa prefere unidades móveis a estruturas.
- [x] **T-022 — Movimento de solo** · M · Spec: MOV-01, MOV-03, MOV-04, CEN-14 · Dep: T-013 · Refeita no planeta (D-24) · Feito: 2026-09-23
  - Aceite: aceleração e giro conforme as tabelas; unidades não atravessam estruturas; 50 unidades paradas juntas se separam sem tremer. (Colisão com jazidas passou para T-030, por causa de Q-06.)
- [x] **T-023 — Pathfinding e formação** · G · Spec: MOV-05, MOV-06, TEC-14 · Dep: T-022 · Refeita no planeta (D-24) · Feito: 2026-09-23
  - Aceite: 100 unidades vão de uma zona de pouso à mais distante sem ficar presas (headless, 10 seeds), inclusive passando por arestas e vértices do cubo; cálculo por ordem < 5 ms; o grupo chega em formação na velocidade do mais lento.
- [x] **T-024 — Camada aérea e pouso de drones** · M · Spec: MOV-02, MOV-07, ENE-09 · Dep: T-022 · Refeita no planeta (D-24) · Feito: 2026-09-23
  - Aceite: drones voam a `altitude_drone_m` ignorando relevo; pousam após `pouso_automatico_s` ociosos; decolam por ordem ou com inimigo visível.
- [x] **T-025 — Comandos básicos e clique direito** · M · Spec: CTL-07 (parcial), CMB-13, PRD-08 · Dep: T-021, T-023 · Refeita no planeta (D-24) · Feito: 2026-09-23
  - Mover, parar, manter posição, patrulhar e ponto de encontro.
  - Aceite: cada comando testado por comando serializado (TEC-07) e pela interface.
- [x] **T-026 — Limites da nação** · P · Spec: REG-16 – REG-19 · Dep: T-006 · Feito: 2026-09-23
  - Aceite: uma ordem que excede `limite_corpos`, `limite_bases_lancamento` ou `limite_minas_ativas` é recusada e emite AL-11.
- [x] **T-027 — Postura Defensiva por padrão** · P · Spec: CMB-13, §8.6, D-70 · Dep: T-061 · Feito: 2026-09-26
  - Aceite: unidades armadas do jogador nascem Defensivas (perseguem até `leash_defensivo_m` e voltam); as da IA nascem Agressivas.

## M3 — Economia

- [x] **T-030 — Jazidas** · M · Spec: ECO-04 – ECO-06 · Dep: T-011 · Feito: 2026-09-23
  - Aceite: hover além de `slots_por_jazida` procura outra jazida a até `raio_busca_jazida_m`, ou espera; jazida some em 0 e emite AL-07; tamanho visual proporcional à quantidade.
  - Aceite: jazida é obstáculo rígido (MOV-04) com o raio de ECO-05 (D-27), que encolhe com a quantidade; unidades não a atravessam; a navegação só é refeita quando as células bloqueadas mudam.
- [x] **T-031 — Ciclo de coleta** · M · Spec: ECO-09 – ECO-12 · Dep: T-030, T-023 · Feito: 2026-09-23
  - Aceite: minera só a até `distancia_mineracao_m` da borda da jazida; taxa por recurso = `taxa_mineracao_u_s`; descarga em `tempo_descarga_hover_s`; escolha do ponto de entrega mais próximo pelo caminho; INV-01 verde.
- [x] **T-032 — Estoque e contabilização** · M · Spec: ECO-14 – ECO-17 · Dep: T-031 · Feito: 2026-09-23
  - Aceite: carga em hover não pode ser gasta; descarregar na Nave ou num Armazém incrementa o estoque; o valor "em trânsito" é publicado para o HUD.
- [x] **T-033 — Diretiva de Coleta** · M · Spec: ECO-18 – ECO-21 · Dep: T-031 · Feito: 2026-09-23
  - Aceite: 20 hovers ociosos com todas as jazidas conhecidas se distribuem conforme `diretiva_*_pct`, com erro ≤ 1 hover por recurso; recurso sem jazida elegível é ignorado e sinalizado; ordem manual prevalece.
- [x] **T-034 — Fuga de hovers** · P · Spec: ECO-13 · Dep: T-031, T-060 · Feito: 2026-09-24
  - Aceite: hover atingido foge para a estrutura armada mais próxima e retoma após `fuga_hover_retorno_s` sem dano; a chave nas Diretivas desliga o comportamento.
- [x] **T-035 — Silo Móvel** · M · Spec: ECO-22 – ECO-26 · Dep: T-032 · Feito: 2026-09-23 (a ECO-26, carga no destroço, fica com a T-036)
  - Aceite: só recebe descargas ancorado; ciclo automático no `limiar_ciclo_silo_pct`; a carga só conta depois de descarregar num depósito; hovers se redirecionam enquanto o silo está fora.
- [x] **T-036 — Destroços e reciclagem** · M · Spec: ECO-27 – ECO-29 · Dep: T-032, T-060 · Feito: 2026-09-24
  - Aceite: destroço = piso(receita × `rendimento_destroco_pct`%) por recurso; some no prazo; a sucata vira os recursos certos ao ser descarregada; o destroço do silo inclui `rendimento_carga_silo_pct`% da carga.
- [x] **T-037 — Silo Móvel sem ancorar** · M · Spec: ECO-10, ECO-22 – ECO-24, CTL-07, CTL-10, UI-14, D-60 · Dep: T-035 · Feito: 2026-09-25
  - Aceite: o silo recebe parado ou andando (menos descarregando); descarrega sozinho ao encostar na Nave ou num Armazém; clique direito dos hovers no silo descarrega qualquer carga e eles voltam a minerar, com sinalizador de descarregar.
- [x] **T-038 — Diretiva não move quem o jogador parou** · P · Spec: ECO-19, D-69 · Dep: T-033 · Feito: 2026-09-26
  - Aceite: hover parado por ordem do jogador fica parado além de `hover_ocioso_alerta_s` (só conta para AL-09 e o botão de parados); recém-impresso e com jazida esgotada seguem pela Diretiva.

## M4 — Energia

- [x] **T-040 — Rede de energia** · M · Spec: ENE-01 – ENE-05 · Dep: T-006 · Feito: 2026-09-23
  - Aceite: testes de geração, capacidade, excedente perdido e de cada nível de prioridade do racionamento, incluindo satélite offline.
- [x] **T-041 — Baterias e estados** · M · Spec: ENE-08 – ENE-11 · Dep: T-040, T-022 · Feito: 2026-09-24 (o custo do Impulso entrou com a T-111)
  - Aceite: custo de cada tarefa da tabela §6.3 verificado; unidade parada no solo gasta 0; Modo Reserva anda a `modo_reserva_vel_pct`% e não executa tarefas.
- [x] **T-042 — Portas de recarga** · M · Spec: ENE-12 – ENE-14 · Dep: T-041 · Feito: 2026-09-23
  - Aceite: 1 unidade por porta; fila por ordem de chegada; escolha pelo menor tempo estimado; a recarga retira energia do banco.
- [x] **T-043 — Auto-recarga** · M · Spec: ENE-15, ENE-16 · Dep: T-042 · Feito: 2026-09-24
  - Aceite: limiares `auto_recarga_*` por papel; militares não saem em combate; drones saem em `recarga_forcada_drone_pct` mesmo em combate; a Impressora pausa a impressão, recarrega e retoma.
- [x] **T-044 — Usinas** · M · Spec: ENE-06, ENE-07 · Dep: T-040, T-053 · Feito: 2026-09-23 (usinas criadas por comando de depuração até a T-053)
  - Aceite: solar gera `geracao_en_s` × `fator_solar`; nuclear consome `nuclear_consumo_u` a cada `nuclear_intervalo_s`, gera 0 sem Urânio (AL-10) e religa em `nuclear_religar_s`.
- [x] **T-045 — Bateria Móvel** · M · Spec: ENE-17 – ENE-21 · Dep: T-042 · Feito: 2026-09-23 (a ENE-21, explosão, fica com a CMB-23)
  - Aceite: atende até `bateria_movel_max_alvos` alvos a `bateria_movel_taxa_por_alvo_en_s` cada, começando pela menor %; volta para recarregar em `auto_recarga_bateria_movel_pct`; alvos não procuram porta enquanto recebem energia.
- [x] **T-046 — Invariantes de energia** · P · Spec: INV-09, INV-10 · Dep: T-043, T-061 · Feito: 2026-09-24 (INV-09 medido em 10 min de jogo)
  - Aceite: INV-09 e INV-10 verdes em `tests/balance/`.
- [x] **T-047 — Recarga na Bateria Móvel pelo clique direito** · P · Spec: CTL-07, ENE-18, D-57 · Dep: T-045 · Feito: 2026-09-25
  - Aceite: clique direito na Bateria Móvel própria leva as unidades selecionadas até ela e as recarrega com qualquer nível, até 100%, antes das demais.
- [x] **T-048 — Bateria Móvel encostada, carregar unidade e brilho** · M · Spec: ENE-18, ENE-23, ENE-24, D-59 · Dep: T-047 · Feito: 2026-09-25
  - Aceite: suporte só para unidades encostadas; clique direito numa unidade própria com a Bateria Móvel selecionada leva a bateria até ela e a enche até 100%; brilho ligado/desligado e botão no cartão; 2000 EN.
- [x] **T-049 — Torre Magnética** · M · Spec: UNI-13, D-65 · Dep: T-045 · Feito: 2026-09-25
  - Aceite: inimigos no campo ficam mais lentos e perdem EN, com efeito que cai até a borda e vale menos em blindados; a torre guarda até o limite e para de drenar cheia; repassa aos aliados no campo, os de menor % primeiro.

## M5 — Produção e construção

- [x] **T-050 — Filas e pagamento** · M · Spec: PRD-01 – PRD-06 · Dep: T-032, T-041 · Feito: 2026-09-23
  - Aceite: matriz de produção respeitada (a Impressora não imprime Impressora); pagamento ao enfileirar; AL-06 lista o que falta; cancelar devolve `reembolso_cancelamento_pct`%; energia consumida durante a impressão (rede na Nave, bateria na Impressora).
- [x] **T-051 — Impressão de unidades** · M · Spec: PRD-07 – PRD-09 · Dep: T-050 · Feito: 2026-09-23
  - Aceite: a Impressora só imprime parada e retoma ao parar; a unidade nasce ao lado e vai ao ponto de encontro; hover com ponto de encontro numa jazida começa a minerar.
- [x] **T-052 — Posicionamento de estruturas** · M · Spec: PRD-10, UI-08 · Dep: T-013, T-050 · Feito: 2026-09-23 (o planeta não tem limites de mapa, D-24; terreno explorado desde a T-070)
  - Aceite: holograma verde ou vermelho com o motivo; regras de inclinação, folga de jazida, terreno explorado e limites do mapa.
- [x] **T-053 — Canteiro e obra** · M · Spec: PRD-11 – PRD-14, ART-06 (versão simples) · Dep: T-052 · Feito: 2026-09-23
  - Aceite: HP inicial `hp_inicial_canteiro_pct`% e crescente; dano descontado do HP final; nada funciona antes de 100%; canteiro retomável; cancelamento devolve recursos.
- [x] **T-054 — Poder de Impressão e assistência** · M · Spec: PRD-15 – PRD-17 · Dep: T-053 · Feito: 2026-09-23
  - Aceite: velocidade = Σ PI ÷ `tempo_s` (com os valores atuais, 1 Impressora + 2 hovers = 2,0 PI, metade do tempo); energia dividida por PI; hovers continuam um canteiro sem a Impressora; no máximo `max_assistentes`.
- [x] **T-055 — Reparo** · P · Spec: PRD-18, PRD-19 · Dep: T-054 · Feito: 2026-09-23
  - Aceite: taxas por reparador e tipo de alvo; no máximo `max_reparadores`; drones só pousados; Impressora ociosa repara dentro de `raio_reparo_auto_m`.
- [x] **T-056 — Início de partida** · M · Spec: REG-04 – REG-08, FLX-09 (versão simples) · Dep: T-050, T-033 · Feito: 2026-09-23 (o pouso é o hover saindo pela rampa, sem cinemática; área explorada inicial desde a T-070)
  - Aceite: cada nação começa com Nave e 1 hover; estoque inicial por modo; área explorada inicial; o hover inicial coleta sozinho; INV-02 verde.
- [x] **T-057 — Muro e Portão** · M · Spec: UNI-08, UNI-09, D-53, D-54 · Dep: T-052 · Feito: 2026-09-25
  - Aceite: Muro bloqueia hovers e deixa drones passarem; posicionamento em linha arrastando; Portão abre sozinho para unidades próprias no raio e fecha depois do tempo, deixa qualquer um passar aberto, e trancado não abre; inimigos atacam o muro que fecha o caminho.
- [x] **T-058 — Giro e encaixe de Muro e Portão** · M · Spec: UNI-08, UNI-09, D-56 · Dep: T-057 · Feito: 2026-09-25
  - Aceite: apertar e arrastar gira o segmento livremente; apertar perto da ponta livre de outro segmento encaixa nela; o obstáculo segue o segmento girado; as unidades do dono planejam caminho pelo próprio portão destrancado e as inimigas não.
- [x] **T-059 — Base de Lança-Mísseis e Bateria Antiaérea** · G · Spec: UNI-10 – UNI-12, D-63, D-64 · Dep: T-062 · Feito: 2026-09-25
  - Aceite: a base fabrica mísseis curtos e longos até 5; clique direito lança o da frente no ponto dentro do alcance (mesmo no escuro), recusa fora dele e espera a recarga entre lançamentos; o míssil detona no ponto; a Antiaérea dispara um por vez contra mísseis e drones, com a chance de acerto pela distância, e erra explodindo sozinha.

## M6 — Combate

- [x] **T-060 — Dano, HP e morte** · M · Spec: CMB-01 – CMB-03, CMB-27 · Dep: T-006 · Feito: 2026-09-24
  - Aceite: multiplicadores de `dados:multiplicadores` aplicados; dano mínimo 1; eventos de dano e morte publicados no barramento.
- [x] **T-061 — Armas hitscan** · M · Spec: CMB-04, CMB-06, ENE-03 · Dep: T-060, T-041, T-040 · Feito: 2026-09-24
  - EX1, Drone Laser, Torre e defesa da Nave.
  - Aceite: camadas de alvo respeitadas; energia debitada da bateria ou da rede conforme `fonte_en`; torre em racionamento dispara mais devagar.
- [x] **T-062 — Torpedo, bomba e splash** · M · Spec: CMB-07, CMB-08, CMB-10, CMB-11 · Dep: T-061 · Feito: 2026-09-24
  - Aceite: torpedo guiado detona na última posição se o alvo morrer; bomba com mira preditiva erra alvo que muda de direção; curva de splash conforme `nucleo_splash_pct` e `splash_borda_pct`; sem fogo amigo.
- [x] **T-063 — Alvos, posturas e mente única** · G · Spec: CMB-12 – CMB-18 · Dep: T-061, T-023 · Feito: 2026-09-24 (Q-08 aguarda resposta)
  - Aceite: prioridade de alvo coberta por teste; perseguição limitada por postura; ataque-movimento; sem desperdício de dano (CMB-16); resposta a ataques contra aliados na visão.
- [x] **T-064 — Minas** · M · Spec: UNI-01, UNI-02, UNI-07, CMB-09, CMB-19 – CMB-21, REG-18 · Dep: T-062 · Feito: 2026-09-24 (minas inimigas ficam invisíveis até a detecção da T-065)
  - Aceite: fabricação automática consome a receita de `mine`; plantio, armar e Campo minado com os tempos e espaçamento das tabelas; só hovers inimigos acionam; limite de minas ativas.
- [x] **T-065 — Detecção e camuflagem** · M · Spec: VIS-05, CMB-22 · Dep: T-064, T-070 · Feito: 2026-09-24
  - Aceite: minas e Sentinelas só aparecem para inimigos dentro de `deteccao_m` de um detector; mina revelada vira alvo e é evitada pelo pathfinding.
- [x] **T-066 — Explosões ambientais e radiação** · P · Spec: CMB-23 – CMB-26 · Dep: T-062 · Feito: 2026-09-24
  - Aceite: explosões da Bateria Móvel, da Usina Nuclear e da Nave com dano e raio das tabelas, atingindo todas as nações; zona de radiação com duração e dano por segundo; drones em voo imunes.
- [x] **T-067 — Eliminação, vitória e derrota** · M · Spec: REG-09 – REG-15 · Dep: T-060, T-050 · Feito: 2026-09-24 (a tela de fim de partida completa fica com FLX-12)
  - Aceite: nação sem Nave e sem Impressoras é eliminada e se autodestrói sem dano; última nação vence; render-se; tempo limite decide por pontuação.
- [x] **T-068 — Invariantes de combate e relatório de balanceamento** · M · Spec: INV-03 – INV-08, INV-11, INV-13, §21.2 · Dep: T-063, T-064 · Feito: 2026-09-24
  - `npm run balance:report` recalcula as tabelas informativas de §21.2 a partir dos dados gerados.
  - Aceite: todos os INV citados verdes; o relatório bate com §21.2 da v0.1.0.
- [x] **T-069 — Recolher mineradores** · M · Spec: CMB-28, D-52 · Dep: T-062 · Feito: 2026-09-25
  - Aceite: Q (ou o botão da Nave) leva os hovers de exploração ao abrigo mais próximo com vaga; abrigados somem e não são atingidos; cada um soma um disparo de `abrigo_laser`; de novo, libera para a coleta; com a estrutura destruída, saem ao lado.

## M7 — Visão

- [x] **T-070 — Névoa na simulação** · M · Spec: VIS-01 – VIS-03 · Dep: T-013, T-022 · Feito: 2026-09-24
  - Aceite: três estados por nação, atualizados a `nevoa_atualizacao_hz`; visão circular por unidade e estrutura; visão compartilhada na nação.
- [x] **T-071 — Névoa no render e fantasmas** · M · Spec: VIS-01, VIS-04, TEC-17 · Dep: T-070, T-014 · Feito: 2026-09-24 (sinais de radar e círculos de satélite também no mundo)
  - Aceite: escuro absoluto preto com céu visível; névoa dessaturada; fantasmas de estruturas com tipo e HP da última observação, removidos quando a área é revista.
- [x] **T-072 — Hover de Observação e Sentinela** · M · Spec: UNI-03, VIS-06, VIS-07 · Dep: T-070, T-065 · Feito: 2026-09-24
  - Aceite: implantar e recolher com os tempos das tabelas; sinais de radar sem tipo; AL-03 com contagem e um dos 8 rumos corretos; camuflagem conforme CMB-22.
- [x] **T-073 — Satélite** · M · Spec: UNI-04 – UNI-06, VIS-08, ENE-04, REG-17 · Dep: T-053, T-070 · Feito: 2026-09-24 (T reposiciona, G faz a Varredura na Base de Lançamento)
  - Aceite: lançamento cancelável pela destruição da base; visão persistente reposicionável; Varredura com custo, duração e recarga; offline em racionamento (AL-17).
- [x] **T-074 — Minimapa** · M · Spec: VIS-09, UI-05, CTL-03 · Dep: T-071 · Feito: 2026-09-24 (o painel de produção foi para o canto inferior direito, lugar do cartão de comandos)
  - Aceite: mostra os três estados, unidades, fantasmas, sinais, círculos de satélite e o campo da câmera; clique move a câmera e clique direito dá ordem.
- [x] **T-075 — Satélite em órbita e combate orbital** · M · Spec: UNI-05, ENE-04, D-51 · Dep: T-073 · Feito: 2026-09-25
  - Aceite: satélite visível no céu e selecionável; clique direito reposiciona a `satelite_vel_m_s` ou ataca satélite inimigo; `sat_laser` só atinge satélites e nada atinge satélite além dele; sem gasto de energia; cai com a base.
- [x] **T-076 — Satélite impresso pela Base** · P · Spec: UNI-04, PRD-01, PRD-06, D-55 · Dep: T-075 · Feito: 2026-09-25
  - Aceite: a Base pronta não lança sozinha; S imprime o Satélite com a energia da rede, um por base de cada vez; pronto, lança em `tempo_lancamento_satelite_s`; custo e velocidade de `dados`.
- [x] **T-077 — Suporte em raio: Bateria Móvel sempre ativa e Torre Magnética que repara** · P · Spec: ENE-08, ENE-18, ENE-24, UNI-13, D-71, D-72 · Dep: T-049 · Feito: 2026-09-26
  - Aceite: a Bateria Móvel sai cheia, não liga nem desliga e atende no raio `bateria_movel_raio_m` casco a casco; a Torre Magnética repara até `mag_max_aliados` unidades próprias no campo a `mag_reparo_hp_s`.

## M8 — HUD e UX

- [x] **T-080 — Barra superior** · M · Spec: UI-01, ENE-22 · Dep: T-032, T-040 · Feito: 2026-09-25 (o clique nos recursos abre as Diretivas com a T-083)
  - Aceite: recursos com "em trânsito", energia com as três cores do indicador, corpos, relógio e menu.
- [x] **T-081 — Painel de seleção e retrato 3D** · M · Spec: UI-03 · Dep: T-021 · Feito: 2026-09-24
- [~] **T-082 — Cartão de comandos e atalhos** · M · Spec: UI-04, §12.4 · Dep: T-050, T-025 · Cartão de produção com foto de cada item e dica com receita, energia e tempo (o que falta em vermelho); falta a grade 4×3 com os comandos das unidades
  - Aceite: botões e teclas vêm de `dados:atalhos`; custo faltante em vermelho; menus B e U da Impressora.
- [ ] **T-083 — Painel de Diretivas** · P · Spec: UI-02 · Dep: T-033, T-043
- [x] **T-084 — Alertas** · M · Spec: UI-06, AUD-05, `dados:alertas` · Dep: T-060 · Feito: 2026-09-25 (AL-15 dispara com os eventos de cenário, CEN-03, que a Lua não tem; som e voz com a T-126)
  - Aceite: todos os AL-NN disparam pelo gatilho descrito, respeitam `cooldown_s` e levam ao local ao clicar ou com Espaço.
- [x] **T-085 — Barras sobre unidades** · P · Spec: UI-07 · Dep: T-041 · Feito: 2026-09-23
- [ ] **T-086 — Tooltips e fila visível** · P · Spec: UI-09, UI-10 · Dep: T-082
- [ ] **T-087 — Textos em pt-BR** · P · Spec: TEC-23 · Dep: T-080
  - Aceite: nenhuma string de interface fixa no código (verificação automatizada).
- [x] **T-088 — Informação de jazidas** · P · Spec: UI-13, UI-09 · Dep: T-081, T-030 · Feito: 2026-09-23
  - Aceite: tooltip com recurso e quantidade restante após o atraso; clique seleciona a jazida sozinha e o painel mostra recurso, restante/inicial e hovers designados.
- [x] **T-089 — Sinalizadores do clique direito** · P · Spec: UI-14 · Dep: T-025 · Feito: 2026-09-25
  - Aceite: cada tipo de ordem mostra um sinalizador próprio no ponto e toca um som próprio.

## M9 — IA

- [x] **T-090 — Arquitetura de IA** · M · Spec: IA-01, IA-02, IA-06, IA-07 · Dep: T-056, T-063, T-070 · Feito: 2026-09-24
  - Aceite: módulos emitem apenas Comandos (TEC-07); a IA só lê o que a própria névoa permite (teste com unidade escondida).
- [x] **T-091 — Economia e energia da IA** · M · Spec: IA-01, §13.2 · Dep: T-090 · Feito: 2026-09-24
  - Aceite: atinge `meta_hovers` da dificuldade; mantém saldo de energia ≥ 0 na maior parte da partida; expande até `expansoes_max`.
- [x] **T-092 — Produção e composição** · M · Spec: IA-03, §13.3 · Dep: T-091 · Feito: 2026-09-24
  - Aceite: a composição converge para os pesos da personalidade, redistribuindo tiers bloqueados; a adaptação reage ao exército inimigo observado.
- [x] **T-093 — Militar e dificuldades** · G · Spec: IA-04, IA-05, §13.2 · Dep: T-092 · Feito: 2026-09-24 (as partidas entre IAs iguais ainda empatam: ver T-095)
  - Aceite: ondas respeitam `primeiro_ataque_min` e `vr_exercito_ataque`; recuo abaixo de `ia_recuo_vr_pct`; níveis de `micro` implementados; IAs se atacam entre si.
- [~] **T-094 — Batedor e Sentinelas** · P · Spec: IA-01 · Dep: T-072, T-090 · Batedor com Hover de Observação pronto; Sentinelas esperam a T-072
- [ ] **T-095 — Estabilidade e hierarquia de dificuldade** · M · Spec: INV-12, INV-14 · Dep: T-093, T-007
  - Aceite: INV-12 e INV-14 verdes com `sim:match` em 20 seeds.
- [x] **T-096 — IA evolui estruturas e usa as novas unidades** · G · Spec: IA-06, IA-08 – IA-10, D-66 · Dep: T-091, T-059, T-076 · Feito: 2026-09-26
  - Aceite: o Fácil constrói o plano de `dados:ia_plano` no minuto do nível sem passar de `vr_exercito_max` nem de `tiers_militares` no exército; a IA imprime e posiciona o satélite, fabrica e lança mísseis (curtos na defesa; longos do Normal para cima a cada `ia_missil_longo_intervalo_s`), planta minas perto da base, leva silo à expansão e bateria na onda; partida headless do Fácil constrói mais estruturas e não ataca antes de `primeiro_ataque_min`.

## M10 — Telas e Free Battle (MVP)

- [x] **T-100 — Splash e carregamento** · P · Spec: FLX-01, FLX-08 · Dep: T-002 · Feito: 2026-09-24
- [x] **T-101 — Tela de Abertura** · M · Spec: FLX-02, TEC-22 · Dep: T-100 · Feito: 2026-09-24 (Arcas-Forja com o modelo placeholder da Nave, ART-03)
  - Aceite: cena da Terra escura com as Arcas-Forja; a primeira tecla ou clique libera o áudio.
- [x] **T-102 — Seleção de Modo e Configurações** · M · Spec: FLX-03, FLX-13, FLX-14, TEC-19 · Dep: T-101 · Feito: 2026-09-24 (conteúdo do MVP de D-36)
- [x] **T-103 — Visão do Universo (versão MVP)** · M · Spec: FLX-04 · Dep: T-102 · Feito: 2026-09-24 (só a Lua disponível; "concluído" entra com a campanha)
  - Aceite: navegação 3D, estados bloqueado/disponível/concluído e seleção de cenário.
- [x] **T-104 — Configuração de Free Battle** · M · Spec: FLX-07, §16, FB-01 – FB-04 · Dep: T-103, T-012 · Feito: 2026-09-24
  - Aceite: todas as opções de `dados:free_battle` com os padrões; combinações inválidas desabilitadas com explicação; última configuração lembrada.
- [x] **T-105 — Pausa, pausa tática e render-se** · P · Spec: FLX-11, REG-13, REG-21 · Dep: T-104 · Feito: 2026-09-24 (a ordem dada na pausa tática entra ao retomar)
- [~] **T-106 — Fim de partida e pontuação** · M · Spec: FLX-12, REG-22, REG-23 · Dep: T-067 · E2E do marco MVP pronto; falta a sessão manual de 20 min contra IA Normal
  - Aceite (**marco MVP**): teste E2E (Playwright) abre o jogo, inicia um Free Battle na Lua contra IA Fácil, confere o HUD, se rende e vê a tela de derrota com estatísticas; sessão manual de 20 min contra IA Normal sem erros no console.
- [x] **T-107 — Botões de parados e barras só do jogador** · P · Spec: UI-07, UI-15, D-58 · Dep: T-084 · Feito: 2026-09-25
  - Aceite: botões fixos contam mineradores e impressoras parados e o clique seleciona e centraliza o próximo; unidades de outras nações não mostram barras; AL-10 respeita a recarga de 120 s.
- [x] **T-108 — Barras só nas selecionadas e cartões de ação** · P · Spec: UI-07, UI-16, D-61, D-62 · Dep: T-107 · Feito: 2026-09-25
  - Aceite: sem Tab, barras só nas unidades selecionadas; cartão do Hover de Plantio de Minas com a foto da mina que entra no modo de plantar; cartão da Bateria Móvel com o botão do suporte.

## M11 — Controle direto

- [x] **T-110 — Câmeras de 1ª e 3ª pessoa** · M · Spec: CTL-08, CTL-09, CTL-15 · Dep: T-106 · Feito: 2026-09-24
- [x] **T-111 — Movimento e Impulso** · M · Spec: CTL-10, CTL-12 · Dep: T-110 · Feito: 2026-09-24
- [x] **T-112 — Mira e ações** · M · Spec: CTL-11 · Dep: T-111, T-062 · Feito: 2026-09-24
  - Aceite: lasers acertam o que está sob a mira; trava do torpedo; marcador de impacto da bomba; hover de exploração minera e descarrega em controle direto.
- [x] **T-113 — HUD, Sincronia e Sinal Perdido** · P · Spec: CTL-12 – CTL-14 · Dep: T-112 · Feito: 2026-09-24

## M12 — Arte e áudio

- [x] **T-120 — Modelos finais das unidades móveis** · G · Spec: ART-01 – ART-03, ART-05, D-45 · Dep: T-020 · Feito: 2026-09-25 (procedurais refinados, D-45)
- [x] **T-121 — Modelos finais das estruturas e da Nave** · G · Spec: ART-01 – ART-04, D-45 · Dep: T-020 · Feito: 2026-09-25 (procedurais refinados, D-45)
- [x] **T-122 — Efeito de impressão 3D** · M · Spec: ART-06 · Dep: T-053 · Feito: 2026-09-25
- [x] **T-123 — VFX de combate** · M · Spec: ART-07 · Dep: T-062, T-066 · Feito: 2026-09-25 (o rastro de dobra da abertura veio com a T-101)
- [x] **T-124 — Iluminação, pós-processamento e presets** · M · Spec: ART-08, TEC-19 · Dep: T-014 · Feito: 2026-09-25 (o fator de partículas é usado pelos VFX da T-123)
- [x] **T-125 — Cinemática de pouso** · M · Spec: FLX-09 · Dep: T-121 · Feito: 2026-09-25
- [x] **T-126 — Áudio** · G · Spec: AUD-01 – AUD-05, D-46, D-47, D-74, D-75 · Dep: T-084 · Feito: 2026-09-25 (as trilhas são arquivos do produto em src/audio/: entrance, map e soundtrack_*, D-74)
  - Aceite: trilhas por contexto com transição cruzada e arquivos faltando pulados; SFX sintetizados por unidade e interface; voz TTS pt-BR com legenda; volumes por canal nas Configurações.
- [x] **T-127 — Acessibilidade** · M · Spec: UI-11, UI-12 · Dep: T-080 · Feito: 2026-09-25 (paletas daltônicas a partir da Okabe-Ito; legendas pela pilha de alertas; escala, 0,75× e pausa tática já existiam)

- [x] **T-128 — Base de Lançamento com torre vertical** · P · Spec: §12 (visual da Base de Lançamento) · Dep: T-121 · Feito: 2026-09-25
  - Aceite: o modelo tem uma torre vertical coerente com a subida do satélite.
- [x] **T-129 — Torres e canos apontam para o alvo** · M · Spec: ART-12, D-68 · Dep: T-120 · Feito: 2026-09-26
  - Aceite: EX1, OPQ, Torre de Defesa, Nave, Antiaérea, drones e Lança-Mísseis giram só a torre ou os canos para o alvo; sem alvo, voltam para a frente.
## M13 — Campanha (v1.0)

- [x] **T-130 — Persistência** · P · Spec: TEC-21, CAM-04, CAM-09 · Dep: T-102 · Feito: 2026-09-26
  - Aceite: 3 slots de campanha salvos em IndexedDB (com alternativa em localStorage): nação, missões concluídas, estrelas e melhor tempo; criar, continuar e apagar.
- [x] **T-131 — Escolha de nação, briefing e fluxo da campanha** · M · Spec: FLX-03, FLX-05, FLX-06, CAM-01, CAM-08, CAM-09 · Dep: T-130, T-103 · Feito: 2026-09-26
  - Aceite: Campanha → slot → (novo) Escolha de Nação → Universo → Briefing → Iniciar Pouso → partida da missão → fim com estrelas, salvo no slot, próxima missão desbloqueada.
- [x] **T-132 — Visão do Universo final** · M · Spec: FLX-04, CAM-03, ART-09 · Dep: T-131 · Feito: 2026-09-26
- [x] **T-133 — Liberação progressiva de unidades** · P · Spec: CAM-02, D-73 · Dep: T-131 · Feito: 2026-09-26
  - Aceite: na missão, ordens de itens não liberados são recusadas para todas as nações e os cartões só mostram os liberados.
- [x] **T-134 — Missão 0 "Campo de Testes" (tutorial na Terra) e Missão 1 "Primeira Forja"** · G · Spec: CAM-05 – CAM-07, §14.5, §15, §18.2 · Dep: T-133, T-084 · Feito: 2026-09-26
  - Aceite: cenário Terra — Campo de testes (céu azul, concreto com faixas, galpões e cercas); os 9 passos do tutorial em ordem (CAM-07), com destaque de interface e narração; alvos de treino e posto avançado eliminados ao perder tudo (CAM-06); tutorial pode ser pulado; a Missão 1 na Lua sem passos guiados.
- [x] **T-135 — Cenário Shackleton e Missão 2 "Sombra Eterna"** · M · Spec: §14.1, §15 · Dep: T-134 · Feito: 2026-09-26
  - Aceite (**marco v1.0**): campanha 1–2 completa, com estrelas e progresso salvo; metas de TEC-15 cumpridas.
- [x] **T-136 — Macetes na partida** · P · Spec: TEC-27, D-76 · Dep: T-102 · Feito: 2026-09-27
  - Aceite: Enter abre o campo no centro; "maiscobre" (e os outros recursos) soma `macete_quantidade` ao estoque do jogador por Comando; texto desconhecido avisa; Esc fecha; digitar no campo não aciona atalhos.

## M14 — Release web

- [ ] **T-140 — Performance** · G · Spec: TEC-15, TEC-16 · Dep: T-124
  - Aceite: metas de fps e de tempo de tick medidas e registradas no hardware-alvo.
- [ ] **T-141 — Carregamento e orçamento de download** · M · Spec: TEC-18 · Dep: T-120, T-121
- [ ] **T-142 — Compatibilidade de navegadores** · M · Spec: TEC-20 · Dep: T-140
- [ ] **T-143 — Deploy estático** · P · Spec: TEC-02 · Dep: T-142

## M15 — Pós-v1 (v1.x)

- [x] **T-150 — Marte, tempestade de poeira e Missão 3** · G · Spec: CEN-02, CEN-03, §14.6, §15, §18.2, AUD-02, D-77 · Dep: T-135 · Feito: 2026-09-27
  - Aceite: tempestade de poeira sorteada pela seed entre os intervalos, com duração, visão e geração solar reduzidas e o AL-15 antes; `mult_visao` do cenário aplicado; 3 presets de Marte válidos (Free Battle); Missão 3 jogável na campanha depois da 2, contra duas IAs Normais; ambientação de Marte (céu caramelo, halo azul no Sol, solo ferrugem) e da tempestade; vento em Marte.
- [ ] **T-151 — Fobos e Missão 4 (ondas)** · M · Spec: §15
- [ ] **T-152 — Missão 5 em Ceres** · M · Spec: §15, D-99 · Dep: T-151, T-202
  - O cenário Ceres (Free Battle) sai daqui e vira T-202 (M25, D-99): só a Missão 5 da campanha fica nesta tarefa, à espera da Missão 4 (mesma ordem de T-153/T-160 para Vênus/Titã).
- [ ] **T-153 — Missão 6 em Vênus** · M · Spec: §15, D-97 · Dep: T-151, T-152, T-200
  - O cenário Vênus (Free Battle) sai daqui e vira T-200 (M24, D-97): só a Missão 6 da campanha fica nesta tarefa, à espera das Missões 4 e 5 (mesma ordem de T-160 para a Missão 8/Titã).
- [ ] **T-154 — Missão 7 em Europa** · M · Spec: §15, D-104 · Dep: T-151, T-152, T-203
  - O cenário Europa (Free Battle) sai daqui e vira T-203 (M27, D-104): só a Missão 7 da campanha fica nesta tarefa, à espera das Missões 4 a 6 (mesma ordem de T-153/T-152 para Vênus/Ceres).
- [x] **T-155 — Titã e lagos de metano (Free Battle)** · G · Spec: CEN-02, CEN-04, PRD-10, §14.7, §18.2, AUD-02, D-78 · Dep: T-150 · Feito: 2026-09-27
  - Aceite: lagos de metano gerados pela seed nas quantidades e raios de CEN-04, simétricos, longe das zonas e sem jazidas; posicionar estrutura, muro ou mina num lago é recusado (motivo `lago`); hovers atravessam; `mult_en_drone` aplicado aos drones; 3 presets de Titã válidos; ambientação de Titã (céu laranja nebuloso, penumbra, lagos espelhados) e vento.
- [ ] **T-156 — Salvar e carregar partida** · M · Spec: TEC-08
- [ ] **T-157 — Remapeamento de teclas** · P · Spec: §22
- [ ] **T-158 — Inglês (en-US)** · M · Spec: TEC-23, Q-04
- [ ] **T-159 — Simulação em Web Worker** · M · Spec: TEC-10
- [ ] **T-160 — Missão 8 "Trono Único" na campanha** · M · Spec: §15, D-78 · Dep: T-203, T-155

## M16 — Vastidão (D-79)

- [ ] **T-161 — Tamanho de cada corpo pelo cenário** · G · Spec: CEN-16, CEN-06, CEN-04, FB-03, `dados:cenarios`, `dados:missoes`, `dados:free_battle`, P6, D-79 · Dep: T-155
  - Aceite: o raio do mapa vem de `raio_m` do cenário; o Free Battle não oferece tamanho e desabilita presets que não comportam os jogadores; presets de todos os cenários válidos com os novos raios; missões sem a coluna `mapa`; Titã com `lagos_por_setor`; a partida no maior corpo implementado abre em tempo aceitável (P5).
- [ ] **T-162 — Ritmo de exploração** · P · Spec: `primeiro_ataque_min`, EXP-03, EXP-04, INV-12, INV-14, D-79 · Dep: T-161
  - Aceite: `primeiro_ataque_min` novo aplicado pela IA; INV-12 e INV-14 verificados (headless) no mapa novo da Lua.
- [ ] **T-163 — Abertura rápida nos corpos grandes** · M · Spec: P5, TEC-10, D-79 · Dep: T-161
  - Contexto: com a Lua de 400 m, a partida leva ~19 s para abrir no servidor de desenvolvimento (geração e validação do mapa ~9 s; malha do terreno ~9 s). Caminhos: normais do terreno pela grade em vez de amostrar a altura, albedo em resolução menor, geração num Web Worker (T-159) e cache do mapa entre a configuração e a partida.
- [x] **T-164 — Temperamento e domínio** · G · Spec: REG-24 – REG-28, CMB-29, IA-04, IA-05, IA-11, IA-12, UI-17, AL-19 – AL-22, D-81, D-82 · Dep: T-161 · Feito: 2026-09-27
  - Aceite: todos começam pacíficos; corpo no domínio alheio gera aviso e alerta, e fica inimigo após `ultimato_s`; sair antes volta a pacífico; dano abre a guerra na hora; a guerra esfria após `guerra_esfria_s`; disparo automático e minas só contra inimigos; a IA obedece o aviso (menos a Brutal) e só ataca quem está em guerra ou provoca conforme a dificuldade (IA-12); HUD e minimapa mostram o temperamento e os domínios.
- [ ] **T-165 — Pathfinding hierárquico** · G · Spec: TEC-14, MOV-05, D-79 · Dep: T-161
  - Contexto: na Lua de 400 m, o A* de uma zona a outra leva ~26 ms e o flow field ~65 ms (medidos em 2026-09-27). Aceite: < 5 ms por ordem na Lua (tests/perf/pathfinding.test.ts), com as mesmas garantias de MOV-05.
- [x] **T-166 — Ritmo mais rápido, satélites, macete e barras (D-83)** · M · Spec: `dados:custos`, `dados:moveis`, `dados:recursos`, `carga_hover_u`, UNI-04, PRD-01, TEC-27, UI-07, D-83 · Dep: T-161 · Feito: 2026-09-27
  - Aceite: novos números vindos só do SPEC; a Base de Lançamento imprime vários satélites; "maistudo" soma a todos os recursos; barras dos não selecionados a 30%; INV reconferidos (os que quebrarem voltam ao SPEC).
- [x] **T-167 — Antena** · M · Spec: UNI-14, ENE-03, §8.3, §12.4, D-83 · Dep: T-166 · Feito: 2026-09-27
  - Aceite: a Impressora constrói a Antena (B → E); ela enxerga `visao_m`, consome `manutencao_en_s` e sem energia não enxerga; modelo, foto do cartão e nome; liberada na Missão 1.
- [x] **T-168 — Minimapa em mapa-múndi** · M · Spec: CTL-03, VIS-09, D-83 · Feito: 2026-09-27
  - Aceite: projeção equiretangular com o norte fixo; rola só leste–oeste acompanhando o foco; arrastar rola; clique e clique direito continuam valendo.
- [x] **T-169 — Atmosfera como esfera na visão planetária** · P · Spec: CTL-16, `atmosfera_opacidade_pct`, D-83 · Feito: 2026-09-27
  - Aceite: ao afastar, céu e névoa dão lugar ao espaço estrelado e a atmosfera é uma esfera em volta do corpo a 90% de opacidade.

## M17 — Rede e cidades (D-85)

- [x] **T-170 — Rede elétrica por cabos e Central de Distribuição** · G · Spec: ENE-01, ENE-02, ENE-06, ENE-22, ENE-25 – ENE-29, UNI-15, IA-13, CAM-07, AL-23, D-85 · Dep: T-167 · Feito: 2026-09-27
  - Aceite: redes por componente de cabos, com banco por estrutura; plugar com o clique direito dentro do alcance (30/80 m) e desplugar pelo cartão; cabos no chão; estrutura sem rede não recebe nem entrega (ícone e AL-23); a IA pluga e posiciona ao alcance; Central de Distribuição (modelo, B → D); nuclear sempre ligada; HUD com a rede da Nave e a da seleção; tutorial ensina a plugar.
- [x] **T-171 — Pedras neutras** · M · Spec: CEN-17, MOV-04, PRD-10, D-86 · Dep: T-161 · Feito: 2026-09-28
  - Aceite: pedras geradas pela seed com a densidade e os raios do SPEC, simétricas, fora dos platôs, rampas e jazidas; bloqueiam hovers e construção, não drones; presets continuam válidos.
- [x] **T-172 — Rede: Armazém na rede, cabos pretos com brilho, Central baixa, luzes e IA de expansão** · M · Spec: ENE-27, ENE-29, UNI-15, IA-13, ART-13, D-86 · Dep: T-170 · Feito: 2026-09-28
  - Aceite: Armazém fora da rede não recebe descargas; cabos pretos com brilho verde só com energia; modelo baixo da Central; luzes piscando só nas ligadas; a IA planta Central para expandir.
- [x] **T-173 — Minimapa fixo** · P · Spec: CTL-03, D-86 · Dep: T-168 · Feito: 2026-09-28
  - Aceite: mapa-múndi parado com a zona de pouso no meio; o escuro não é preto; clique e arrasto movem a câmera.
- [x] **T-174 — Ligação 1:1 e cabos orgânicos** · M · Spec: ENE-26, ENE-27, UNI-15, IA-13, D-87 · Dep: T-172 · Feito: 2026-09-28
  - Aceite: estrutura comum aceita um só cabo (o novo troca o antigo); Nave e Central aceitam `cabo_saidas_central` e recusam além disso; Central com o custo novo; a IA pluga só em Nave ou Central com saída livre e planta Central quando falta; cabos pretos, sem brilho, em curvas suaves.
- [x] **T-175 — Domínio do jogador sem guerra automática e Declarar guerra** · M · Spec: REG-26, REG-29, AL-22, IA-12, UI-17, D-88 · Dep: T-164 · Feito: 2026-09-28
  - Aceite: estrutura não conta como intrusa; domínio de unidade não vale dentro da base alheia; no domínio de uma IA o prazo é `ultimato_s` e vira guerra; no domínio do jogador não há guerra automática, a IA recolhe as unidades e o jogador recebe AL-22 com Declarar guerra; o Comando "declarar_guerra" abre a guerra; o temperamento da barra também declara; a onda provocadora declara guerra ao jogador no fim do prazo.
- [x] **T-176 — Jazidas espalhadas, maiores e com cara de pedra** · M · Spec: ECO-04, ECO-07, ECO-30, D-89 · Dep: T-171 · Feito: 2026-09-28
  - Aceite: quantidades de `dados:jazidas` × perfil; toda jazida a ≥ `jazida_espacamento_min_m` das outras; jazidas espalhadas na densidade de ECO-30, simétricas, longe das zonas de pouso; presets continuam válidos; jazidas desenhadas como rocha com veios e cristais na cor do recurso; Fe e Cu com as cores novas.

## M18 — Mares (D-90)

- [x] **T-180 — Mares orgânicos com ilhas** · G · Spec: CEN-04, CEN-11, MOV-01, PRD-10, §14.7, D-90 · Dep: T-176 · Feito: 2026-09-28
  - Aceite: nos cenários com líquido, `mar_cobertura_pct`% da superfície abaixo do nível, com formas orgânicas e ilhas, simétrica, terra firme a `mar_folga_zona_m` das zonas; unidades de solo param na borda; nada fica no líquido (exceto o Porto); validação conta o mar; presets de Titã válidos; o mar desenhado com a névoa.
- [x] **T-181 — Porto e embarcações** · G · Spec: UNI-16 – UNI-19, MOV-08, CMB-04, PRD-10, `dados:custos`, `dados:moveis`, `dados:estruturas`, `boat_laser`, D-90 · Dep: T-180 · Feito: 2026-09-28
  - Aceite: a Impressora imprime o Porto só sobre o líquido perto da terra; o Porto imprime as três embarcações, que só andam no líquido e recarregam nas portas dele; a Artilharia atira com `boat_laser`; a Antena enxerga `visao_m`.
- [x] **T-182 — Transporte: embarcar e desembarcar** · M · Spec: UNI-20, D-90 · Dep: T-181 · Feito: 2026-09-28
  - Aceite: até `transporte_capacidade` unidades de solo embarcam pela borda; somem do mapa; desembarcam em terra em volta do ponto; morrem com o Transporte; drones não embarcam.
- [x] **T-183 — Visual e interface naval** · M · Spec: UNI-16 – UNI-20, atalhos, ART-04, D-90 · Dep: T-181 · Feito: 2026-09-28
  - Aceite: modelos do Porto e das embarcações; cartões, fotos e atalhos (B → O; T/A/N no Porto; D no Transporte); ordem de embarque pelo clique direito.
- [x] **T-184 — IA naval** · G · Spec: IA-14, D-90 · Dep: T-182 · Feito: 2026-09-28
  - Aceite: com líquido perto da base, a IA constrói o Porto e mantém as embarcações; leva a onda e a expansão pelo mar quando não há caminho por terra (headless em Titã).

## M19 — Hangar de Drones (D-91)

- [x] **T-185 — Hangar: estrutura, produção e Impressora sem drones** · G · Spec: PRD-01, UNI-21, `dados:custos`, `dados:estruturas`, atalhos, D-91 · Dep: T-170 · Feito: 2026-09-30
  - Aceite: a Impressora constrói o Hangar (B → H) e deixa de imprimir Bombardeiro e Laser; pronto e na rede, o Hangar imprime os 3 drones pela própria fila (menu B/L/K), pagos com a energia da rede; sem rede, a impressão não avança.
- [x] **T-186 — Drone Kamikaze: unidade e explosão ao colidir** · G · Spec: `dados:moveis`, `dados:armas` (`kamikaze_blast`), CMB-30, UNI-12, D-91 · Dep: T-185 · Feito: 2026-09-30
  - Aceite: o Kamikaze persegue o alvo, explode ao alcançar o contato com dano em área (CMB-10/CMB-11) e se destrói sempre no ato; a Antiaérea o abate como qualquer drone no ar; modelo e foto do cartão.
- [x] **T-187 — IA: Hangar e composição com Kamikaze** · M · Spec: IA-15, `dados:ia_plano`, `dados:personalidades`, `dados:missoes`, D-91 · Dep: T-186 · Feito: 2026-09-30
  - Aceite: a IA constrói 1 Hangar pelo plano e imprime bomb/dlaser/kamikaze nele conforme o peso da personalidade; sem Hangar pronto, essas categorias esperam sem travar as outras; Missão 4 libera "hangar" (e os 3 drones com ele).

## M20 — Fábrica de Artilharia (D-92)

- [x] **T-188 — Fábrica de Artilharia: estrutura, produção e Impressora sem EX1/OPQ** · G · Spec: PRD-01, UNI-22, `dados:custos`, `dados:estruturas`, atalhos, D-92 · Dep: T-187 · Feito: 2026-09-30
  - Aceite: a Impressora constrói a Fábrica (B → B) e deixa de imprimir o EX1 e o OPQ; pronta e na rede, a Fábrica imprime as 3 unidades pela própria fila (menu 1/2/3), pagas com a energia da rede; sem rede, a impressão não avança.
- [x] **T-189 — Tanque de Cerco: unidade e arma corpo a corpo** · G · Spec: `dados:moveis`, `dados:armas` (`siege_ram`), UNI-22, D-92 · Dep: T-188 · Feito: 2026-09-30
  - Aceite: o Tanque de Cerco persegue o alvo até o contato e martela com `siege_ram` (só solo, sem alcance mínimo); mais lento e resistente que o OPQ; não atinge alvos aéreos; modelo e foto do cartão.
- [x] **T-190 — IA, tutorial e missões: Fábrica e composição com o Tanque de Cerco** · M · Spec: IA-16, IA-03, `dados:ia_plano`, `dados:personalidades`, `dados:missoes`, CAM-07, D-92 · Dep: T-189 · Feito: 2026-09-30
  - Aceite: a IA constrói 1 Fábrica pelo plano com prioridade sobre as demais estruturas de apoio e imprime ex1/opq/siege nela conforme o peso da personalidade, sem travar as outras categorias sem Fábrica pronta; Missão 0 libera "arsenal" no lugar do EX1 direto, com o novo passo 9 do tutorial (Fábrica pronta e ligada à rede) antes do passo do EX1; Missão 2 libera o Tanque de Cerco junto com o OPQ.

## M21 — Sol fixo e céu por cenário (D-93)

- [x] **T-191 — Sol fixo e distante, lado escuro nunca preto** · M · Spec: ART-11, D-93 · Dep: T-169 · Feito: 2026-09-30
  - Aceite: o Sol (e as sombras em cascata) tem uma única direção fixa no mundo por partida; rotacionar ou percorrer o planeta com a câmera não desloca o Sol; o lado sem luz direta permanece visível (nunca preto puro, luz ambiente do cenário).
- [x] **T-192 — Terra mais realista no céu da Lua** · P · Spec: §14.4, §18.2, D-93 · Dep: T-191 · Feito: 2026-09-30
  - Aceite: a Terra no céu da Lua mostra continentes e nuvens no lado iluminado, além do oceano e do halo azul já existentes; continua fixa no mundo (T-191).
- [x] **T-193 — Saturno e outras luas no céu de Titã** · M · Spec: §14.7, §18.2, D-93 · Dep: T-191 · Feito: 2026-09-30
  - Aceite: de Titã, o céu mostra Saturno grande com anéis e ao menos 2 outras luas menores, todos em direções fixas no mundo, junto do Sol.

## M22 — Correções de D-93: ambiente, Sol visível e Marte (D-94)

- [x] **T-194 — Luz ambiente jogável no lado escuro (Lua, Shackleton, Marte)** · P · Spec: ART-11, D-94 · Dep: T-191 · Feito: 2026-09-30
  - Aceite: no lado sem Sol direto, o chão e as estruturas continuam legíveis a olho nu (não preto puro) na Lua, em Shackleton e em Marte.
- [x] **T-195 — Sol como corpo visível no céu, inclusive na visão do espaço** · M · Spec: ART-11, D-94 · Dep: T-191 · Feito: 2026-09-30
  - Aceite: o Sol aparece como um disco brilhante numa direção fixa do céu, em todos os cenários; continua visível na visão planetária/do espaço (CTL-16), sem sumir quando o céu dá lugar às estrelas.
- [x] **T-196 — Corpos do céu menos nítidos dentro da atmosfera** · P · Spec: ART-11, D-94 · Dep: T-193 · Feito: 2026-09-30
  - Aceite: em Titã, Saturno (e as outras luas) ficam com menos nitidez/contraste olhando de dentro da atmosfera do que na visão do espaço (CTL-16), onde ficam nítidos.
- [x] **T-197 — Fobos e Deimos no céu de Marte** · P · Spec: §14.6, §18.2, D-94 · Dep: T-191 · Feito: 2026-09-30
  - Aceite: de Marte, o céu mostra Fobos e Deimos, pequenos, em direções fixas no mundo.
- [x] **T-198 — Céu noturno em Marte e Titã** · M · Spec: ART-11, §14.6, §14.7, D-95 · Dep: T-194 · Feito: 2026-09-30
  - Aceite: em Marte e Titã, o céu muda de cor ao caminhar do lado iluminado para o lado sem Sol direto (e volta, ao caminhar de volta); em Marte o céu noturno mostra estrelas, em Titã não; a Lua, Shackleton e o Campo de testes não mudam.

## M23 — Giro livre ao posicionar, generalizado (D-96)

- [x] **T-199 — Giro livre ao posicionar toda estrutura, inclusive o Porto** · G · Spec: PRD-10, UI-08, CEN-15, D-56, D-96 · Dep: T-181 · Feito: 2026-09-30
  - Aceite: ao posicionar qualquer estrutura (não só Muro/Portão), apertar fixa o centro no ponto clicado e arrastar (com o botão apertado) gira a pegada para apontar ao cursor, em qualquer ângulo; soltar confirma nessa direção; clicar sem arrastar mantém a última direção usada; o Porto segue girando e validando normalmente sobre o líquido (D-90); duas pegadas quadradas giradas em ângulos diferentes não se sobrepõem (checagem por retângulos reais, SAT), mesmo quando o simples teste por caixa alinhada ao norte deixaria passar ou recusaria por engano.

## M24 — Vênus, Free Battle (D-97, D-98)

- [x] **T-200 — Vênus, chuva ácida e Free Battle** · G · Spec: CEN-09, CEN-18, §14.8, §18.2, AUD-02, `dados:cenarios` (`mult_cratera`, `mult_relevo`, `venus_chuva_*`), AL-24, D-97, D-98 · Dep: T-155 · Feito: 2026-09-30
  - Aceite: cenário Vênus jogável no Free Battle (3 presets: Maxwell Montes N=2, Aphrodite Terra N=4, Lakshmi Planum N=4), com ambientação própria a partir de fotos da Venera (céu amarelo opaco, sol difuso, solo de basalto rachado em placas em vez do regolito poeirento dos outros corpos, relâmpagos decorativos, relevo quase sem crateras via `mult_cratera`/`mult_relevo`, D-98); do lado sem Sol direto fica escuro mas sem estrelas (neblina densa demais, D-95 estendido); a chuva ácida (`chuva_acida`) ocorre em intervalos sorteados pela seed, com aviso AL-24 antes, reduz a visão e a geração solar durante a duração, e aplica dano contínuo leve a toda unidade e estrutura do planeta (sem exceção de camada ou nação); fora do evento, nada disso se aplica; a Missão 6 (T-153) fica de fora por enquanto.

## M25 — Ceres, Free Battle (D-99)

- [x] **T-202 — Ceres, veios de sal e Free Battle** · G · Spec: CEN-19, §14.9, §18.2, `dados:cenarios` (`perfil_li`, evento), `dados:parametros` (`ceres_sal_*`), D-99 a D-103 · Dep: T-176 · Feito: 2026-10-01
  - Aceite: cenário Ceres jogável no Free Battle (3 presets: Occator N=2, Kerwan N=4, Yalode N=4), cientificamente fiel — sem céu colorido nem de dia (atmosfera tênue demais pra espalhar luz), regolito bem mais escuro que o da Lua, Sol mais fraco e distante, cheio de crateras como a Lua, com o cinturão de asteroides visível no céu (pedras de tamanhos variados, sprite simples, mais uma "fogzinha", D-100 a D-103); o Lítio deixa de nascer pela distribuição normal (`perfil_li` 0) e só existe dentro da maior cratera do mapa (e das réplicas simétricas dela, uma por zona de pouso) — fora dela, nenhuma jazida de Lítio nasce.

## M27 — Europa, Free Battle (D-104)

- [x] **T-203 — Europa, gêiseres e neve, Free Battle** · G · Spec: CEN-05, CEN-09, CEN-20, §14.10, §18.2, `dados:cenarios` (`mult_cratera`, `mult_relevo`, `mult_colinas`, `mult_fendas` de Europa), D-104, D-105, D-106 · Dep: T-176 · Feito: 2026-10-01
  - Aceite: cenário Europa jogável no Free Battle (3 presets: Conamara Chaos N=2, Thera Macula N=4, Pwyll N=4), sem céu colorido nem de dia (atmosfera rarefeita demais, como Ceres), solo de gelo bem claro rachado em placas largas e compridas (reaproveita o shader de Vênus, com menos células e ladrilho maior, D-105), sem crateras mas com relevo bem acidentado — cordilheiras e cristas numerosas (`mult_relevo` 2,6, `mult_colinas` 3,0, D-106) — e fendas de verdade (CEN-20, D-106): 30 a 70 m de comprimento, fundo estreito e paredes íngremes o bastante (>30°) para ficarem intransponíveis, como a borda de uma cratera, provado por teste; Júpiter (faixas e Mancha Vermelha, sem anéis) e as três outras luas galileanas fixos no céu como o Sol; gêiseres de água nascem de dentro de cada fenda, em pontos fixos, com jato denso e contínuo sem pausa (D-106, antes sorteados perto da câmera); partículas de gelo sempre caem devagar (baixa gravidade), visíveis de perto (D-105: `Poeira` não encolhe com a distância) mas esmaecendo ao afastar bastante o zoom junto com o fator planetário (CTL-16, D-106, corrige o quadrado branco evidente no espaço) — nenhum muda números de jogo; a Missão 7 (T-154) fica de fora por enquanto.
