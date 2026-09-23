# FORGEBORN — TASKS.md

**Plano de implementação (Spec Driven Development)**

| Campo | Valor |
|---|---|
| Derivado de | `SPEC.md` v0.1.0 |
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
| M1 Mundo | T-010 – T-015 | Mapa lunar gerado por seed, grades, câmera RTS |
| M2 Entidades e movimento | T-020 – T-026 | Selecionar e mover unidades placeholder com pathfinding |
| M3 Economia | T-030 – T-036 | Coleta → entrega → estoque, com diretiva, silo e reciclagem |
| M4 Energia | T-040 – T-046 | Rede, baterias, recarga, usinas e Bateria Móvel |
| M5 Produção | T-050 – T-056 | Filas, construção, assistência, reparo e início de partida |
| M6 Combate | T-060 – T-068 | Armas, dano, minas, explosões, eliminação e invariantes |
| M7 Visão | T-070 – T-074 | Névoa de 3 estados, Sentinela, satélite, minimapa |
| M8 HUD | T-080 – T-087 | Interface completa em pt-BR |
| M9 IA | T-090 – T-095 | 4 dificuldades × 4 personalidades; IA × IA estável |
| M10 Telas e Free Battle | T-100 – T-106 | **MVP: Free Battle Lua jogável do início ao fim** |
| M11 Controle direto | T-110 – T-113 | 1ª e 3ª pessoa com Sincronia |
| M12 Arte e áudio | T-120 – T-127 | Visual e som finais da Lua |
| M13 Campanha | T-130 – T-135 | Universo + missões 1–2 → **v1.0** |
| M14 Release web | T-140 – T-143 | Performance, compatibilidade e deploy |
| M15 Pós-v1 | T-150 – T-159 | Cenários e missões 3–8, salvar partida, inglês |

## Caminho crítico até o MVP

T-001 → T-002 → T-004 → T-006 → T-010 → T-013 → T-022 → T-023 → T-030 → T-031 → T-032 → T-040 → T-041 → T-050 → T-053 → T-056 → T-060 → T-061 → T-063 → T-070 → T-090 → T-093 → T-104 → T-106

Podem andar em paralelo ao caminho crítico: T-000 (produto), render (T-008, T-014, T-015, T-020), telas (T-100 – T-103) e HUD (M8), assim que suas dependências fecharem.

---

## M0 — Fundação

- [ ] **T-000 — Aprovar o SPEC v0.1.0** · produto · Spec: §23, §24 · Dep: —
  - Revisar as decisões D-01 a D-22 e responder Q-01 a Q-05.
  - Aceite: cada decisão marcada como "Aprovada" ou alterada com entrada no Changelog; SPEC sobe para 0.2.0.
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
- [ ] **T-006 — Núcleo da simulação** · G · Spec: TEC-04 – TEC-09, REG-20 · Dep: T-003, T-004
  - Loop de passo fixo, RNG seedado, entidades e componentes, ordem de sistemas de TEC-06, comandos serializáveis, barramento de eventos, snapshot JSON.
  - Aceite: mesma seed + mesmos comandos ⇒ hash de estado idêntico após 10.000 ticks; snapshot → restauração → mesmo hash.
- [ ] **T-007 — Runner headless** · P · Spec: TEC-25 · Dep: T-006
  - CLI `sim:match` com seed, IAs e duração máxima. Sem IA por enquanto: roda os ticks e imprime o hash final e o tempo médio do tick.
  - Aceite: roda em Node sem DOM e termina com código 0.
- [ ] **T-008 — Loop de render e overlay de depuração** · M · Spec: TEC-04, TEC-26 · Dep: T-006
  - `requestAnimationFrame` com interpolação entre estados; overlay Ctrl+Shift+D com FPS, ms do tick e contagem de entidades.
  - Aceite: uma entidade de teste se move suavemente com a simulação em `tick_hz` e o render a 60+ fps.

## M1 — Mundo

- [ ] **T-010 — Gerador de mapas lunares** · G · Spec: CEN-06 – CEN-09, CEN-13 · Dep: T-006
  - Heightmap de 16 bits por seed: crateras, colinas, sulcos, borda intransponível, platôs de pouso com rampas, simetria rotacional N = 2 ou 4.
  - Aceite: mesma seed ⇒ mesmo hash; teste de simetria (altura em p e em p rotacionado iguais, ± 1 cm); platôs com inclinação < 5°.
