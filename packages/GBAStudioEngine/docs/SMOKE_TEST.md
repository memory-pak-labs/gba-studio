# Smoke Test mGBA

Use este roteiro antes de evoluir render, hardware core ou integracao com o GBA Studio.

## Comando

```sh
make clean && make package
scripts/smoke_mgba.sh
```

## Checklist manual

### Controles no mGBA do notebook

Quando a ROM estiver aberta no mGBA nativo, use o mapa de teclado do emulador,
e não os nomes dos botões do hardware como se fossem teclas do macOS:

| Botão GBA | Tecla do notebook | Código usado pelo player mGBA integrado |
| --- | --- | --- |
| A | `X` | `KeyX` |
| B | `Z` | `KeyZ` |
| Start | `Enter/Return` | `Enter` |
| Select | `Backspace` | `Backspace` |
| Cima / Baixo / Esquerda / Direita | Setas | `ArrowUp` / `ArrowDown` / `ArrowLeft` / `ArrowRight` |
| L / R | `A` / `S` | `KeyA` / `KeyS` |

No player integrado, os comandos devem ser enviados como eventos de teclado
com `keyDown` e `keyUp`, mantendo a tecla pressionada por pelo menos um frame.
No mGBA nativo, primeiro clique no framebuffer para dar foco à janela. A
automação por acessibilidade do macOS pode entregar atalhos da aplicação sem
entregar o evento ao viewport Qt; nesse caso, a confirmação manual deve usar o
teclado físico enquanto a validação automatizada do runtime permanece no player
mGBA integrado.

### Scripting oficial do mGBA nativo

Quando o teclado físico não estiver disponível para a sessão automatizada, o
mGBA 0.10.x oferece o painel `Tools > Scripting...`. Ele permite injetar as
teclas no core GBA e avançar frames sem depender do foco do viewport Qt:

```lua
emu:addKey(C.GBA_KEY.START)
for i = 1, 8 do emu:runFrame() end
emu:clearKey(C.GBA_KEY.START)
for i = 1, 30 do emu:runFrame() end
```

