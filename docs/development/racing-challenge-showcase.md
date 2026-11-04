# Corridas e menus do Exemplo GBA

O Circuito do Farol usa a apresentação top-down; a Rota da Maré usa a câmera
em perspectiva. A seleção acontece antes da largada. R deixa de alternar cenas
durante uma prova. Pistas, colisões, carros e gráficos aprovados são preservados.

## Impulso e resultados

`runtime.config.challenge` é opcional. `boostVariableIndex` vincula o módulo
permanente da campanha: valor positivo libera uma carga na largada. L consome
uma carga durante 45 atualizações de gameplay. Um checkpoint válido repõe uma
carga, até três. Ficar parado no checkpoint não concede cargas adicionais.
O limite de terreno lento continua valendo mesmo durante o impulso.

`bestTimeTextIndex`, `resultTimeTextIndex`, `resultPositionTextIndex`,
`resultRatingTextIndex` e `resultBestTextIndex` escolhem cinco slots de texto
salvos distintos, entre 0 e 7. Não devem compartilhar o slot do nome do jogador.
O exemplo reserva 0 para o nome, 1/2 para os recordes independentes e 3–6 para
o resultado corrente. Esses campos já pertencem ao save comum: as 64 variáveis
e o schema do save permanecem iguais. Os tempos usam `MM:SS.cc`.

Somente uma conclusão válida pode melhorar um recorde. Uma derrota mostra
TREINO, preservando o tempo anterior. A classificação compara o progresso
pela pista com os rivais. Ouro exige primeiro lugar e `goldSeconds`; prata exige
até segundo lugar e `silverSeconds`; demais conclusões recebem bronze.
O resultado salva o slot automático antes de abrir sua página. Continuar uma
primeira vitória no Circuito do Farol mantém o epílogo existente da campanha.

O minimapa em perspectiva é opcional (`showMinimap`). Para pistas com pontos
autorados, o runtime rasteriza o percurso, próximo checkpoint, jogador e os
dois rivais na HUD. Ele não requer outra imagem e não altera o piso. Usa 40
tiles 4bpp em BG0/character base 2, com tile zero transparente e seis cores
nos índices 230–235, separados das 224 cores do piso e do texto. Os painéis
aprovados mantêm suas posições; impulso fica embaixo à esquerda e minimapa
acima dele. Atores continuam em OBJ.

## Pausa, mochila e retomada

Start suspende a corrida. O snapshot preserva posição, direção, velocidade,
voltas, checkpoints, cargas, duração restante do impulso e cronômetro. O tempo
em menus não entra na prova. Salvar a partir da pausa grava esse snapshot,
com as alterações comuns de áudio, inventário e equipamento feitas no menu.
Carregar em um boot novo restaura o estado da prova e os recordes.

Os módulos permanentes conservam sua tela aprovada. Ferramentas têm uma página
própria, com quantidades do inventário e vínculo com o equipamento. A ferramenta
pode ser equipada ou retirada com A; não é consumida. A bússola continua passiva
e a peça do relé continua sendo consumida pela missão original.

`availableRuntime: "racing"` restringe a disponibilidade da ação de reiniciar
a uma corrida suspensa. A confirmação usa um submenu: Cancelar retorna à pausa;
Reiniciar inicia uma nova prova. Os campos de leitura `previous_runtime`,
`previous_room` e `racing_result` permitem eventos de contexto sem ocupar
variáveis da campanha. `racing_result` é transitório; o resultado persistente
continua no payload da corrida.

Menus aceitam `binding.source: "text"` para mostrar um slot de texto salvo.
Vínculos `equipped` com `valueLabels` usam índice do item + 1; a posição zero
representa nenhum equipamento. `hudHeader` permite desenhar um título nativo
sobre um fundo reutilizado; coordenadas e largura são células de 8 pixels.
As cores RGB555 do exemplo são amostradas do cabeçalho aprovado do livro.

## Verificação

A partir de `apps/desktop-electron`:

```sh
npx vitest run src/main/racingChallenge.test.ts src/shared/previewRaceMenus.test.ts scripts/racing-menu-evolutions-project.test.mjs
```

No motor, `make racing-challenge-test` cobre impulso, limite de cargas, recordes,
texto de resultados, preservação pelo save e rasterização do minimapa.
`make verify-package` inclui os testes host e os contratos de exportação.

Os runners `smoke-lost-signal-mission.mjs` e `smoke-lost-signal-play.mjs` aceitam
`--racing-menus` e usam a mesma jornada com botões. A fixture de replay em
`scripts/lib/racing-menu-test-fixture.mjs` libera progresso por eventos em uma
cópia descartável; ela não deve ser promovida ao template. Diagnósticos ABI,
ELF e snapshots são somente leitura. A validação final também deve conferir o
projeto canônico sem essa fixture. O modo `--racing-campaign` percorre a entrada
sem liberações, a primeira vitória, o epílogo, o save automático e a mochila
vazia; no runner de Play, use também `--start=corrida_preparacao`.
Nenhuma dessas verificações prova GBA físico.