- [ ] **T-011 — Distribuição de jazidas** · M · Spec: ECO-07, ECO-08, CEN-10 · Dep: T-010
  - Aceite: contagens e quantidades = `dados:jazidas` × perfil do cenário; distâncias dentro das faixas; número de zonas contestadas conforme o número de jogadores.
- [ ] **T-012 — Validação do gerador e presets** · M · Spec: CEN-11, CEN-12, §14.4 · Dep: T-011, T-013
  - Aceite: 100 seeds testadas, inválidas rejeitadas com o motivo; presets Mare Imbrium (P), Mare Tranquillitatis (M) e Oceanus Procellarum (G) fixados.
- [ ] **T-013 — Grades derivadas** · M · Spec: TEC-13, MOV-01, PRD-10 · Dep: T-010
  - Navegação (`celula_navegacao_m`), construção (`celula_construcao_m`) e névoa (`celula_nevoa_m`).
  - Aceite: com heightmap sintético, células acima de `inclinacao_max_hover_graus` são intransponíveis e acima de `inclinacao_max_construcao_graus` não aceitam construção.
- [ ] **T-014 — Renderização do terreno** · G · Spec: TEC-13, ART-08, §14.4 · Dep: T-010, T-008
  - Chunks de 64 m com LOD, material de regolito, sol direcional com sombras, céu estrelado com a Terra escura.
  - Aceite: mapa M a ≥ 60 fps no preset Médio no hardware-alvo (TEC-15); captura de referência aprovada pelo produto.
- [ ] **T-015 — Câmera RTS** · M · Spec: CTL-01 – CTL-03 · Dep: T-014
  - Aceite: pan por setas e bordas; zoom de 15 a 120 m com inclinação dinâmica; rotação pelo botão do meio; Home; a câmera não sai do mapa.

## M2 — Entidades, seleção e movimento

- [ ] **T-020 — Modelos placeholder e identidade de nação** · M · Spec: ART-02, ART-03, TEC-16, TEC-18 · Dep: T-014
  - Modelos procedurais com as silhuetas das fichas (§8.5); tarja e olho emissivos com a cor da nação por instância.
  - Aceite: as 10 unidades móveis e as 6 estruturas são distinguíveis a 60 m de altura; 400 unidades instanciadas em ≤ 300 draw calls.
- [ ] **T-021 — Seleção e grupos** · M · Spec: CTL-04 – CTL-06 · Dep: T-020
  - Aceite: clique, caixa, Shift, duplo clique, Ctrl+clique e grupos Ctrl+1..9 funcionam conforme o SPEC; caixa prefere unidades móveis a estruturas.
- [ ] **T-022 — Movimento de solo** · M · Spec: MOV-01, MOV-03, MOV-04 · Dep: T-013
  - Aceite: aceleração e giro conforme as tabelas; unidades não atravessam estruturas nem jazidas; 50 unidades paradas juntas se separam sem tremer.
- [ ] **T-023 — Pathfinding e formação** · G · Spec: MOV-05, MOV-06, TEC-14 · Dep: T-022
  - Aceite: 100 unidades cruzam o mapa M sem ficar presas (headless, 10 seeds); cálculo por ordem < 5 ms; o grupo chega em formação na velocidade do mais lento.
- [ ] **T-024 — Camada aérea e pouso de drones** · M · Spec: MOV-02, MOV-07, ENE-09 · Dep: T-022
  - Aceite: drones voam a `altitude_drone_m` ignorando relevo; pousam após `pouso_automatico_s` ociosos; decolam por ordem ou com inimigo visível.
- [ ] **T-025 — Comandos básicos e clique direito** · M · Spec: CTL-07 (parcial), CMB-13, PRD-08 · Dep: T-021, T-023
  - Mover, parar, manter posição, patrulhar e ponto de encontro.
  - Aceite: cada comando testado por comando serializado (TEC-07) e pela interface.
