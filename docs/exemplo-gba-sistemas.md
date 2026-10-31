# Sistemas conectados de O Último Farol

O exemplo canônico demonstra eventos, condições, procedimentos compartilhados,
escolhas, inventário, loja, equipamento, timers, segmentos paralelos, câmera,
áudio, HUD contextual e persistência. Os fundos aprovados continuam separados
dos atores e da HUD; esta evolução reutiliza os assets existentes.

## Percurso jogável

1. Comece um Novo Jogo e conclua **O sinal perdido** com a mecânica do Porto,
   o cartógrafo, o Armazém, o Observatório e o guardião do Farol. A combinação
   continua sendo **314**. Receba as duas moedas da mecânica.
2. Fale com o capitão no cais sudoeste. **Visitar o Conselho** abre uma decisão
   persistente. **Proteger a costa** concede duas moedas; **Explorar novas rotas**
   concede uma bússola. A visita opcional retorna ao Porto e preserva o capítulo.
   Repetir a visita mostra o acordo existente, sem trocar a escolha ou pagar de novo.
3. Fale com o viajante no cais leste. A ferramenta custa **4 moedas** e tem estoque
   de uma unidade. Comprar sem saldo não entrega o item. O estoque esgotado não
   permite outra compra. **Conversar** preserva a conversa original.
4. Entre no Farol pela porta ao noroeste do Porto. O guardião oferece equipamento,
   conversa e calibração. Abra **Equipamento**, escolha o primeiro slot, selecione
   **FERRAMENTA** e use **B** para retornar. Carregar a ferramenta na mochila não
   satisfaz o requisito: o evento lê o slot equipado do motor.
5. Inicie a calibração. Depois da explicação, alcance a porta inferior antes de
   **12 unidades de carga**; a bússola aumenta o limite para **18 unidades**. O cronômetro
   aparece na HUD somente durante a tentativa. O guardião reage em um segmento
   paralelo e o teste emite sinais sonoros. A primeira conclusão concede uma moeda.
6. Deixe o tempo expirar para verificar a falha e a nova tentativa. Abrir **Start**
   interrompe a tentativa. Equipamento, pacto e recompensas continuam preservados.
   Uma tentativa carregada sem seu timer também é interrompida, sem prêmio indevido.
7. Salve pelo menu Start e carregue pelo título, inclusive depois de reiniciar a
   ROM. Confira a escolha, a ferramenta equipada, o estoque e o resultado. Novo
   Jogo limpa o equipamento e o progresso desta sequência.

A criança pescadora comenta a calibração concluída; a mecânica reconhece a
ferramenta; o guarda do Mercado e o capitão respondem ao pacto. O encerramento
da corrida final inclui um parágrafo diferente para cada decisão do Conselho.

## Autoria no editor

Os novos eventos usam a categoria **Exemplo · Sistemas conectados**. As variáveis
`var_council_*`, `var_tool_stock` e `var_trial_*` tornam o estado inspecionável.
Os eventos `showcase_base_*` são procedimentos que preservam os comportamentos
anteriores. A promoção idempotente fica em
`apps/desktop-electron/scripts/showcase-systems.mjs` e integra a regeneração do
exemplo depois da missão.

O preset `hud-farol-trial` preserva os componentes da HUD B e acrescenta um quadro
e o texto ligado a `var_trial_charge`, ocultos quando `var_trial_active` é zero.
No encerramento, o painel inferior da corrida fica oculto para não cobrir o diálogo;
seu desenho e sua posição durante a partida são preservados.
Nenhum número, ator ou painel é desenhado no PNG do cenário.

`store_engine_field` e `if_engine_field` aceitam `equipped_item_0` até
`equipped_item_7`, com índice nativo do item e `-1` para slot vazio. `timer_count`
lê a quantidade de vínculos de timer. `set_equipped_item 0 none` limpa o primeiro
slot sem remover o item do inventário. Não use uma flag de posse como substituto
do equipamento real.

A carga diminui a cada 60 atualizações lógicas; o contador não representa um relógio de parede.
Timers e segmentos são transitórios; o save guarda o progresso, o inventário e
os equipamentos. O exemplo trata explicitamente a interrupção ao entrar no menu
e ao carregar, em vez de deixar um desafio ativo sem cronômetro.

## Reprodução das verificações

Execute a partir de `apps/desktop-electron`:

```sh
npx vitest run scripts/showcase-systems.test.mjs src/shared/equipmentRequirement.test.ts src/main/exportChoiceRuntimeScope.test.ts
node scripts/build-showcase-playtest.mjs /caminho/export titulo
node scripts/smoke-lost-signal-mission.mjs /caminho/export/build/exemplo.gba /caminho/export /caminho/rom --showcase
npm run build
node scripts/smoke-lost-signal-play.mjs /caminho/play --showcase
npm run gate:complete-project
```

O percurso automatizado usa somente botões para alterar o jogo. Símbolos do ELF,
telemetria e snapshots são leituras para conferir variáveis, inventário,
equipamento, menus e diálogos. Os snapshots não são carregados para progredir.
As duas escolhas partem do mesmo save feito pela missão antes do Conselho;
o segundo ramo é retomado pela tela real de carregar.

`build-showcase-playtest.mjs /caminho/final circuito_final --council-path=1`
(ou `2`) produz uma fixture explícita do projeto completo para conferir cada
encerramento, atribuindo a decisão no evento de entrada da cópia de QA. Essa fixture não prova a travessia integral da campanha.
Play renderizado, ROM em emulador, testes host e hardware físico são camadas
separadas de evidência.