Use `C.GBA_KEY.A`, `B`, `UP`, `DOWN`, `LEFT`, `RIGHT`, `L`, `R` e `SELECT`
com o mesmo padrão de pulso (`addKey` → `runFrame` → `clearKey`). Essa rota é
apropriada para reproduzir um roteiro de validação no mGBA nativo; ela não
substitui o teste de controles no player integrado nem autoriza alterar o
estado da ROM por escrita de memória. Consulte a [API oficial de scripting do
mGBA](https://mgba.io/docs/scripting.html) para os métodos de input, frames e
leitura de memória.

- ROM abre no mGBA sem tela branca ou travamento.
- Room tiled aparece no primeiro boot.
- Player aparece como sprite 16x16.
- D-pad move o player.
- Player para nas bordas e pilares.
- O corredor central deixa o player cruzar o pilar para testar o portal sem rota complexa.
- Camera acompanha o player quando ele caminha pela room.
- Portal na direita troca para a segunda room.
- Segunda room aplica metadata propria de camera/cor de fundo.
- Portal na esquerda da segunda room retorna para a primeira room.
- Uma caixa de dialogo aparece no boot e fecha com A/B/Start.
- Pressionar A fora do dialogo dispara um texto de interacao.
- Um NPC aparece em cada room; pressionar A sobre ele dispara SFX e dialogo proprio.
- Scripts condicionais de NPC/hotspot continuam executando sem travar o runtime.
- Scripts com `Wait` pausam antes de executar comandos seguintes, sem congelar audio/render.
- Choices com mais de duas opcoes rolam pelo D-pad e confirmam o valor correto.
- Areas de agua/dano/escada mudam a cor de fundo, disparam dialogo/SFX por evento de efeito e nao bloqueiam movimento por padrao.
- Musica simples toca em loop apos o boot.
- Ao entrar no portal, o script mostra dialogo, atualiza variavel, dispara SFX audivel e faz warp.
- Segurar Select mostra o debug overlay com frame/counters/asserts; soltar Select retorna ao visual normal.
- Runtime profile `menu` gera ROM nativa pelo `production_smoke`, com selecao por Up/Down, submenu por stack, volta por B, toggle por A, slider por Left/Right e HUD de tela/item/stack no template `exported_menu`.

## Ultima validacao

- Data: 2026-05-30.
- Status: aprovado no mGBA com validacao manual assistida.
- ROM: `build/gba/examples/topdown_basic/topdown_basic.gba`.
- Engine Pack: `dist/GBAStudioEnginePack`.
- Evidencias visuais locais:
  - `build/smoke/mgba_boot.png`: boot, room tiled e player visivel.
  - `build/smoke/mgba_after_right.png`: input e camera deslocada apos movimento.
  - `build/smoke/mgba_hold_route.png`: colisao contra borda superior e camera acompanhando.
- Resultado manual: boot, room tiled, player visivel, D-pad, camera, colisao e portal foram validados no mGBA. O warp reposicionou o player na area inicial.
- Observacao: a automacao de teclado do macOS nao entregou comandos suficientes de forma confiavel para bater no portal dentro do mGBA; a confirmacao final do warp foi feita manualmente.

## Validacao Hardware Core v1

- Data: 2026-05-30.
- Status: aprovado com build/test e evidencia visual no mGBA.
- Cobertura: DMA public API, timers basicos, callbacks de VBlank/keypad e uso de Timer0/VBlank no exemplo top-down.
- Evidencia visual local: `build/smoke/mgba_hwcore_user_validation.png`.
- Resultado visual: ROM abriu no mGBA, room tiled e player visiveis, camera deslocada e sem tela branca/travamento apos o Hardware Core v1.
- Comandos:
  - `make clean && make package`
  - build externo via `dist/GBAStudioEnginePack/templates/Makefile.gba`

## Validacao Render Mosaic v2

- Data: 2026-06-02.
- Status: host test e build/package recomendados.
- Cobertura: `set_bg_mosaic`, `Sprite::mosaic`, propagacao para wrapper de hardware e rejeicao de parametros invalidos.
- Comandos:
  - `make build/host/render_runtime_tests && build/host/render_runtime_tests`
  - `make test`
  - `make verify-package`

## Validacao Resource Bank Group Lookup v1

- Data: 2026-06-03.
- Status: build/test aprovado.
- Cobertura: lookup generico de `ResourceBankGroup` por nome e helpers publicos top-down, platformer e isometricos para resolver grupos de banco exportados no `ProjectData` sem depender da ordem dos arrays.
- Comandos:
  - `make build/host/resource_manager_tests && build/host/resource_manager_tests`
  - `make build/host/project_data_tests && build/host/project_data_tests`
  - `make test`
  - `make verify-package`

## Validacao Room Resource Bank Group Binding v1

- Data: 2026-06-03.
- Status: build/test aprovado.
- Cobertura: `resource_bank_group_name` opcional em rooms top-down, platformer e isometricas; helpers de lookup do grupo a partir da room; `assetc --export-project-json` aceitando `resource_bank_group`/`bank_group` por room e gerando header C++ compilavel.
- Comandos:
  - `make build/host/project_data_tests && build/host/project_data_tests`
  - `make assetc-test`
  - `make test`
  - `make verify-package`

## Validacao Asset Pipeline Semantico v1

- Data: 2026-06-03.
- Status: host/export/package recomendado.
- Cobertura: `assetc --export-project-json` resolve IDs do `asset_pack` em `assets` e `topdown_project.backgrounds[].tilemap`, inclui headers gerados automaticamente e preserva simbolos C++ explicitos como fallback.
- Comandos:
  - `make test`
  - `make verify-package`

## Validacao Runtime Multi-Genero v1

- Data: 2026-06-03.
- Status: host/export/package recomendado.
- Cobertura: enemies e moving platforms no platformer sem heap, export JSON para `PlatformerRoomData`, e BFS/A* isometrico limitado por orcamento.
- Comandos:
  - `make build/host/platformer_tests && build/host/platformer_tests`
  - `make build/host/isometric_tests && build/host/isometric_tests`
  - `make test`
  - `make verify-package`

## Validacao Render 2D Assets v1

- Data: 2026-05-30.
- Status: build/test aprovado.
- Cobertura: structs publicos de assets, validadores host, carga DMA de paleta/tiles/tilemap, metasprite simples e `assetc` gerando `gbs::PaletteAsset`/`gbs::TileAsset`.
- Comandos:
  - `make clean && make package`
  - build externo via `dist/GBAStudioEnginePack/templates/Makefile.gba`

## Validacao Render 2D BG Layers v1

- Data: 2026-05-30.
- Status: build/test aprovado.
- Cobertura: BG0-BG3 habilitados, tilemap por camada, scroll por camada e flips de metasprite aplicados ao OAM.
- O exemplo top-down carrega um tilemap simples no BG1 e mantem o BG0 dinamico para room/camera.
- Comandos:
  - `make clean && make package`
  - build externo via `dist/GBAStudioEnginePack/templates/Makefile.gba`

## Validacao Asset Pipeline Tilemap v1

- Data: 2026-05-30.
- Status: host test aprovado.
- Cobertura: `assetc` gera `PaletteAsset`, `TileAsset` e `TileMapAsset`; deduplica tiles repetidos; aplica `--destination-tile`, `--palette-bank` e `--object-tiles`.
- Comandos:
  - `make test`

## Validacao Render 2D Large Tilemaps v2

- Data: 2026-05-30.
- Status: build/test aprovado.
- Cobertura: BG text/tiled `32x32`, `64x32`, `32x64` e `64x64`; screenblocks sem sobreposicao com tiles BG; `assetc` validado com PNG `64x64` em tiles.
- O exemplo top-down carrega um tilemap `64x32` no BG1 e mantem o BG0 dinamico para room/camera.
- Comandos:
  - `make clean && make package`
  - build externo via `dist/GBAStudioEnginePack/templates/Makefile.gba`

## Validacao Electron Build CLI v1

- Data: 2026-05-30.
- Status: build/test aprovado.
- Cobertura: `gbsbuild` gera chamada de build com caminhos absolutos, suporta `--dry-run --json`, preserva caminhos com espacos e e empacotado em `dist/GBAStudioEnginePack/tools/gbsbuild`.
- Comandos:
  - `make test`
  - build externo via `dist/GBAStudioEnginePack/tools/gbsbuild`

## Validacao Electron Diagnostics CLI v1

- Data: 2026-05-30.
- Status: build/test aprovado.
- Cobertura: `enginepack.json` empacotado; `gbsdoctor` valida Engine Pack, projeto exportado, CLIs e toolchain; saida JSON consumivel por Electron.
- Comandos:
  - `make test`
  - `dist/GBAStudioEnginePack/tools/gbsdoctor --engine-pack dist/GBAStudioEnginePack --project-dir <projeto> --json`

## Validacao Engine Pack v0.2

- Data: 2026-05-30.
- Status: build/test aprovado.
- Cobertura: `VERSION`/CLIs em `0.2.0`, `enginepack.json`, `CHANGELOG.md`, `gbsdoctor`, `assetc`, `gbsbuild` e build externo em um unico smoke.
- Comandos:
  - `make verify-package`

## Validacao Top-down Data-driven v1

- Data: 2026-05-30.
- Status: build/test aprovado.
- Cobertura: `gbs/project.hpp`, `gbastudio_project_data.hpp`, room, assets, background, player, camera e portais consumidos por `main.cpp`.
- Comandos:
  - `make test`
  - `make topdown_basic.gba`

## Validacao Eventos e Dialogo Visual v1

- Data: 2026-05-31.
- Status: build/test aprovado.
- Cobertura: `gbs/dialogue.hpp`, scripts por room/portal/interacao, caixa de dialogo tiled, `show_dialogue`, `warp`, `set_variable` e `play_sfx` stub no runtime top-down.
- Comandos:
  - `make test`
  - `make verify-package`

## Validacao Audio PSG v1

- Data: 2026-05-31.
- Status: build/test aprovado.
- Cobertura: `gbs/audio.hpp`, SFX em square/noise channel, musica PSG simples, `PlaySfx` conectado ao runtime top-down e Engine Pack `0.4.0`.
- Comandos:
  - `make test`
  - `make verify-package`
- Smoke manual recomendado: abrir `topdown_basic.gba`, fechar dialogo inicial, confirmar musica em loop e ouvir SFX ao entrar no portal.

## Validacao Asset Pipeline Sprite v2

- Data: 2026-05-31.
- Status: build/test aprovado.
- Cobertura: `assetc` gerando spritesheets 16x16/16x32, metasprites, `SpriteAnimation`, `gbs/animation.hpp` e player do `topdown_basic` consumindo asset gerado.
- Comandos:
  - `make test`
  - `make verify-package`
- Smoke manual recomendado: abrir `topdown_basic.gba` e confirmar que o player continua visivel enquanto alterna frames.

## Validacao Room Streaming v1

- Data: 2026-05-31.
- Status: build/test aprovado.
- Cobertura: duas rooms em `gbastudio_project_data.hpp`, visual/collision/portais/eventos por room, warp ida/volta e `on_enter` da room destino.
- Comandos:
  - `make test`
  - `make verify-package`
- Smoke manual recomendado: andar ate o portal direito, confirmar room 2/dialogo; andar ate o portal esquerdo, confirmar retorno para room 1.

## Validacao Render Runtime v3

- Data: 2026-05-31.
- Status: build/test aprovado.
- Cobertura: `gbs/compression.hpp`, decode RLE 16-bit, `Rle16TileMapAsset`, parallax por background e BG1 comprimido/parallax no `topdown_basic`.
- Comandos:
  - `make test`
  - `make topdown_basic.gba`
  - `make verify-package`
- Smoke manual recomendado: abrir `topdown_basic.gba`, caminhar horizontalmente e confirmar que o BG1 se move em velocidade diferente da room em BG0.

## Validacao Render Effects v1

- Data: 2026-06-02.
- Status: build/test aprovado.
- Cobertura: API publica para blending alpha/brightness, mosaic e window0; validacao host de masks, fatores e retangulos.
- Comandos:
  - `make test`
  - `make topdown_basic.gba`
  - `make verify-package`

## Validacao Render Priority v1

- Data: 2026-06-02.
- Status: build/test aprovado.
- Cobertura: prioridades BG0-BG3 e OBJ `0..3`, validacao host e escrita dos bits de hardware no runtime.
- Comandos:
  - `make test`
  - `make topdown_basic.gba`
  - `make verify-package`

## Validacao Render Window v2

- Data: 2026-06-02.
- Status: build/test aprovado.
- Cobertura: API publica para window1, OBJ window, modo `SpriteRenderMode::Window`, validacao host de masks e escrita dos bits de janela no runtime.
- Comandos:
  - `make test`
  - `make topdown_basic.gba`
  - `make verify-package`

## Validacao Render Affine BG v1

- Data: 2026-06-02.
- Status: build/test aprovado.
- Cobertura: API publica para modo de video 0/1/2, affine BG2/BG3, validacao host de camadas validas e escrita dos registradores affine no runtime.
- Comandos:
  - `make test`
  - `make topdown_basic.gba`
  - `make verify-package`

## Validacao Bitmap Modes v1

- Data: 2026-06-02.
- Status: build/test aprovado.
- Cobertura: API publica para modos bitmap 3/4/5, assets 16-bit/8-bit, page flip, validacao host de dimensoes/paginas e escrita em VRAM no runtime.
- Comandos:
  - `make test`
  - `make topdown_basic.gba`
  - `make verify-package`

## Validacao Asset Pipeline Bitmap v1

- Data: 2026-06-02.
- Status: host test aprovado no macOS.
- Cobertura: `assetc --bitmap-mode 3|4|5` gera `Bitmap16Asset`/`Bitmap8Asset`, `PaletteAsset` para mode 4 e headers compilaveis contra a API publica.
- Comandos:
  - `make assetc-test`

## Validacao Asset Pipeline Affine BG v1

- Data: 2026-06-02.
- Status: host test aprovado no macOS.
- Cobertura: `assetc --affine-tilemap` gera `AffineTileAsset`, `AffineTileMapAsset`, paleta 8bpp e header compilavel contra a API publica.
- Comandos:
  - `make assetc-test`

## Validacao Asset Pipeline Pack Report v1

- Data: 2026-06-02.
- Status: host test aprovado no macOS.
- Cobertura: `assetc --pack-json` gera `GBAStudioAssetPackReport` valido, mede PNGs reais para BG/OBJ/affine e retorna falha com JSON quando ha overflow de recursos.
- Comandos:
  - `make assetc-test`

## Validacao Compression LZ77 v2

- Data: 2026-06-11.
- Status: build/test aprovado.
- Cobertura: `gbs/compression.hpp` com decoder LZ77 estilo GBA, `Lz77TileMapAsset`, `Lz77TileAsset`, `Lz77PaletteAsset`, `assetc --lz77-tilemap`, `assetc --lz77-tiles`, `assetc --lz77-palette` e carga de tilemap/tiles/paletas LZ77 pelo render.
- Comandos:
  - `make build/host/render_asset_tests && build/host/render_asset_tests`
  - `make build/host/render_runtime_tests && build/host/render_runtime_tests`
  - `make assetc-test`
  - `make verify-package`

## Validacao Render/Audio Production Diagnostics v1

- Data: 2026-06-04.
- Status: build/test aprovado.
- Cobertura: `RenderAssetCost` estima bytes/tiles/screenblocks/OAM de paletas, tiles, tilemaps, affine, bitmaps e metasprites; `AudioMixCost` estima PSG, tracker, PCM, frames de mixer, samples de saida e vozes. O `topdown_basic` valida custos no boot e publica counters temporarios para smoke/debug.
- Comandos:
  - `make build/host/render_asset_tests build/host/audio_tests && build/host/render_asset_tests && build/host/audio_tests`
  - `make test`
  - `make verify-package`
- Smoke manual recomendado: abrir `topdown_basic.gba`, confirmar boot normal, dialogo inicial, movimento, colisao, portal, audio e ausencia de assert visual de debug.

## Validacao Asset Pipeline RLE Tilemap v3

- Data: 2026-05-31.
- Status: build/test aprovado.
- Cobertura: `assetc --rle-tilemap` gera `TileMapAsset` compativel e `Rle16TileMapAsset` opcional no mesmo header.
- Comandos:
  - `make assetc-test`
  - `make test`
  - `make verify-package`

## Validacao Dialogo Visual v2

- Data: 2026-05-31.
- Status: build/test aprovado.
- Cobertura: paginacao automatica por limite de linhas/wrap, `DialogueState::page_text`, `page_index`, `has_next_page` e exemplo com dialogo inicial multi-pagina.
- Comandos:
  - `make build/host/dialogue_tests && build/host/dialogue_tests`
  - `make test`
  - `make verify-package`
- Smoke manual recomendado: abrir `topdown_basic.gba`, pressionar A uma vez para avancar a pagina inicial e pressionar A novamente para fechar.

## Validacao Interacao Hotspot v1

- Data: 2026-05-31.
- Status: build/test aprovado.
- Cobertura: `TopDownInteractionData`, lookup por retangulo intersectando o player, fallback `on_interact` e hotspots no `topdown_basic`.
- Comandos:
  - `make build/host/project_data_tests && build/host/project_data_tests`
  - `make topdown_basic.gba`
  - `make verify-package`
- Smoke manual recomendado: fechar dialogo inicial, pressionar A na posicao inicial da room 1 e confirmar texto de hotspot; mover para fora e confirmar fallback da room.

## Validacao NPC/Actor v1

- Data: 2026-05-31.
- Status: build/test aprovado.
- Cobertura: `TopDownNpcData`, lookup `npc_event_script_for`, NPC animado por room e scripts de NPC com `set_variable`, `play_sfx` e `show_dialogue`.
- Comandos:
  - `make build/host/project_data_tests && build/host/project_data_tests`
  - `make topdown_basic.gba`
  - `make verify-package`
- Smoke manual recomendado: fechar dialogo inicial, mover ate o NPC da room atual, pressionar A e confirmar SFX + dialogo do NPC; repetir apos trocar de room.

## Validacao NPC Movement v1

- Data: 2026-06-02.
- Status: build/test aprovado.
- Cobertura: pathfinding BFS limitado em colisao top-down, `move_actor_towards`, patrulha com bounds, follow player e atualizacao de NPCs no `topdown_basic`.
- Comandos:
  - `make build/host/topdown_tests && build/host/topdown_tests`
  - `make build/host/project_data_tests && build/host/project_data_tests`
  - `make topdown_basic.gba`
  - `make verify-package`
- Smoke manual recomendado: abrir `topdown_basic.gba`, fechar dialogo inicial e confirmar um NPC patrulhando na room inicial; apos trocar de room, confirmar NPC seguindo o player sem atravessar pilares.

## Validacao Save System v1

- Data: 2026-06-02.
- Status: build/test aprovado.
- Cobertura: `gbs/save.hpp`, slots SRAM 32 KB, assinatura/versao/checksum, buffer host para testes e autosave simples do `topdown_basic` apos warp.
- Comandos:
  - `make build/host/save_tests && build/host/save_tests`
  - `make topdown_basic.gba`
  - `make verify-package`
- Smoke manual recomendado: abrir `topdown_basic.gba`, entrar em portal para gerar autosave, reiniciar a ROM no mGBA com save preservado e confirmar retorno para a room/posicao salva.

## Validacao UI/HUD v1

- Data: 2026-06-02.
- Status: build/test aprovado.
- Cobertura: `gbs/ui.hpp`, estado de HUD, menu com itens desabilitados, navegacao, aceitar/cancelar, HUD no topo e menu de pausa com save manual no `topdown_basic`.
- Comandos:
  - `make build/host/ui_tests && build/host/ui_tests`
  - `make topdown_basic.gba`
  - `make verify-package`
- Smoke manual recomendado: abrir `topdown_basic.gba`, confirmar HUD no topo, pressionar Start para abrir PAUSE, alternar opcoes, selecionar SAVE e confirmar que o contador de save muda.

## Validacao UI/Menu v2

- Data: 2026-06-02.
- Status: host test aprovado.
- Cobertura: helpers de pagina, indicadores `^`/`v`, salto L/R por pagina, itens desabilitados preservados e menu sem heap.
- Comandos:
  - `make build/host/ui_tests && build/host/ui_tests`
  - `make topdown_basic.gba`
  - `make test`
  - `make verify-package`

## Validacao Actor Collision v1

- Data: 2026-06-02.
- Status: build/test aprovado.
- Cobertura: overlap ator-ator, retangulo contra ator, player bloqueado por NPC, NPC bloqueado por player/outro NPC e IA top-down respeitando blockers fixos.
- Comandos:
  - `make build/host/topdown_tests && build/host/topdown_tests`
  - `make build/host/project_data_tests && build/host/project_data_tests`
  - `make topdown_basic.gba`
  - `make verify-package`
- Smoke manual recomendado: abrir `topdown_basic.gba`, aproximar o player de NPCs e confirmar que nao ha sobreposicao; observar NPC patrulhando/seguindo sem atravessar player ou outro NPC.

## Validacao Actor Collision v2

- Data: 2026-06-02.
- Status: host test aprovado.
- Cobertura: `collision_group`, `collision_mask`, filtro de blockers por grupo, `rect_hits_any_blocking_actor` e compatibilidade com blockers padrao.
- Comandos:
  - `make build/host/topdown_tests && build/host/topdown_tests`
  - `make test`
  - `make verify-package`

## Validacao NPC Pathfinding v2

- Data: 2026-06-02.
- Status: host test aprovado.
- Cobertura: `find_actor_path_step_with_actor_collisions`, BFS com ator bloqueador e fallback para tile alcançavel mais proximo do alvo.
- Comandos:
  - `make build/host/topdown_tests && build/host/topdown_tests`
  - `make topdown_basic.gba`
  - `make test`
  - `make verify-package`

## Validacao Asset Pack Report v2

- Data: 2026-06-02.
- Status: build/test aprovado.
- Cobertura: `assetc --pack-json` schema 2, budgets globais e fingerprints CRC32 por asset/fonte.
- Comandos:
  - `make test`
  - `make verify-package`

## Validacao Asset Pack Report v3

- Data: 2026-06-02.
- Status: host/package aprovado no macOS.
- Cobertura: `assetc --pack-json` schema 3, `banks`, `incremental`, `allocations[].status` e comparacao via `--previous-pack-report`.
- Aceite: assets inalterados aparecem como `unchanged`, assets novos como `new`, assets removidos em `incremental.assets.removed` e overflow continua retornando exit code diferente de zero com JSON valido.
- Comandos:
  - `make test`
  - `make verify-package`

## Validacao Asset Pack Report v4

- Data: 2026-06-02.
- Status: host/package aprovado no macOS.
- Cobertura: `allocations[].change_reason` para asset novo, fingerprint inalterado e recursos alterados via `--previous-pack-report`.
- Aceite: relatorio indica `new_asset`, `fingerprint_match` e `resources_changed` nos casos esperados, mantendo `changed/new/unchanged/removed`.
- Comandos:
  - `make test`
  - `make verify-package`

## Validacao Asset Pack Report v5

- Data: 2026-06-02.
- Status: host/package aprovado no macOS.
- Cobertura: `assetc --pack-json` rejeita `asset.id` duplicado antes de gerar relatorio incremental ambiguo.
- Aceite: pack com dois assets usando o mesmo `id` retorna exit code diferente de zero e mensagem `asset.id duplicado no pack`.
- Comandos:
  - `make test`
  - `make verify-package`

## Validacao Save System v2

- Data: 2026-06-02.
- Status: build/test aprovado.
- Cobertura: `SaveBank`, slots indexados, latest por sequence, contagem de saves validos, clear slot/bank e menu top-down com `SAVE 1/2/3` e `LOAD 1/2/3`.
- Comandos:
  - `make build/host/save_tests && build/host/save_tests`
  - `make topdown_basic.gba`
  - `make verify-package`
- Smoke manual recomendado: abrir `topdown_basic.gba`, salvar em dois slots pelo menu de pausa, mover o player, carregar cada slot e confirmar room/posicao/variaveis restauradas; reiniciar a ROM e confirmar que o slot mais recente e restaurado.

## Validacao Save Metadata v1

- Data: 2026-06-02.
- Status: build/test aprovado.
- Cobertura: `SaveMetadata`, records serializados sem heap, roundtrip de payload com metadata, rejeicao de raw save como record e labels de `LOAD` com room/tempo no `topdown_basic`.
- Comandos:
  - `make build/host/save_tests && build/host/save_tests`
  - `make topdown_basic.gba`
  - `make verify-package`

## Validacao Save Metadata v2

- Data: 2026-06-02.
- Status: host test aprovado.
- Cobertura: `format_save_play_time`, formatos `MM:SS`/`H:MM:SS`, buffer pequeno e labels de tempo no menu top-down.
- Comandos:
  - `make build/host/save_tests && build/host/save_tests`
  - `make topdown_basic.gba`
  - `make test`
  - `make verify-package`
- Smoke manual recomendado: abrir `topdown_basic.gba`, salvar em dois slots em rooms/tempos diferentes, abrir PAUSE e confirmar labels `LOAD` com room/tempo; carregar cada slot e confirmar restauracao.

## Validacao Save Payloads Multi-genero v1

- Data: 2026-06-03.
- Status: host aprovado no macOS.
- Cobertura: `PlatformerSaveData` e `IsometricSaveData`, captura/aplicacao de room, player/atores, camera, variaveis, tempo de jogo, rejeicao de room invalida e capacidade insuficiente de atores.
- Comandos:
  - `make build/host/project_data_tests && build/host/project_data_tests`

## Validacao Platformer Save Runtime v1

- Data: 2026-06-03.
- Status: build/package aprovado no macOS.
- Cobertura: `platformer_basic` restaura o save mais recente no boot e grava `PlatformerSaveData` em SRAM ao ativar checkpoint ou executar warp de room.
- Comandos:
  - `make platformer_basic.gba`
  - `make test`
  - `make verify-package`

## Validacao Isometric Save Runtime v1

- Data: 2026-06-03.
- Status: build/package aprovado no macOS.
- Cobertura: `isometric_basic` restaura o save mais recente no boot e grava `IsometricSaveData` em SRAM apos interacao ou warp de room.
- Comandos:
  - `make isometric_basic.gba`
  - `make test`
  - `make verify-package`

## Validacao Export Save Config v1

- Data: 2026-06-03.
- Status: host aprovado no macOS.
- Cobertura: `topdown_project.save`, `platformer_project.save` e `isometric_project.save` em fixtures simuladas, geracao de `save_enabled`, `gbs::SaveBank save_bank`, assinatura/slot/version no header exportado e compile host validando `gbs::is_valid_save_bank`.
- Comandos:
  - `make assetc-test`
  - `make verify-package`

## Validacao Debug/Profile Core v2

- Data: 2026-06-02.
- Status: build/test aprovado.
- Cobertura: `gbs/debug.hpp`, asserts leves, budget de frame, contadores nomeados, picos, overlay visual opt-in e counters usados no `topdown_basic`.
- Comandos:
  - `make build/host/debug_tests && build/host/debug_tests`
  - `make topdown_basic.gba`
  - `make verify-package`
- Smoke manual recomendado: abrir `topdown_basic.gba`, segurar Select e confirmar overlay `DBG` com counters de NPC/trigger/tilefx; soltar Select e confirmar que HUD/dialogo/menu continuam normais.

## Validacao DMA VBlank Queue v1

- Data: 2026-06-02.
- Status: build/test aprovado.
- Cobertura: fila DMA fixa para VBlank, wrappers 16/32-bit, flush manual por canal, flush automatico em `wait_vblank`, stats e overflow/rejeicao.
- Comandos:
  - `make build/host/hardware_core_tests && build/host/hardware_core_tests`
  - `make topdown_basic.gba`
  - `make verify-package`
- Smoke manual recomendado: abrir `topdown_basic.gba` e confirmar que boot, dialogo, HUD, movimento, sprites, audio e portal continuam normais apos o flush automatico da fila DMA.

## Validacao DMA VBlank Queue v2

- Data: 2026-06-02.
- Status: host test aprovado.
- Cobertura: `peak_queued`, reset de stats sem descartar fila, contadores de submitted/flushed/dropped e overflow seguro.
- Comandos:
  - `make build/host/hardware_core_tests && build/host/hardware_core_tests`
  - `make topdown_basic.gba`
  - `make test`
  - `make verify-package`

## Validacao Eventos v2

- Data: 2026-05-31.
- Status: build/test aprovado.
- Cobertura: `ClearVariable`, `AddVariable`, `Jump`, branches por variavel igual/diferente, branch por flag setada e `ShowDialogueIf`.
- Comandos:
  - `make build/host/topdown_tests && build/host/topdown_tests`
  - `make topdown_basic.gba`
  - `make verify-package`
- Smoke manual recomendado: interagir com hotspot/NPC e confirmar que dialogos condicionais aparecem sem travar o jogo.

## Validacao Room Metadata v1

- Data: 2026-05-31.
- Status: build/test aprovado.
- Cobertura: `TopDownRoomMetadata`, camera follow/fixed por room, player start opcional, musica por indice e backdrop por room.
- Comandos:
  - `make build/host/project_data_tests && build/host/project_data_tests`
  - `make topdown_basic.gba`
  - `make verify-package`
- Smoke manual recomendado: abrir a ROM, trocar para a segunda room e confirmar que camera/cor de fundo mudam sem quebrar colisao, dialogo, audio ou portal.

## Validacao Cross-platform Diagnostics v1

- Data: 2026-05-31.
- Status: macOS build/test aprovado; Windows/Linux pendentes de ambiente real.
- Cobertura: `gbsdoctor --json` reporta plataforma, ambiente e candidatos de executavel sem extensao/`.exe` para consumo por Electron.
- Comandos:
  - `make gbsdoctor-test`
  - `make verify-beta-readiness`
  - `make test`
  - `make verify-package`

## Validacao Export Fixture v1

- Data: 2026-05-31.
- Status: build/test aprovado no macOS.
- Cobertura: `templates/exported_topdown`, `templates/exported_platformer`, `templates/exported_isometric`, `templates/exported_shmup` e demais templates de runtime profile com `gbastudio_project.json`, `main.cpp` e headers de dados estaticos compilando fora do repo privado via Engine Pack.
- Comandos:
  - `make verify-export-fixture`
  - `make verify-package`

## Validacao Project Manifest Diagnostics v1

- Data: 2026-05-31.
- Status: build/test aprovado no macOS.
- Cobertura: `gbsdoctor` valida backend, genero (`kind`), entrada, `project_data`, assets gerados e build config declarados em `gbastudio_project.json`.
- Comandos:
  - `make gbsdoctor-test`
  - `make verify-export-fixture`
  - `make verify-package`

## Validacao Project Requires Diagnostics v1

- Data: 2026-06-02.
- Status: build/test aprovado no macOS.
- Cobertura: `gbsdoctor` valida `requires.engine_pack` e `requires.features` contra `enginepack.json`, incluindo rejeicao de feature ausente antes do build.
- Comandos:
  - `make gbsdoctor-test`
  - `make verify-export-fixture`
  - `make verify-package`

## Validacao gbsdoctor Engine Manifest Summary v1

- Data: 2026-06-02.
- Status: host/package aprovado no macOS.
- Cobertura: `gbsdoctor --json` retorna `engine_manifest` com versao, grupos de capacidades, lista achatada, contagem, ferramentas e templates.
- Aceite: JSON contem `engine_manifest.version`, `capability_count` e capability conhecida como `asset-pack-duplicate-id-validation`.
- Comandos:
  - `make gbsdoctor-test`
  - `make verify-package`

## Validacao gbsdoctor Production Diagnostics v1

- Data: 2026-06-04.
- Status: build/test aprovado.
- Cobertura: `gbsdoctor --json` retorna `diagnostics.genres`, `diagnostics.templates`, `asset_banking`, `render_cost`, `audio_cost`, `toolchain` e `actionable_messages[]` para consumo direto por Electron/GBA Studio.
- Comandos:
  - `make gbsdoctor-test`
  - `make verify-package`

## Validacao Butano Replacement Readiness v1.50

- Data: 2026-06-11.
- Status: teste focado aprovado no macOS.
- Cobertura: `gbsdoctor --json` retorna `diagnostics.butano_replacement_readiness` com `stage`, `backend_policy`, `required_before_primary_backend`, `missing_manual_gates`, `next_actions`, readiness por genero, capacidades, stress readiness e blockers para o app decidir beta/promocao sem remover rollback legado/manual automaticamente. `gbsdoctor --readiness-only --json` retorna o mesmo contrato em formato compacto para UI, `gbsdoctor --write-readiness-report` grava esse contrato como artefato de release/CI validavel por `schemas/readiness_report.schema.json`, `gbsdoctor --validate-readiness-report` valida artefatos arquivados, `gbsdoctor --write-promotion-bundle` gera uma pasta de promocao para release/CI com `gbsdoctor_report.json` completo, `public_schema_catalog.json`, `promotion_summary.json` compacto e `file_integrity` com SHA-256; quando `--readiness-evidence` e usado, o bundle tambem arquiva o `readiness_evidence.json` real e seu hash. `gbsdoctor --validate-promotion-bundle` valida bundles arquivados, catalogo publico embutido, resumo JSON de promocao, falha em artefatos alterados e retorna `readiness_summary`, `public_schema_catalog_summary` e `promotion_summary_summary` para UI/CI conforme `schemas/promotion_bundle_validation.schema.json`, `gbsdoctor --validate-public-schema` valida contratos publicos por chave ou por `auto` (`gbastudio_project`, `export_project`, `asset_pack`, `asset_pack_report`, `readiness_evidence`, `readiness_report`, `promotion_bundle`, `promotion_bundle_validation`, `promotion_summary` e `public_schema_catalog`), `gbsdoctor --list-public-schemas` publica o catalogo desses contratos com tamanho, SHA-256 e lista de schemas ausentes, `gbsdoctor --write-public-schema-catalog` grava esse catalogo como artefato de release/CI, `gbsdoctor --verify-public-schema-catalog` compara catalogos arquivados contra o pacote atual e falha em hash/tamanho divergente, `gbsdoctor --validate-promotion-bundle --require-primary-ready` falha quando o bundle arquivado ainda nao pode virar backend principal, e `gbsdoctor --require-primary-ready --json` falha enquanto o pacote ainda nao puder virar backend principal. `gbsdoctor --readiness-evidence` tambem valida evidencias externas, rejeita gates obrigatorios ausentes, malformados ou sem `evidence_type`, e promove `stage` para `primary_ready` somente quando smoke mGBA, hardware/CI completo e rollout privado da engine primaria estao marcados como `ok` com proveniencia compativel. `gbsdoctor --print-readiness-evidence-template` gera um JSON inicial validavel pelo schema, `gbsdoctor --write-readiness-evidence-template` grava o arquivo inicial diretamente para app/CI, `gbsdoctor --update-readiness-evidence` atualiza gates individuais com validacao e `gbsdoctor --merge-readiness-evidence` junta evidencias parciais validadas em um unico arquivo.
- Comandos:
  - `make gbsdoctor-test`
  - `make verify-beta-readiness`

## Validacao Production Smoke CLI v1

- Data: 2026-06-04.
- Status: package aprovado no macOS.
- Cobertura: `tools/production_smoke --json` prepara e valida top-down, platformer, isometrico e um projeto gerado por `assetc --export-project-json`, rodando `gbsdoctor`, `gbsbuild --dry-run` e build real quando `--skip-build` nao e usado. `tools/production_smoke --engine-primary-rollout-pass --write-readiness-evidence` grava evidencia parcial validavel de `gba_studio_engine_primary_rollout` somente apos smoke verde e deixa smoke mGBA/hardware pendentes.
- Comandos:
  - `make verify-production-smoke`
  - `dist/GBAStudioEnginePack/tools/production_smoke --engine-pack dist/GBAStudioEnginePack --json`

## Validacao Actor Command Runtime v2

- Data: 2026-06-02.
- Status: build/test aprovado no macOS.
- Cobertura: consumo em lote de comandos de ator, limpeza deterministica da fila, indices invalidos ignorados com seguranca e saturacao da fila fixa.
- Comandos:
  - `make build/host/project_data_tests build/host/topdown_tests`
  - `build/host/project_data_tests`
  - `build/host/topdown_tests`

## Validacao Asset Pipeline Collision Flags v3

- Data: 2026-05-31.
- Status: host test aprovado.
- Cobertura: `assetc --collision-color-index` gera `*_collision_flags` e `gbs::TileMap` compilavel a partir de PNG.
- Comandos:
  - `make assetc-test`
  - `make test`
  - `make verify-package`

## Validacao Asset Pipeline Audio PSG v1

- Data: 2026-05-31.
- Status: host test aprovado.
- Cobertura: `assetc --audio-json` gera `SfxAsset`, `MusicAsset` PSG e `PcmAsset` 8-bit assinado compilaveis.
- Comandos:
  - `make assetc-test`
  - `make test`
  - `make verify-package`

## Validacao Direct Sound PCM v1

- Data: 2026-06-02.
- Status: build/test aprovado no macOS.
- Cobertura: `PcmAsset`, validacao de sample rate, SFX PCM finito, musica PCM em loop, retomada de musica apos SFX e hardware Direct Sound/FIFO A via DMA/timer.
- Comandos:
  - `make build/host/audio_tests`
  - `build/host/audio_tests`

## Validacao WAV Import v1

- Data: 2026-06-02.
- Status: host test aprovado no macOS.
- Cobertura: `assetc --audio-json` importa WAV PCM mono 8-bit e stereo 16-bit, converte para `PcmAsset` e compila o header gerado.
- Comandos:
  - `make assetc-test`

## Validacao PCM Mixer v1

- Data: 2026-06-02.
- Status: build/test aprovado no macOS.
- Cobertura: mixer Direct Sound PCM em software, ate 4 SFX simultaneos, saturacao segura, prioridade, volume e musica PCM mixada com SFX.
- Comandos:
  - `make build/host/audio_tests`
  - `build/host/audio_tests`

## Validacao PCM Streaming v1

- Data: 2026-06-02.
- Status: build/test aprovado no macOS.
- Cobertura: stream PCM por blocos, abertura unica do stream durante musica/SFX continuos, submissao de blocos por frame e parada segura ao terminar.
- Comandos:
  - `make build/host/audio_tests`
  - `build/host/audio_tests`

## Validacao Tracker PSG v1

- Data: 2026-06-02.
- Status: build/test aprovado no macOS.
- Cobertura: `TrackerAsset`, patterns/order table, canais square/noise, loop, fim sem loop, troca com musica simples e `assetc --audio-json` gerando tracker compilavel.
- Comandos:
  - `make build/host/audio_tests`
  - `build/host/audio_tests`
  - `make assetc-test`

## Validacao MOD Import v1

- Data: 2026-06-02.
- Status: host test aprovado no macOS.
- Cobertura: `assetc --audio-json` importa MOD ProTracker 4 canais subset via `tracker[].mod`, converte periods/order/patterns para `TrackerAsset` e compila o header gerado.
- Comandos:
  - `make assetc-test`

## Validacao MOD Effects v2

- Data: 2026-06-02.
- Status: host test aprovado no macOS.
- Cobertura: volume de sample MOD, `Cxx` para volume por nota, `Fxx` para duracao base de linha, `0xy` arpeggio, `1xx` slide up, `2xx` slide down e `Axy` volume slide no conversor.
- Comandos:
  - `make assetc-test`

## Validacao S3M Import v2

- Data: 2026-06-02.
- Status: host test aprovado no macOS.
- Cobertura: `assetc --audio-json` importa S3M subset via `tracker[].s3m`, converte notas/order/pattern compactado, volume column, `Axx`, `Dxy`, `Exx` e `Fxx` para `TrackerAsset` compilavel.
- Comandos:
  - `make assetc-test`

## Validacao VGM Import v3

- Data: 2026-06-02.
- Status: host test aprovado no macOS.
- Cobertura: `assetc --audio-json` importa VGM SN76489 subset via `tracker[].vgm`, converte writes PSG `0x50`, waits basicos, mudancas de volume e noise channel para `TrackerAsset` compilavel, ignorando Game Gear stereo byte e data blocks auxiliares.
- Comandos:
  - `make assetc-test`

## Validacao MOD Sample PCM v1

- Data: 2026-06-02.
- Status: host test aprovado no macOS.
- Cobertura: `assetc --audio-json` importa sample MOD ProTracker via `pcm[].mod_sample`, converte bytes 8-bit assinados para `PcmAsset` e compila o header gerado.
- Comandos:
  - `make assetc-test`

## Validacao S3M Sample PCM v2

- Data: 2026-06-02.
- Status: host test aprovado no macOS.
- Cobertura: `assetc --audio-json` importa samples S3M 8-bit mono e 16-bit stereo via `pcm[].s3m_sample`, converte para `PcmAsset` 8-bit assinado, downmixa stereo para mono e compila o header gerado.
- Comandos:
  - `make assetc-test`

## Validacao PCM Loop Points v1

- Data: 2026-06-02.
- Status: host test aprovado no macOS.
- Cobertura: `PcmAsset` valida `loop_start_sample`/`loop_end_sample`, o mixer PCM repete somente o trecho de loop e `assetc --audio-json` emite loop points vindos de samples MOD/S3M.
- Comandos:
  - `make build/host/audio_tests && build/host/audio_tests`
  - `make assetc-test`

## Validacao Tracker Instrument Metadata v1

- Data: 2026-06-02.
- Status: host test aprovado no macOS.
- Cobertura: `assetc --audio-json` aplica finetune de sample MOD no `TrackerAsset` e usa volume de instrumento S3M quando a nota nao possui volume column.
- Comandos:
  - `make assetc-test`

## Validacao Tracker Tempo v1

- Data: 2026-06-02.
- Status: host test aprovado no macOS.
- Cobertura: `assetc --audio-json` converte BPM MOD `Fxx > 32` e tempo S3M `Txx` em duracoes de `TrackerStep` derivadas do speed atual.
- Comandos:
  - `make assetc-test`

## Validacao Tracker Portamento v1

- Data: 2026-06-02.
- Status: host test aprovado no macOS.
- Cobertura: `assetc --audio-json` converte MOD `3xx` e S3M `Gxx` em micro-steps de portamento aproximado usando a ultima frequencia conhecida do canal.
- Comandos:
  - `make assetc-test`

## Validacao Tracker Vibrato v1

- Data: 2026-06-02.
- Status: host test aprovado no macOS.
- Cobertura: `assetc --audio-json` converte MOD `4xy` e S3M `Hxy` em micro-steps de vibrato aproximado por variacao senoidal de frequencia.
- Comandos:
  - `make assetc-test`

## Validacao Tracker Tremolo v1

- Data: 2026-06-02.
- Status: host test aprovado no macOS.
- Cobertura: `assetc --audio-json` converte MOD `7xy` e S3M `Rxy` em micro-steps de tremolo aproximado por variacao senoidal de volume.
- Comandos:
  - `make assetc-test`

## Validacao Tracker Pattern Control v1

- Data: 2026-06-02.
- Status: host test aprovado no macOS.
- Cobertura: `assetc --audio-json` converte MOD `Bxx`/`Dxx` e S3M `Bxx`/`Cxx` em order table efetiva, truncando patterns no row de controle.
- Comandos:
  - `make assetc-test`

## Validacao Resource Managers v1

- Data: 2026-05-31.
- Status: build/test aprovado.
- Cobertura: pools estaticos para tiles BG/OBJ, paletas e OAM; reserva fixa, reserva alinhada, reset e overflow.
- Comandos:
  - `make build/host/resource_manager_tests && build/host/resource_manager_tests`
  - `make topdown_basic.gba`
  - `make verify-package`

## Validacao Resource Managers v2

- Data: 2026-06-02.
- Status: build/test aprovado.
- Cobertura: liberacao defensiva de ranges, helpers `reserve_next_*`, reserva por `TileAsset`/`PaletteAsset` e release tipado de tiles/paletas/OAM.
- Comandos:
  - `make build/host/resource_manager_tests && build/host/resource_manager_tests`
  - `make test`
  - `make verify-package`

## Validacao Resource Managers v3

- Data: 2026-06-02.
- Status: host test aprovado.
- Cobertura: snapshots de pool/manager, rollback de multiplos pools e rejeicao de snapshots invalidos sem mutar o estado atual.
- Comandos:
  - `make build/host/resource_manager_tests && build/host/resource_manager_tests`
  - `make test`
  - `make verify-package`

## Validacao Hardware Core IRQ v2

- Data: 2026-05-31.
- Status: build/test aprovado; smoke manual mGBA recomendado.
- Cobertura: dispatcher em `0x03007FFC`, bits reais de VBlank/timer/keypad em `IE/IF`, compatibilidade com callbacks publicos e fallback em `wait_vblank`.
- Comandos:
  - `make build/host/hardware_core_tests && build/host/hardware_core_tests`
  - `make topdown_basic.gba`
  - `make verify-package`
- Smoke manual recomendado: abrir `topdown_basic.gba` no mGBA e confirmar boot, input, dialogo, camera, portal, musica e SFX sem travamento.

## Validacao Top-down App Contract v1

- Data: 2026-06-02.
- Status: host/GBA build aprovado no macOS.
- Cobertura: camera bounds, actor/NPC metadata ampliada, triggers enter/leave com run-once/cooldown e novos outputs de evento (`play_music`, `stop_music`, `close_dialogue`, `wait`, camera).
- Comandos:
  - `make test`
  - `make topdown_basic.gba`
  - `make verify-package`
- Smoke manual recomendado: abrir `topdown_basic.gba`, caminhar ate o trigger na room 1, confirmar dialogo do trigger, portal, NPC, musica/SFX e camera sem travamento.

## Validacao Actor Runtime v1

- Data: 2026-06-02.
- Status: host/GBA build aprovado no macOS.
- Cobertura: fila de comandos de ator no bytecode, `TopDownActorRuntime`, comandos de visibilidade/ativo/posicao/movimento/direcao/velocidade/animacao e `CallScript`.
- Comandos:
  - `make test`
  - `make topdown_basic.gba`
  - `make verify-package`
- Smoke manual recomendado: abrir `topdown_basic.gba`, interagir com o NPC da room 1 e confirmar que ele se move apos o evento, mantendo dialogo/SFX.

## Validacao Dialogue Choices v1

- Data: 2026-06-02.
- Status: host/GBA build aprovado no macOS.
- Cobertura: `DialogueChoice`, `show_dialogue_choices`, navegacao por input, confirmacao/cancelamento, `EventOp::ShowChoice` e `TopDownDialogueChoiceData`.
- Comandos:
  - `make test`
  - `make topdown_basic.gba`
  - `make verify-package`
- Smoke manual recomendado: abrir `topdown_basic.gba`, acionar a interacao da room 1, alternar a escolha com o D-pad e confirmar com A.
- Smoke extra v0.31: confirmar que cada opcao da escolha fecha a caixa e abre a resposta/script correspondente.

## Validacao Collision v2

- Data: 2026-06-02.
- Status: host/GBA build aprovado no macOS.
- Cobertura: flags solidas, bloqueios direcionais por movimento, e flags de efeito `water`/`damage`/`ladder` sem bloqueio automatico.
- Comandos:
  - `make test`
  - `make topdown_basic.gba`
  - `make verify-package`
- Smoke manual recomendado: abrir `topdown_basic.gba` e confirmar que movimento, colisao, portal, trigger, NPC e choices continuam funcionando.

## Validacao Stable Lookup v1

- Data: 2026-06-02.
- Status: host/GBA build aprovado no macOS.
- Cobertura: `TopDownRoomData::name`, `TopDownNamedScriptData`, lookup de room/NPC/script por nome e correcoes de contagem no `topdown_basic`.
- Comandos:
  - `make test`
  - `make topdown_basic.gba`
  - `make verify-package`

## Validacao Collision Slopes v1

- Data: 2026-06-02.
- Status: host/GBA build aprovado no macOS.
- Cobertura: `TileSlope`, `TileMap::slopes`, `tile_slope_at`, `tile_slope_blocks_pixel`, bloqueio por metade diagonal e compatibilidade com mapas antigos sem slope table.
- Comandos:
  - `make test`
  - `make topdown_basic.gba`
  - `make verify-package`
- Smoke manual recomendado: abrir `topdown_basic.gba` e confirmar que movimento, colisao solida/direcional, portal, trigger, NPC e choices continuam funcionando.

## Validacao Asset Pipeline Slopes v1

- Data: 2026-06-02.
- Status: host/package aprovado no macOS.
- Cobertura: `assetc --slope-color-indexes`, geracao de `TileSlope[]`, `TileMap` com ponteiro de slopes e compilacao do header gerado.
- Comandos:
  - `make assetc-test`
  - `make test`
  - `make verify-package`

## Validacao Asset Pack Diagnostics v1

- Data: 2026-06-02.
- Status: host/package aprovado no macOS.
- Cobertura: `assetc --pack-json` schema 6, `budget_summary`, `diagnostics[]`, warning `GBS_ASSET_PACK_BUDGET_NEAR_LIMIT` em 80% de uso e erro estruturado `GBS_ASSET_PACK_RESOURCE_OVERFLOW` em overflow.
- Comandos:
  - `make assetc-test`
  - `make test`
  - `make verify-package`

## Validacao Asset Pack Rebuild Plan v1

- Data: 2026-06-02.
- Status: host/package aprovado no macOS.
- Cobertura: `assetc --pack-json` schema 7 emite `rebuild_plan` com `generate`, `skip` e `remove`, derivado do relatorio anterior passado por `--previous-pack-report`.
- Comandos:
  - `make assetc-test`
  - `make test`
  - `make verify-package`

## Validacao Resource Batch Reservation v1

- Data: 2026-06-02.
- Status: host/package aprovado no macOS.
- Cobertura: `reserve_resource_batch` reserva tiles, paletas e OAM em lote, rejeita buffers pequenos e faz rollback quando uma reserva de asset falha.
- Comandos:
  - `make build/host/resource_manager_tests && build/host/resource_manager_tests`
  - `make test`
  - `make verify-package`

## Validacao Resource Batch Release v1

- Data: 2026-06-02.
- Status: host/package aprovado no macOS.
- Cobertura: `release_resource_batch` libera tiles BG/OBJ, paletas e OAM em lote, limpa a reserva apos sucesso e faz rollback se uma reserva stale impedir release completo.
- Comandos:
  - `make build/host/resource_manager_tests && build/host/resource_manager_tests`
  - `make test`
  - `make verify-package`

## Validacao Top-down Resource Batch v1

- Data: 2026-06-02.
- Status: package aprovado no macOS.
- Cobertura: `topdown_basic` usa `reserve_resource_batch` para validar tiles, paletas e OAM antes de carregar assets, preservando build da ROM e fixture externo.
- Comandos:
  - `make topdown_basic.gba`
  - `make test`
  - `make verify-package`

## Validacao Platformer Runtime v1

- Data: 2026-06-02.
- Status: host/package aprovado no macOS; slopes de chão, estado de animacao de ator, contato stomp/dano de inimigo, patrulha por tiles e landing snap em plataformas moveis adicionados ate v2.0.0.
- Cobertura: `gbs/platformer.hpp`, `platformer_tests`, helpers `platformer_slope_floor_y_at`/`snap_platformer_actor_to_slope_floor`/`platformer_actor_animation_state`/`resolve_platformer_enemy_contact`/`update_platformer_enemy_patrol`/`snap_platformer_actor_to_moving_platforms`, ROM `platformer_basic.gba` e build externo do template `platformer_basic` pelo Engine Pack.
- Comandos:
  - `make platformer_basic.gba`
  - `make test`
  - `make verify-package`

## Validacao Isometric Runtime v1

- Data: 2026-06-02.
- Status: host/package aprovado no macOS; cursor/seleção atualizado em v1.90.0, cursor inicial por room em v1.91.0, eventos por area de tile em v1.92.0, interação de ator pelo cursor em v1.93.0 e aplicação pública de comandos de ator em v1.94.0.
- Cobertura: `gbs/isometric.hpp`, `isometric_tests`, cursor por `IsoCursorState`, ponto inicial por `IsometricRoomData::cursor_start`, `find_iso_actor_at_cursor`, `iso_cursor_actor_interact_event_script_for`, `consume_iso_actor_event_commands`, `IsoTileEventData::width_tiles/height_tiles`, persistencia opcional da seleção em `IsometricSaveData`, ROM `isometric_basic.gba` e build externo do template `isometric_basic` pelo Engine Pack.
- Comandos:
  - `make isometric_basic.gba`
  - `make test`
  - `make verify-package`

## Validacao Resource/VRAM Banking v2

- Data: 2026-06-02.
- Status: host/package aprovado no macOS.
- Cobertura: `ResourceBank`, reserva fixa/automatica alinhada, relatorio de uso/fragmentacao, rollback de batch e release transacional de bancos.
- Comandos:
  - `make build/host/resource_manager_tests && build/host/resource_manager_tests`
  - `make test`
  - `make verify-package`

## Validacao Resource/VRAM Hot-swap v1

- Data: 2026-06-02.
- Status: host/package aprovado no macOS.
- Cobertura: `hot_swap_resource_banks`, troca transacional de bancos ativos, rollback quando o proximo banco falha e preservacao do banco ativo original.
- Comandos:
  - `make build/host/resource_manager_tests && build/host/resource_manager_tests`
  - `make test`
  - `make verify-package`

## Validacao Resource/VRAM Bank Cache v1

- Data: 2026-06-03.
- Status: host/package aprovado no macOS.
- Cobertura: `ResourceBankCache`, reserva cached, eviction por menor prioridade/uso mais antigo, bancos travados, rollback quando a reserva nao cabe e preservacao do estado do manager/cache.
- Comandos:
  - `make build/host/resource_manager_tests && build/host/resource_manager_tests`
  - `make test`
  - `make verify-package`

## Validacao Resource/VRAM VBlank Upload Queue v1

- Data: 2026-06-03.
- Status: host/package aprovado no macOS.
- Cobertura: `resource_bank_upload_transfer`, `enqueue_resource_bank_upload_vblank`, `enqueue_resource_bank_uploads_vblank`, `enqueue_resource_bank_upload_sources_vblank`, mapeamento de BG tiles/OBJ tiles/BG palette/OBJ palette/OAM para enderecos GBA, fontes nomeadas por banco e rejeicao de batch sem fontes suficientes.
- Comandos:
  - `make build/host/hardware_core_tests && build/host/hardware_core_tests`
  - `make test`
  - `make verify-package`

## Validacao Multi-genre Exported Resource Banks

- Data: 2026-06-03.
- Status: host/package aprovado no macOS.
- Cobertura: `topdown_project.backgrounds`, `topdown_project.resource_banks`, `platformer_project.resource_banks`, `isometric_project.resource_banks`, validacao de `TopDownProjectData`/`PlatformerProjectData`/`IsometricProjectData`, emissao de `ResourceBank` pelo `assetc --export-project-json` e templates reservando por `reserve_resource_banks` quando o plano existe.
- Comandos:
  - `make assetc-test topdown_basic.gba platformer_basic.gba isometric_basic.gba`
  - `make test`
  - `make verify-package`

## Validacao Asset Pipeline Production v1

- Data: 2026-06-02.
- Status: host/package aprovado no macOS.
- Cobertura: `assetc --pack-json` schema 8, `export_plan`, headers/simbolos, `assetc_args`, contagens `generate/skip/remove` e removidos incrementais.
- Comandos:
  - `make assetc-test`
  - `make test`
  - `make verify-package`

## Validacao Asset Pipeline Production v2

- Data: 2026-06-02.
- Status: host/package aprovado no macOS.
- Cobertura: `assetc --export-project-json`, copia de template, geracao de headers do `asset_pack`, `asset_pack_report.json`, `gbastudio_project.json` e build externo do projeto gerado pelo Engine Pack.
- Comandos:
  - `make assetc-test`
  - `make test`
  - `make verify-package`

## Validacao Tooling mGBA/Cross-platform v2

- Data: 2026-06-11.
- Status: check-only/package/evidencias parciais aprovados no macOS; Windows/Linux pendentes de ambiente real.
- Cobertura: `scripts/smoke_mgba.sh --check-only --all`, `scripts/smoke_mgba.sh --check-only --stress`, `scripts/smoke_mgba.sh --stress --manual-pass --write-readiness-evidence`, relatorios `build/smoke/mgba_smoke_report.md`, `build/smoke/mgba_stress_smoke_report.md`, evidencia parcial `build/smoke/readiness_evidence_mgba.json`, `tools/verify_cross_platform --hardware-ci-pass --write-readiness-evidence`, evidencia parcial `build/cross-platform-readiness-evidence.json` com `local_cross_platform_dry_run` quando gerada por `make verify-cross-platform-local`, `tools/production_smoke --engine-primary-rollout-pass --write-readiness-evidence`, evidencia parcial `build/production-smoke-readiness-evidence.json`, validacao por `gbsdoctor --validate-public-schema readiness_evidence`, `tools/verify_cross_platform` empacotado e relatorio JSON `build/cross-platform-report.json`.
- Comandos:
  - `make verify-mgba-check`
  - `make verify-mgba-stress-check`
  - `make verify-cross-platform-local`

## Validacao Engine SDK Multi-template v1.0

- Data: 2026-06-02.
- Status: host/package aprovado no macOS.
- Cobertura: `enginepack.json` com `sdk.templates`, `gbsdoctor --json` expondo `engine_manifest.sdk_templates`, templates top-down/platformer/isometric e build externo dos tres generos.
- Comandos:
  - `make gbsdoctor-test`
  - `make test`
  - `make verify-package`

## Validacao Platformer Advanced Runtime v1

- Data: 2026-06-03.
- Status: host/package aprovado no macOS.
- Cobertura: hazards, checkpoints/respawn, camera zones, `PlatformerRuntimeState`, ROM `platformer_basic.gba` e build externo do template.
- Comandos:
  - `make build/host/platformer_tests && build/host/platformer_tests`
  - `make platformer_basic.gba`
  - `make test`
  - `make verify-package`

## Validacao Isometric Advanced Runtime v1

- Data: 2026-06-03.
- Status: host/package aprovado no macOS.
- Cobertura: `IsoTileMap`, colisao por tile, actor blockers, picking por diamond mask, path step greedy, ROM `isometric_basic.gba` e build externo do template.
- Comandos:
  - `make build/host/isometric_tests && build/host/isometric_tests`
  - `make isometric_basic.gba`
  - `make test`
  - `make verify-package`

## Validacao Platformer/Isometric Project Data Contract v1

- Data: 2026-06-03.
- Status: host/GBA/package aprovado no macOS.
- Cobertura: `PlatformerProjectData`, `PlatformerRoomData`, `IsometricProjectData`, `IsometricRoomData`, helpers de conversao, ROMs `platformer_basic.gba`/`isometric_basic.gba`, fixtures exportados consumindo o objeto `project` e build externo usando `gbastudio_project.json.build.target`.
- Comandos:
  - `make build/host/project_data_tests build/host/platformer_tests build/host/isometric_tests`
  - `build/host/project_data_tests && build/host/platformer_tests && build/host/isometric_tests`
  - `make platformer_basic.gba isometric_basic.gba`
  - `make verify-package`

## Validacao Export Top-down Project Data Generator v1

- Data: 2026-06-03.
- Status: host/package aprovado no macOS.
- Cobertura: `assetc --export-project-json` com bloco `topdown_project`, geracao de `gbastudio_project_data.hpp`, metadata de room, NPCs, triggers, choice groups, scripts simples de room/portal/interacao/NPC/trigger/escolha, save config exportavel, referencias `includes`/`assets` para headers compilados, compile host do header gerado, `schemas/export_project.schema.json`, `gbsdoctor` validando schema empacotado e build externo do projeto gerado usando `build.target`.
- Comandos:
  - `make assetc-test`
  - `make gbsdoctor-test`
  - `make verify-package`

## Validacao Export Platformer Project Data Generator v1

- Data: 2026-06-03.
- Status: host/package aprovado no macOS.
- Cobertura: `assetc --export-project-json` com blocos `platformer_project` e `isometric_project`, geracao de `platformer_project_data.hpp`/`isometric_project_data.hpp`, rooms, colisao, player start/camera/grid, config fisica, hazards, checkpoints, camera zones, atores isometricos, scripts de sala/hazard/checkpoint/zona/ator, fixtures multi-room com `EventOp::Warp`, save config exportavel, referencias `includes`/`assets`/`resource_banks` para headers compilados e reservas planejadas, compile host do header gerado, schema `export_project.schema.json` e build externo do projeto gerado usando Engine Pack.
- Comandos:
  - `make assetc-test`
  - `make verify-package`

## Validacao Export Isometric Project Data Generator v1

- Data: 2026-06-03.
- Status: host/package aprovado no macOS.
- Cobertura: `assetc --export-project-json` com bloco `isometric_project`, geracao de `isometric_project_data.hpp`, rooms, grid 2:1, camera, collision flags, atores iniciais, scripts de ator com `EventOp::Warp`, fixture multi-room, referencias `includes`/`assets` para headers compilados, compile host do header gerado, schema `export_project.schema.json` e build externo do projeto gerado usando Engine Pack.
- Comandos:
  - `make assetc-test`
  - `make verify-package`

## Validacao Runtime Profile Export Adapters v1

- Data: 2026-06-08.
- Status: host aprovado no macOS.
- Cobertura: `assetc --export-project-json` com `point_click_project`, `shmup_project`, `visual_novel_project`, `menu_project`, `cutscene_project` e `world_map_project`, incluindo aliases de UI `pointAndClick`, `shootEmUp`, `visualNovel` e `worldMap`. Point-and-click gera `point_click_project_data.hpp` nativo com inventario, itens concedidos/exigidos por hotspot, transicao pos-dialogo, save de progresso e HUD de cena/item; Shoot-em-up gera `shmup_project_data.hpp` nativo com save de wave, score/high score, vidas, posicao, cooldowns, variaveis e HUD de score/vidas/wave; Visual Novel gera `visual_novel_project_data.hpp` nativo com choices condicionais, `on_select`, destino por escolha, historico simples, save de progresso e HUD de cena/historico; Menu/UI gera `menu_project_data.hpp` nativo com stack/condicoes/toggle/slider, save de progresso e HUD de tela/item/stack; Cutscene gera `cutscene_project_data.hpp` nativo com branch/skip/wait, save de progresso e HUD de cena/step/frame; World Map gera `world_map_project_data.hpp` nativo com nos condicionais/bloqueados/escondidos, save de progresso, HUD de status do no e `runtime_adapter.native = true`.
- Comandos:
  - `make assetc-test`
  - `make verify-production-smoke`

## Validacao Asset Pack Resource Bank Plan v1

- Data: 2026-06-03.
- Status: host/package aprovado no macOS.
- Cobertura: `assetc --pack-json` emitindo `resource_bank_plan`, `assetc --export-project-json` aceitando `resource_banks: "asset_pack"`, schema `export_project.schema.json`, geracao de `gbs::ResourceBank` a partir das alocacoes reais do pack e build externo via Engine Pack.
- Comandos:
  - `make assetc-test`
  - `make verify-package`

## Validacao Asset Pack Resource Bank Groups v1

- Data: 2026-06-03.
- Status: host/package aprovado no macOS.
- Cobertura: `asset_pack.assets[].bank_group`, `assetc --pack-json` emitindo `resource_bank_groups[]`, preservacao de `group` em `resource_bank_plan`, schema `asset_pack.schema.json` e export top-down usando `resource_banks: "asset_pack"`.
- Comandos:
  - `make assetc-test`
  - `make verify-package`

## Validacao Resource Bank Group Runtime v1

- Data: 2026-06-03.
- Status: host/package aprovado no macOS.
- Cobertura: `ResourceBankGroup`, `reserve_resource_bank_group`, `release_resource_bank_group`, `hot_swap_resource_bank_group`, preservacao de `group_name`, rollback quando um banco do grupo falha e troca transacional entre grupos de room.
- Comandos:
  - `make build/host/resource_manager_tests`
  - `build/host/resource_manager_tests`
  - `make test`
  - `make verify-package`

## Validacao Resource Bank Groups No ProjectData v1

- Data: 2026-06-03.
- Status: host/assetc/package aprovado no macOS.
- Cobertura: `TopDownProjectData.resource_bank_groups`, `PlatformerProjectData.resource_bank_groups`, `IsometricProjectData.resource_bank_groups`, helpers `resource_bank_group_from_*`, validacao de grupos, schema `export_project.schema.json` e `assetc --export-project-json` materializando grupos vindos de `asset_pack_report.resource_bank_groups[]`.
- Comandos:
  - `make build/host/project_data_tests`
  - `build/host/project_data_tests`
  - `make assetc-test`
  - `make test`
  - `make verify-package`

## Validacao Room Resource Bank Streaming v1

- Data: 2026-06-03.
- Status: host/GBA package aprovado no macOS.
- Cobertura: `stream_resource_bank_group`, reserva inicial, no-op para grupo ativo, hot-swap com scratch buffer, rollback em falha e templates top-down/platformer/isometrico streamando o grupo da room inicial, restore de save e troca de room.
- Comandos:
  - `make build/host/resource_manager_tests`
  - `build/host/resource_manager_tests`
  - `make topdown_basic.gba platformer_basic.gba isometric_basic.gba`
  - `make test`
  - `make verify-package`

## Validacao Resource Bank Named Upload Sources v1

- Data: 2026-06-03.
- Status: host/package aprovado no macOS.
- Cobertura: `ResourceBankUploadSource`, `resource_bank_upload_source_by_name`, `enqueue_resource_bank_upload_sources_vblank`, ordenacao por nome de banco e rejeicao sem upload parcial quando uma fonte esta ausente.
- Comandos:
  - `make build/host/hardware_core_tests && build/host/hardware_core_tests`
  - `make test`
  - `make verify-package`

## Validacao Assetc Resource Bank Upload Sources v1

- Data: 2026-06-03.
- Status: host/package aprovado no macOS.
- Cobertura: `assetc --export-project-json` gerando `resource_bank_upload_sources[]` a partir de `asset_pack`, com fontes para tiles e paleta dos projetos exportados top-down, platformer e isometrico.
- Comandos:
  - `make assetc-test`
  - `make test`
  - `make verify-package`

## Validacao Resource/VRAM Streaming v1.19

- Data: 2026-06-04.
- Status: host/GBA package aprovado no macOS.
- Cobertura: `stream_resource_bank_group_with_uploads`, streaming transacional de `ResourceBankGroup`, upload por `ResourceBankUploadSource[]` via fila DMA de VBlank, rejeicao sem mutacao quando falta fonte, rejeicao antes do hot-swap quando a fila DMA nao comporta o grupo e `ResourceStreamResult` com banco/pool/fragmentacao para overflow.
- Comandos:
  - `make build/host/resource_manager_tests`
  - `build/host/resource_manager_tests`
  - `make topdown_basic.gba platformer_basic.gba isometric_basic.gba`
  - `make test`
  - `make verify-package`

## Validacao Paridade Butano Stress v1.23

- Data: 2026-06-05.
- Status: package/check-only aprovado no macOS; smoke visual mGBA recomendado para cada ROM de stress.
- Cobertura: `docs/BUTANO_PARITY_MATRIX.md`, `tools/stress_projects --json`, stress projects `topdown_large`, `platformer_large`, `isometric_large`, `sprites_oam_heavy`, `tilesets_vram_heavy` e `audio_heavy`, relatorios `stress_profile`, `bank_usage_by_group`, `fragmentation_report`, `overflow_report`, `fallback_applied` e `gbsdoctor.diagnostics.stress_readiness`.
- Comandos:
  - `make assetc-test`
  - `make gbsdoctor-test`
  - `make verify-stress`
  - `dist/GBAStudioEnginePack/tools/stress_projects --engine-pack dist/GBAStudioEnginePack --json`

## Validacao Resource/VRAM Camera Prefetch v2.1

- Data: 2026-06-11.
- Status: host/package aprovado no macOS.
- Cobertura: `resource_bank_prefetch_priority_for_area`, `prefetch_resource_banks_for_camera`, prioridade por distancia da camera, reuso de bancos ja carregados, lock de entradas criticas e falha segura quando a prioridade nao permite eviction.
- Comandos:
  - `make build/host/resource_manager_tests`
  - `build/host/resource_manager_tests`
  - `make test`
  - `make verify-package`

## Validacao Resource/VRAM Camera Prefetch Upload v2.2

- Data: 2026-06-11.
- Status: host/package aprovado no macOS.
- Cobertura: `prefetch_resource_banks_for_camera_with_uploads`, validacao de `ResourceBankUploadSource`, precheck de capacidade da fila DMA de VBlank, upload apenas para bancos novos e falha sem mutacao quando fonte/fila nao permite prefetch.
- Comandos:
  - `make build/host/resource_manager_tests`
  - `build/host/resource_manager_tests`
  - `make test`
  - `make verify-package`

## Validacao Resource/VRAM Prefetch Budget v2.6

- Data: 2026-06-11.
- Status: host/package aprovado no macOS.
- Cobertura: `ResourceBankPrefetchPolicy`, helpers de permissao por orçamento, variantes `prefetch_resource_banks_for_camera_policy` e `prefetch_resource_banks_for_camera_with_uploads_policy`, limite de reservas novas por chamada, limite de uploads DMA por chamada e reuso de bancos ja carregados mesmo quando o orçamento de novos bancos acabou.
- Comandos:
  - `make build/host/resource_manager_tests`
  - `build/host/resource_manager_tests`
  - `make test`
  - `make verify-package`

## Validacao Template Resource/VRAM Prefetch Budget v2.7

- Data: 2026-06-11.
- Status: exemplos GBA e package aprovados no macOS.
- Cobertura: templates top-down, platformer e isometrico usam `prefetch_resource_banks_for_camera_with_uploads_policy` com limite padrao de dois bancos novos/uploads por chamada.
- Comandos:
  - `make topdown_basic.gba platformer_basic.gba isometric_basic.gba`
  - `make test`
  - `make verify-package`

## Validacao Resource/VRAM Cache Prune v2.8

- Data: 2026-06-11.
- Status: host/package aprovado no macOS.
- Cobertura: `ResourceBankCachePrunePolicy`, `prune_resource_bank_cache`, liberacao preventiva por idade/prioridade/pool, preservacao de entradas `locked` e rollback de cache/manager em falha.
- Comandos:
  - `make build/host/resource_manager_tests`
  - `build/host/resource_manager_tests`
  - `make test`
  - `make verify-package`

## Validacao Resource/VRAM Cache Prune Preview v2.9

- Data: 2026-06-11.
- Status: host/package aprovado no macOS.
- Cobertura: `ResourceBankCachePrunePreview`, `preview_resource_bank_cache_prune`, contagem de entradas ativas/travadas/podaveis e unidades liberaveis sem mutar cache/manager.
- Comandos:
  - `make build/host/resource_manager_tests`
  - `build/host/resource_manager_tests`
  - `make test`
  - `make verify-package`

## Validacao Resource/VRAM Fragmentation Usage v2.10

- Data: 2026-06-11.
- Status: host/package aprovado no macOS.
- Cobertura: `resource_pool_free_block_count` e `ResourcePoolUsage::free_block_count` para diagnostico de fragmentacao por pool.
- Comandos:
  - `make build/host/resource_manager_tests`
  - `build/host/resource_manager_tests`
  - `make test`
  - `make verify-package`

## Validacao Resource/VRAM Range Fit Preview v2.11

- Data: 2026-06-11.
- Status: host/package aprovado no macOS.
- Cobertura: `find_next_resource_range` encontra o proximo range alinhado sem mutar o pool e `reserve_next_resource_range` reutiliza a mesma regra.
- Comandos:
  - `make build/host/resource_manager_tests`
  - `build/host/resource_manager_tests`
  - `make test`
  - `make verify-package`

## Validacao Resource/VRAM Bank Reservation Preview v2.12

- Data: 2026-06-11.
- Status: host/package aprovado no macOS.
- Cobertura: `preview_resource_bank_reservation` para bancos fixos e automaticos sem mutar `EngineResourceManager`, e `reserve_resource_bank` reutilizando a mesma regra.
- Comandos:
  - `make build/host/resource_manager_tests`
  - `build/host/resource_manager_tests`
  - `make test`
  - `make verify-package`

## Validacao Resource/VRAM Bank Batch Preview v2.13

- Data: 2026-06-11.
- Status: host/package aprovado no macOS.
- Cobertura: `preview_resource_banks` para lotes transacionais de `ResourceBank`, detectando conflitos internos em probe local sem mutar o manager real.
- Comandos:
  - `make build/host/resource_manager_tests`
  - `build/host/resource_manager_tests`
  - `make test`
  - `make verify-package`

## Validacao Resource/VRAM Bank Group Preview v2.14

- Data: 2026-06-11.
- Status: host/package aprovado no macOS.
- Cobertura: `preview_resource_bank_group` para grupos nomeados de bancos sem mutar `EngineResourceManager`, preservando `group_name` no resultado e limpando a reserva em conflito.
- Comandos:
  - `make build/host/resource_manager_tests`
  - `build/host/resource_manager_tests`
  - `make test`
  - `make verify-package`

## Validacao Asset Pack Group Pressure Report v2.15

- Data: 2026-06-11.
- Status: `assetc-test`/package aprovado no macOS.
- Cobertura: `assetc --pack-json` schema 10 com `group_pressure_report`, `percent_of_pool` e `remaining_after_group` por grupo de bancos/room.
- Comandos:
  - `make assetc-test`
  - `make test`
  - `make verify-package`

## Validacao Runtime Extra Scene Resource Streaming v2.16

- Data: 2026-06-11.
- Status: package/production smoke aprovados no macOS.
- Cobertura: templates `exported_point_click` e `exported_visual_novel` inicializam `EngineResourceManager` e chamam `stream_resource_bank_group` por cena quando o projeto exportado define `resource_bank_groups`.
- Comandos:
  - `make package`
  - `make verify-package`
  - `make verify-stress`

## Validacao Production Smoke Build Gate v2.17

- Data: 2026-06-11.
- Status: production smoke/stress aprovados no macOS.
- Cobertura: `make verify-production-smoke` compila os projetos smoke multi-genero e `make verify-stress` exige `group_pressure_report` nos relatorios de stress.
- Comandos:
  - `make verify-production-smoke`
  - `make verify-stress`
  - `make verify-beta-readiness`

## Validacao Runtime Extra Resource Streaming v2.18

- Data: 2026-06-11.
- Status: production smoke/stress aprovados no macOS.
- Cobertura: templates `exported_menu`, `exported_cutscene` e `exported_world_map` inicializam `EngineResourceManager` e chamam `stream_resource_bank_group` por tela, cena ou no focado quando o projeto exportado define `resource_bank_groups`.
- Comandos:
  - `make verify-production-smoke`
  - `make verify-stress`
  - `make test`
## Validacao Asset Pack Production Contract v2.24

- Data: 2026-06-11.
- Status: contrato host aprovado.
- Cobertura: `assetc --pack-json` schema 11 com `production_summary`, `production_profile`, `ui_actions`, limites por genero/template, `asset_reports`, `pool_reports`, `room_pressure_report`, `template_pressure_report`, `split_recommendations`, `compression_candidates`, fallback opcional acionavel e `gbsdoctor.diagnostics.resource_pool_readiness`.
- Comandos:
  - `python3 tests/host/assetc_production_contract_tests.py`
  - `python3 tests/host/gbsdoctor_production_contract_tests.py`