- [ ] **T-026 — Limites da nação** · P · Spec: REG-16 – REG-19 · Dep: T-006
  - Aceite: uma ordem que excede `limite_corpos`, `limite_bases_lancamento` ou `limite_minas_ativas` é recusada e emite AL-11.

## M3 — Economia

- [ ] **T-030 — Jazidas** · M · Spec: ECO-04 – ECO-06 · Dep: T-011
  - Aceite: hover além de `slots_por_jazida` procura outra jazida a até `raio_busca_jazida_m`, ou espera; jazida some em 0 e emite AL-07; tamanho visual proporcional à quantidade.
- [ ] **T-031 — Ciclo de coleta** · M · Spec: ECO-09 – ECO-12 · Dep: T-030, T-023
  - Aceite: taxa por recurso = `taxa_mineracao_u_s`; descarga em `tempo_descarga_hover_s`; escolha do ponto de entrega mais próximo pelo caminho; INV-01 verde.
- [ ] **T-032 — Estoque e contabilização** · M · Spec: ECO-14 – ECO-17 · Dep: T-031
  - Aceite: carga em hover não pode ser gasta; descarregar na Nave ou num Armazém incrementa o estoque; o valor "em trânsito" é publicado para o HUD.
- [ ] **T-033 — Diretiva de Coleta** · M · Spec: ECO-18 – ECO-21 · Dep: T-031
  - Aceite: 20 hovers ociosos com todas as jazidas conhecidas se distribuem conforme `diretiva_*_pct`, com erro ≤ 1 hover por recurso; recurso sem jazida elegível é ignorado e sinalizado; ordem manual prevalece.
- [ ] **T-034 — Fuga de hovers** · P · Spec: ECO-13 · Dep: T-031, T-060
  - Aceite: hover atingido foge para a estrutura armada mais próxima e retoma após `fuga_hover_retorno_s` sem dano; a chave nas Diretivas desliga o comportamento.
- [ ] **T-035 — Silo Móvel** · M · Spec: ECO-22 – ECO-26 · Dep: T-032
  - Aceite: só recebe descargas ancorado; ciclo automático no `limiar_ciclo_silo_pct`; a carga só conta depois de descarregar num depósito; hovers se redirecionam enquanto o silo está fora.
- [ ] **T-036 — Destroços e reciclagem** · M · Spec: ECO-27 – ECO-29 · Dep: T-032, T-060
  - Aceite: destroço = piso(receita × `rendimento_destroco_pct`%) por recurso; some no prazo; a sucata vira os recursos certos ao ser descarregada; o destroço do silo inclui `rendimento_carga_silo_pct`% da carga.

## M4 — Energia

- [ ] **T-040 — Rede de energia** · M · Spec: ENE-01 – ENE-05 · Dep: T-006
  - Aceite: testes de geração, capacidade, excedente perdido e de cada nível de prioridade do racionamento, incluindo satélite offline.
- [ ] **T-041 — Baterias e estados** · M · Spec: ENE-08 – ENE-11 · Dep: T-040, T-022
  - Aceite: custo de cada tarefa da tabela §6.3 verificado; unidade parada no solo gasta 0; Modo Reserva anda a `modo_reserva_vel_pct`% e não executa tarefas.
- [ ] **T-042 — Portas de recarga** · M · Spec: ENE-12 – ENE-14 · Dep: T-041
  - Aceite: 1 unidade por porta; fila por ordem de chegada; escolha pelo menor tempo estimado; a recarga retira energia do banco.
- [ ] **T-043 — Auto-recarga** · M · Spec: ENE-15, ENE-16 · Dep: T-042
  - Aceite: limiares `auto_recarga_*` por papel; militares não saem em combate; drones saem em `recarga_forcada_drone_pct` mesmo em combate; a Impressora pausa a impressão, recarrega e retoma.
- [ ] **T-044 — Usinas** · M · Spec: ENE-06, ENE-07 · Dep: T-040, T-053
  - Aceite: solar gera `geracao_en_s` × `fator_solar`; nuclear consome `nuclear_consumo_u` a cada `nuclear_intervalo_s`, gera 0 sem Urânio (AL-10) e religa em `nuclear_religar_s`.
- [ ] **T-045 — Bateria Móvel** · M · Spec: ENE-17 – ENE-21 · Dep: T-042
  - Aceite: atende até `bateria_movel_max_alvos` alvos a `bateria_movel_taxa_por_alvo_en_s` cada, começando pela menor %; volta para recarregar em `auto_recarga_bateria_movel_pct`; alvos não procuram porta enquanto recebem energia.
- [ ] **T-046 — Invariantes de energia** · P · Spec: INV-09, INV-10 · Dep: T-043, T-061
  - Aceite: INV-09 e INV-10 verdes em `tests/balance/`.

## M5 — Produção e construção

- [ ] **T-050 — Filas e pagamento** · M · Spec: PRD-01 – PRD-06 · Dep: T-032, T-041
  - Aceite: matriz de produção respeitada (a Impressora não imprime Impressora); pagamento ao enfileirar; AL-06 lista o que falta; cancelar devolve `reembolso_cancelamento_pct`%; energia consumida durante a impressão (rede na Nave, bateria na Impressora).
- [ ] **T-051 — Impressão de unidades** · M · Spec: PRD-07 – PRD-09 · Dep: T-050
  - Aceite: a Impressora só imprime parada e retoma ao parar; a unidade nasce ao lado e vai ao ponto de encontro; hover com ponto de encontro numa jazida começa a minerar.
- [ ] **T-052 — Posicionamento de estruturas** · M · Spec: PRD-10, UI-08 · Dep: T-013, T-050
  - Aceite: holograma verde ou vermelho com o motivo; regras de inclinação, folga de jazida, terreno explorado e limites do mapa.
- [ ] **T-053 — Canteiro e obra** · M · Spec: PRD-11 – PRD-14, ART-06 (versão simples) · Dep: T-052
  - Aceite: HP inicial `hp_inicial_canteiro_pct`% e crescente; dano descontado do HP final; nada funciona antes de 100%; canteiro retomável; cancelamento devolve recursos.
- [ ] **T-054 — Poder de Impressão e assistência** · M · Spec: PRD-15 – PRD-17 · Dep: T-053
  - Aceite: velocidade = Σ PI ÷ `tempo_s` (com os valores atuais, 1 Impressora + 2 hovers = 2,0 PI, metade do tempo); energia dividida por PI; hovers continuam um canteiro sem a Impressora; no máximo `max_assistentes`.
- [ ] **T-055 — Reparo** · P · Spec: PRD-18, PRD-19 · Dep: T-054
  - Aceite: taxas por reparador e tipo de alvo; no máximo `max_reparadores`; drones só pousados; Impressora ociosa repara dentro de `raio_reparo_auto_m`.
- [ ] **T-056 — Início de partida** · M · Spec: REG-04 – REG-08, FLX-09 (versão simples) · Dep: T-050, T-033
  - Aceite: cada nação começa com Nave e 1 hover; estoque inicial por modo; área explorada inicial; o hover inicial coleta sozinho; INV-02 verde.

## M6 — Combate

- [ ] **T-060 — Dano, HP e morte** · M · Spec: CMB-01 – CMB-03, CMB-27 · Dep: T-006
  - Aceite: multiplicadores de `dados:multiplicadores` aplicados; dano mínimo 1; eventos de dano e morte publicados no barramento.
- [ ] **T-061 — Armas hitscan** · M · Spec: CMB-04, CMB-06, ENE-03 · Dep: T-060, T-041, T-040
  - EX1, Drone Laser, Torre e defesa da Nave.
  - Aceite: camadas de alvo respeitadas; energia debitada da bateria ou da rede conforme `fonte_en`; torre em racionamento dispara mais devagar.
- [ ] **T-062 — Torpedo, bomba e splash** · M · Spec: CMB-07, CMB-08, CMB-10, CMB-11 · Dep: T-061
  - Aceite: torpedo guiado detona na última posição se o alvo morrer; bomba com mira preditiva erra alvo que muda de direção; curva de splash conforme `nucleo_splash_pct` e `splash_borda_pct`; sem fogo amigo.
- [ ] **T-063 — Alvos, posturas e mente única** · G · Spec: CMB-12 – CMB-18 · Dep: T-061, T-023
  - Aceite: prioridade de alvo coberta por teste; perseguição limitada por postura; ataque-movimento; sem desperdício de dano (CMB-16); resposta a ataques contra aliados na visão.
- [ ] **T-064 — Minas** · M · Spec: UNI-01, UNI-02, UNI-07, CMB-09, CMB-19 – CMB-21, REG-18 · Dep: T-062
  - Aceite: fabricação automática consome a receita de `mine`; plantio, armar e Campo minado com os tempos e espaçamento das tabelas; só hovers inimigos acionam; limite de minas ativas.
- [ ] **T-065 — Detecção e camuflagem** · M · Spec: VIS-05, CMB-22 · Dep: T-064, T-070
  - Aceite: minas e Sentinelas só aparecem para inimigos dentro de `deteccao_m` de um detector; mina revelada vira alvo e é evitada pelo pathfinding.
- [ ] **T-066 — Explosões ambientais e radiação** · P · Spec: CMB-23 – CMB-26 · Dep: T-062
  - Aceite: explosões da Bateria Móvel, da Usina Nuclear e da Nave com dano e raio das tabelas, atingindo todas as nações; zona de radiação com duração e dano por segundo; drones em voo imunes.
- [ ] **T-067 — Eliminação, vitória e derrota** · M · Spec: REG-09 – REG-15 · Dep: T-060, T-050
  - Aceite: nação sem Nave e sem Impressoras é eliminada e se autodestrói sem dano; última nação vence; render-se; tempo limite decide por pontuação.
- [ ] **T-068 — Invariantes de combate e relatório de balanceamento** · M · Spec: INV-03 – INV-08, INV-11, INV-13, §21.2 · Dep: T-063, T-064
  - `npm run balance:report` recalcula as tabelas informativas de §21.2 a partir dos dados gerados.
  - Aceite: todos os INV citados verdes; o relatório bate com §21.2 da v0.1.0.

## M7 — Visão

- [ ] **T-070 — Névoa na simulação** · M · Spec: VIS-01 – VIS-03 · Dep: T-013, T-022
  - Aceite: três estados por nação, atualizados a `nevoa_atualizacao_hz`; visão circular por unidade e estrutura; visão compartilhada na nação.
- [ ] **T-071 — Névoa no render e fantasmas** · M · Spec: VIS-01, VIS-04, TEC-17 · Dep: T-070, T-014
  - Aceite: escuro absoluto preto com céu visível; névoa dessaturada; fantasmas de estruturas com tipo e HP da última observação, removidos quando a área é revista.
- [ ] **T-072 — Hover de Observação e Sentinela** · M · Spec: UNI-03, VIS-06, VIS-07 · Dep: T-070, T-065
  - Aceite: implantar e recolher com os tempos das tabelas; sinais de radar sem tipo; AL-03 com contagem e um dos 8 rumos corretos; camuflagem conforme CMB-22.
- [ ] **T-073 — Satélite** · M · Spec: UNI-04 – UNI-06, VIS-08, ENE-04, REG-17 · Dep: T-053, T-070
  - Aceite: lançamento cancelável pela destruição da base; visão persistente reposicionável; Varredura com custo, duração e recarga; offline em racionamento (AL-17).
- [ ] **T-074 — Minimapa** · M · Spec: VIS-09, UI-05, CTL-03 · Dep: T-071
  - Aceite: mostra os três estados, unidades, fantasmas, sinais, círculos de satélite e o campo da câmera; clique move a câmera e clique direito dá ordem.

## M8 — HUD e UX

- [ ] **T-080 — Barra superior** · M · Spec: UI-01, ENE-22 · Dep: T-032, T-040
  - Aceite: recursos com "em trânsito", energia com as três cores do indicador, corpos, relógio e menu.
- [ ] **T-081 — Painel de seleção e retrato 3D** · M · Spec: UI-03 · Dep: T-021
- [ ] **T-082 — Cartão de comandos e atalhos** · M · Spec: UI-04, §12.4 · Dep: T-050, T-025
  - Aceite: botões e teclas vêm de `dados:atalhos`; custo faltante em vermelho; menus B e U da Impressora.
- [ ] **T-083 — Painel de Diretivas** · P · Spec: UI-02 · Dep: T-033, T-043
- [ ] **T-084 — Alertas** · M · Spec: UI-06, AUD-05, `dados:alertas` · Dep: T-060
  - Aceite: todos os AL-NN disparam pelo gatilho descrito, respeitam `cooldown_s` e levam ao local ao clicar ou com Espaço.
- [ ] **T-085 — Barras sobre unidades** · P · Spec: UI-07 · Dep: T-041
- [ ] **T-086 — Tooltips e fila visível** · P · Spec: UI-09, UI-10 · Dep: T-082
- [ ] **T-087 — Textos em pt-BR** · P · Spec: TEC-23 · Dep: T-080
  - Aceite: nenhuma string de interface fixa no código (verificação automatizada).

## M9 — IA

- [ ] **T-090 — Arquitetura de IA** · M · Spec: IA-01, IA-02, IA-06 · Dep: T-056, T-063
  - Aceite: módulos emitem apenas Comandos (TEC-07); a IA só lê o que a própria névoa permite (teste com unidade escondida).
- [ ] **T-091 — Economia e energia da IA** · M · Spec: IA-01, §13.2 · Dep: T-090
  - Aceite: atinge `meta_hovers` da dificuldade; mantém saldo de energia ≥ 0 na maior parte da partida; expande até `expansoes_max`.
- [ ] **T-092 — Produção e composição** · M · Spec: IA-03, §13.3 · Dep: T-091
  - Aceite: a composição converge para os pesos da personalidade, redistribuindo tiers bloqueados; a adaptação reage ao exército inimigo observado.
- [ ] **T-093 — Militar e dificuldades** · G · Spec: IA-04, IA-05, §13.2 · Dep: T-092
  - Aceite: ondas respeitam `primeiro_ataque_min` e `vr_exercito_ataque`; recuo abaixo de `ia_recuo_vr_pct`; níveis de `micro` implementados; IAs se atacam entre si.
- [ ] **T-094 — Batedor e Sentinelas** · P · Spec: IA-01 · Dep: T-072, T-090
- [ ] **T-095 — Estabilidade e hierarquia de dificuldade** · M · Spec: INV-12, INV-14 · Dep: T-093, T-007
  - Aceite: INV-12 e INV-14 verdes com `sim:match` em 20 seeds.

## M10 — Telas e Free Battle (MVP)

- [ ] **T-100 — Splash e carregamento** · P · Spec: FLX-01, FLX-08 · Dep: T-002
- [ ] **T-101 — Tela de Abertura** · M · Spec: FLX-02, TEC-22 · Dep: T-100
  - Aceite: cena da Terra escura com as Arcas-Forja; a primeira tecla ou clique libera o áudio.
- [ ] **T-102 — Seleção de Modo e Configurações** · M · Spec: FLX-03, FLX-13, TEC-19 · Dep: T-101
- [ ] **T-103 — Visão do Universo (versão MVP)** · M · Spec: FLX-04 · Dep: T-102
  - Aceite: navegação 3D, estados bloqueado/disponível/concluído e seleção de cenário.
- [ ] **T-104 — Configuração de Free Battle** · M · Spec: FLX-07, §16, FB-01 – FB-04 · Dep: T-103, T-012
  - Aceite: todas as opções de `dados:free_battle` com os padrões; combinações inválidas desabilitadas com explicação; última configuração lembrada.
- [ ] **T-105 — Pausa, pausa tática e render-se** · P · Spec: FLX-11, REG-13, REG-21 · Dep: T-104
- [ ] **T-106 — Fim de partida e pontuação** · M · Spec: FLX-12, REG-22, REG-23 · Dep: T-067
  - Aceite (**marco MVP**): teste E2E (Playwright) abre o jogo, inicia um Free Battle na Lua contra IA Fácil, confere o HUD, se rende e vê a tela de derrota com estatísticas; sessão manual de 20 min contra IA Normal sem erros no console.

## M11 — Controle direto

- [ ] **T-110 — Câmeras de 1ª e 3ª pessoa** · M · Spec: CTL-08, CTL-09, CTL-15 · Dep: T-106
- [ ] **T-111 — Movimento e Impulso** · M · Spec: CTL-10, CTL-12 · Dep: T-110
- [ ] **T-112 — Mira e ações** · M · Spec: CTL-11 · Dep: T-111, T-062
  - Aceite: lasers acertam o que está sob a mira; trava do torpedo; marcador de impacto da bomba; hover de exploração minera e descarrega em controle direto.
- [ ] **T-113 — HUD, Sincronia e Sinal Perdido** · P · Spec: CTL-12 – CTL-14 · Dep: T-112

## M12 — Arte e áudio

- [ ] **T-120 — Modelos finais das unidades móveis** · G · Spec: ART-01 – ART-03, ART-05 · Dep: Q-02, T-020
- [ ] **T-121 — Modelos finais das estruturas e da Nave** · G · Spec: ART-01 – ART-04 · Dep: Q-02, T-020
- [ ] **T-122 — Efeito de impressão 3D** · M · Spec: ART-06 · Dep: T-053
- [ ] **T-123 — VFX de combate** · M · Spec: ART-07 · Dep: T-062, T-066
- [ ] **T-124 — Iluminação, pós-processamento e presets** · M · Spec: ART-08, TEC-19 · Dep: T-014
- [ ] **T-125 — Cinemática de pouso** · M · Spec: FLX-09 · Dep: T-121
- [ ] **T-126 — Áudio** · G · Spec: AUD-01 – AUD-05 · Dep: T-084, Q-03
- [ ] **T-127 — Acessibilidade** · M · Spec: UI-11, UI-12 · Dep: T-080

## M13 — Campanha (v1.0)

- [ ] **T-130 — Persistência** · P · Spec: TEC-21, CAM-04 · Dep: T-102
- [ ] **T-131 — Escolha de nação, briefing e fluxo da campanha** · M · Spec: FLX-05, FLX-06, CAM-01 · Dep: T-130, T-103
- [ ] **T-132 — Visão do Universo final** · M · Spec: FLX-04, CAM-03, ART-09 · Dep: T-131
- [ ] **T-133 — Liberação progressiva de unidades** · P · Spec: CAM-02 · Dep: T-131
- [ ] **T-134 — Missão 1 "Primeira Forja"** · G · Spec: CAM-05, §15 · Dep: T-133, T-084
  - Aceite: os 7 passos do tutorial em ordem, com destaque de interface e narração; posto avançado passivo; tutorial pode ser pulado.
- [ ] **T-135 — Cenário Shackleton e Missão 2 "Sombra Eterna"** · M · Spec: §14.1, §15 · Dep: T-134
  - Aceite (**marco v1.0**): campanha 1–2 completa, com estrelas e progresso salvo; metas de TEC-15 cumpridas.

## M14 — Release web

- [ ] **T-140 — Performance** · G · Spec: TEC-15, TEC-16 · Dep: T-124
  - Aceite: metas de fps e de tempo de tick medidas e registradas no hardware-alvo.
- [ ] **T-141 — Carregamento e orçamento de download** · M · Spec: TEC-18 · Dep: T-120, T-121
- [ ] **T-142 — Compatibilidade de navegadores** · M · Spec: TEC-20 · Dep: T-140
- [ ] **T-143 — Deploy estático** · P · Spec: TEC-02 · Dep: T-142

## M15 — Pós-v1 (v1.x)

- [ ] **T-150 — Marte, tempestade de poeira e Missão 3** · G · Spec: CEN-03, §15
- [ ] **T-151 — Fobos e Missão 4 (ondas)** · M · Spec: §15
- [ ] **T-152 — Ceres e Missão 5** · M · Spec: §15
- [ ] **T-153 — Vênus e Missão 6** · M · Spec: §15
- [ ] **T-154 — Europa e Missão 7** · M · Spec: CEN-05, §15
- [ ] **T-155 — Titã, lagos de metano e Missão 8** · G · Spec: CEN-04, §15
- [ ] **T-156 — Salvar e carregar partida** · M · Spec: TEC-08
- [ ] **T-157 — Remapeamento de teclas** · P · Spec: §22
- [ ] **T-158 — Inglês (en-US)** · M · Spec: TEC-23, Q-04
- [ ] **T-159 — Simulação em Web Worker** · M · Spec: TEC-10
