# Backlog priorizado — GBA Studio vs paridade funcional

Estado: 2026-07-22
Base: análise comparativa com [GB Studio](https://www.gbstudio.dev/docs/) e estado atual do repo + [Engine no monorepo](https://github.com/matmel0/GBA-Studio/tree/main/packages/GBAStudioEngine).

> Este documento preserva o histórico detalhado das entregas P0/P1/P2. O trabalho ativo depois da
> milestone dos runtimes mistos está em
> [`docs/development/roadmap-runtime-authoring.md`](../../../docs/development/roadmap-runtime-authoring.md).
> Itens marcados como concluídos abaixo não devem ser reabertos apenas porque a descrição histórica
> menciona uma limitação anterior.

> Nomenclatura atual (2026-09-09): o projeto completo Exemplo GBA é o projeto P0 canônico e a
> fonte de aceite global. Menções históricas a “projeto P0” nesta lista referem-se a esse projeto,
> salvo quando o texto identificar explicitamente a fixture técnica reduzida; assets e nomes citados
> em notas antigas não são instruções de promoção visual.

Leitura atual: o app Electron e o Engine Pack exportam 12 runtimes nativos e o dispatcher misto já
compila esses perfis na mesma ROM. O template canônico ainda exercita somente oito runtimes e mantém
quatro cenas de Menu; a próxima milestone consolida essas cenas, fecha autoria visual, procedures com
parâmetros, assets/UI, profundidade dos runtimes e stress local. Certificação, assinatura/notarização,
hardware físico e Windows/Linux permanecem fora desse ciclo por decisão de escopo.

**Legenda de prioridade**

| Tag | Significado |
|-----|-------------|
| `P0` | Bloqueador — impede produto mínimo jogável real na ROM |
| `P1` | Essencial — conteúdo completo para uso sério de criação |
| `P2` | Maduro — paridade de produto com GB Studio em UX/ferramentas |

**Legenda de esforço:** `S` (&lt;3d) · `M` (3–7d) · `L` (1–2 sem) · `XL` (&gt;2 sem)

---

## P0 — ROM jogável real

### GBA-001 · Asset pack de sprites: metasprite → OBJ na ROM
- **Área:** Sprites, Export Engine, GBAStudioEngine
- **Esforço:** XL
- **Depende de:** —
- **Problema:** Editor exporta `sprite_sheet` / `animation_name`; engine ignora e usa placeholder. Jogo exportado não mostra personagens reais.
- **Notas (2026-07-08):** smoke P0 verde; playtest mGBA confirma OBJ real + tilemap + dialogo/choice + warp `room_2`. Causa do walk falho no playtest: ROM gerada **antes** do commit que adicionou `walk_*` ao blank/P0 (artefato so tinha 4 idles → `animation_count < 6` e template fica so em idle). Contrato agora exige prefixo canônico idle+walk via `verifyTopdownWalk4DirsExportContract`; smoke P0 valida header com `player_walk_down_animation` e `animation_count >= 6`.
- **Critérios de aceite:**
  - [x] `assetc` gera metasprites/OBJ a partir de `animations[].frames[].tiles` — `frame_metasprites` + lookup de tiles no pack; teste host `assert_topdown_custom_metasprite_animation_export`
  - [x] Player e NPCs usam sprites reais na ROM (não tiles de debug) — path nativo P0
  - [x] Animação por `animation_name` + `frameIndex` visível no hardware — walk 4 dirs OK no playtest; UI/menu em BG0 separado do room (BG1)
  - [x] Teste smoke: projeto P0 com `player_topdown_4dir.png` renderizado no mGBA — playtest manual aprovado (OBJ real); pixel automatizado ainda parcial
  - [x] `spritesRuntimeExportSmoke.test.ts` valida contrato export → asset pack
  - [x] Contrato/smoke rejeitam export P0 idle-only (sem walk 4 dirs)

---

### GBA-002 · Tilemap BG real na ROM (substituir witness/debug)
- **Área:** Rooms, Export Engine, Rendering
- **Esforço:** L
- **Depende de:** GBA-001 (parcial — pode começar em paralelo para BG2)
- **Problema:** `main.cpp` exportado usa tiles coloridos simplificados + overlay de witness; não reflete tilemap do editor.
- **Notas (2026-07-08):** smoke P0 nativo prova `draw_room_to_bg0` + `visual_tilemap: tiles_overworld` e `runtimeWitnessVerified: false`. Teste unitário garante `visual_tiles` = tilemap do editor. `smoke:engine-rom-p0` verde (2026-07-08).
- **Critérios de aceite:**
  - [x] BG2 (e camadas configuradas) exibem tileset importado na ROM — BG do room P0 via assetc
  - [x] Tilemap do editor = tilemap visual na ROM (IDs alinhados via `visual_tilemap`)
  - [x] Remover ou tornar opcional overlay de debug em build release — path schema nativo sem witness
  - [x] Teste de paridade tile IDs room — unitário export `visual_tiles` espelha `tilemap` do editor
  - [x] Screenshot smoke ou playtest visual mGBA — `mgba_p0_boot_fixed.png`

---

### GBA-003 · Play unificado: Export + Build + Emulador em um clique
- **Área:** Shell, Engine actions, UX
- **Esforço:** M
- **Depende de:** GBA-002 (mínimo), GBA-001 (recomendado)
- **Problema:** GB Studio: Play = ROM. GBA Studio exige Export Engine → Build ROM → abrir mGBA manualmente.
- **Notas (2026-07-08):** botão Play + `CmdOrCtrl+B` (`project:play`) e fluxo export→build→emulador já wired em `useEngineActions` / `appMenu`.
- **Critérios de aceite:**
  - [x] Botão **Play** na topbar executa export incremental + `gbsbuild` + abre ROM no emulador configurado
  - [x] Feedback de progresso (exportando / compilando / abrindo)
  - [x] Falha de contrato bloqueia com mensagem clara (não gera ROM silenciosa)
  - [x] Atalho de teclado equivalente ao GB Studio (Cmd/Ctrl+B)

---

### GBA-004 · Fechar playtest observável mGBA (gate P0)
- **Área:** QA, Smoke, Documentação
- **Esforço:** S
- **Depende de:** GBA-003
- **Problema:** `smoke:engine-rom-p0` valida build; checklist manual `manual_mgba_playtest.md` não está fechado como gate de produto.
- **Notas (2026-07-08):** playtest manual aprovado — boot, tilemap, OBJ, `intro_001`+choices, warp `room_2`, sessao jogavel. Walk 4 dirs OK. Menu Start: UI movida para BG0 e room dinamica para BG1 (antes compartilhavam BG0 e corrompiam o mapa). `verify-manual` verde.
- **Critérios de aceite:**
  - [x] Checklist manual preenchido para projeto P0: boot, movimento, trigger, diálogo, choice, troca de room
  - [x] `npm run smoke:engine-rom-p0:verify-manual` passa no CI local
  - [x] `audit:functional-parity --strict` permanece verde após playtest
  - [x] Evidência em `artifacts/engine-rom-p0/latest/`

---

### GBA-005 · Compilador áudio tracker → motor (patterns/canais)
- **Área:** Áudio, Export Engine, GBAStudioEngine
- **Esforço:** XL
- **Depende de:** —
- **Problema:** Tracker completo no editor; export usa ops legados ou tabelas vazias para música composta. Só MOD/WAV importados funcionam via `assetc`.
- **Notas (2026-07-08):** `buildAssetcAudioPackGeneration` compila patterns/channels via `compileComposedMusicaToTracker` para tracker inline no `project_audio.json`; `resolveAudioPlayback` mapeia `play_music` → `run_audio_routine` quando o item tem tracker no pack (com ou sem arquivo `.mod` importado). Engine: `EventOp::RunAudioRoutine` → `play_tracker_music(project.tracker_assets[...])`. Falta playtest audível no hardware.
- **Critérios de aceite:**
  - [x] `audioItems[].patterns/channels/notes` compilam para formato consumido pela engine
  - [x] Música criada no editor (não importada) compila para tracker inline e `run_audio_routine` no contrato export
  - [x] `play_music` / `run_audio_routine` apontam para dados reais
  - [x] `audioRuntimeExportSmoke.test.ts` cobre tracker composto end-to-end
  - [x] Preview continua indicando quando áudio é “só lógico” vs “exportado” — badge `So logico` / `Exportado` no painel de export do compositor

---

### GBA-006 · Diálogo visual na ROM (caixa, texto, choices)
- **Área:** Diálogo, Export Engine, Engine UI
- **Esforço:** L
- **Depende de:** GBA-001 (fonte/UI assets)
- **Problema:** ROM tem `show_dialogue` / `show_choice` com linhas de texto; sem caixa, portrait, typewriter, textSound.
- **Notas (2026-07-08):** export `dialogue_lines` envia `{ text, speaker, portrait, key, emote?, text_sound?, confirm_sound?, confirm_sfx?, confirm_pcm? }`; `show_dialogue`/`show_choice` prependem `set_text_sfx` quando a linha tem `textSound`; boot da room inicial injeta `set_dialogue_text_speed` / `set_text_sfx` / `set_dialogue_frame`; contrato inclui `dialogue_ui` com assets/metadata. Engine: `draw_dialogue` posiciona a caixa por `frame_index`; choices navegaveis via `show_dialogue_choices`; `assetc` emite `DialogueUiConfig` e `dialogue_portrait_assets[]` / `dialogue_emote_assets[]`; runtime aplica via `configure_dialogue_ui` + `configure_dialogue_portraits` + `configure_dialogue_emotes`. Confirm SFX por linha ligado no template topdown. ROM P0 builda com portrait; falta `verify-manual` com checklist preenchido.
- **Critérios de aceite:**
  - [x] Caixa de diálogo renderizada (settings `uiDialogs` ou default)
  - [x] Texto visível com wrap configurável (ex. 26×3) — `dialogue_ui.wrap_columns` / `wrap_lines` no export + assetc
  - [x] `show_choice` exibe opções selecionáveis no hardware
  - [x] Portrait opcional quando `portrait` asset existe — `portrait_assets` no export + asset pack OBJ 16×16 + `configure_dialogue_portraits` / `draw_active_dialogue_portrait` na ROM
  - [x] Nome do personagem visível quando `show_character_name` — `format_dialogue_display_text` prefixa `speaker:` na caixa
  - [x] `show_dialogue_speaker` compila para `show_dialogue` no export
  - [x] Teste export — `functionalP0Flow` + contrato: `show_dialogue`, `choice_groups`, `dialogue_ui.wrap_columns`, `portrait_assets`
  - [x] Playtest manual documentado — GBA-004 aprovado (dialogo + choices na ROM)

---

### GBA-007 · Expandir comandos exportáveis — lote 1 (movimento e câmera)
- **Área:** Eventos, Export Engine, Preview parity
- **Esforço:** L
- **Depende de:** GBA-001
- **Problema:** Apenas 14 verbos são `OK ROM`; ~70+ rodam só no preview JS.
- **Notas (2026-07-08):** lote 1 cobre fade/câmera + `move_actor`/`set_actor_position`/visibilidade/`wait`/`stop_music`. Índice NPC = slot na room do ator (exclui player).
- **Comandos alvo (lote 1):**
  - `move_actor` / `move_actor_relative` / `set_actor_position`
  - `camera_follow_player` / `camera_move` / `camera_set_bounds`
  - `fade_in` / `fade_out`
- **Critérios de aceite:**
  - [x] Cada comando compila para opcode/script engine documentado — lote 1 completo (ator usa índice NPC da room)
  - [x] Badge no editor atualizado para `OK ROM` — fade, câmera, ator (move/position/visible), wait, stop_music
  - [x] Teste unitário export por comando
  - [x] `auditPreviewRomParity` mapeia fade/câmera/ator/wait para ops export

---

### GBA-008 · Expandir comandos exportáveis — lote 2 (save, ator, HUD)
- **Área:** Eventos, Export Engine
- **Esforço:** L
- **Depende de:** GBA-007
- **Comandos alvo (lote 2):**
  - `save_game` / `load_game`
  - `set_actor_animation` / `set_actor_visible` / `set_actor_active`
  - `show_stat_bar` / `show_number_hud` (subset HUD)
- **Notas (2026-07-08):** lote 4 cobre `random_variable`, `lock_script`/`unlock_script`, `overlay_line`, `set_dialogue_text_speed`, `set_dialogue_frame`, `set_text_sfx`, `set_actor_animation_frame`, `play_actor_animation`. ~50+ verbos OK ROM. Reboot simulado no preview: `rebootPreviewRuntimePreservingSaves` preserva `saveSlots` e `load_game` restaura inventário/variáveis.
- **Critérios de aceite:**
  - [x] Save persiste variáveis/inventário em SRAM conforme `settings.save` — export `save` block + ops `save_game`/`load_game`
  - [x] Load restaura estado após reboot simulado — preview `rebootPreviewRuntimePreservingSaves` + `load_game`; engine `save_tests.cpp` roundtrip SRAM; playtest hardware opcional (GBA-020)
  - [x] Animação de ator muda sprite frame na ROM — export/host cobrem `set_actor_animation` + `set_actor_animation_frame`; evidência visual pixel mGBA ainda parcial
  - [x] ≥30 verbos marcados `OK ROM` (meta intermediária) — ~50 com lotes 1–4

---

### GBA-009 · Paridade preview ↔ ROM: comando a comando
- **Área:** Preview, Export, Documentação
- **Esforço:** M
- **Depende de:** GBA-007, GBA-008 (contínuo)
- **Problema:** Usuário testa no preview um jogo diferente do exportado.
- **Notas (2026-07-08):** steps com verbos só-preview ganham aviso `nao compila para a ROM`; condicoes preview-only (`if_variable_variable`, `if_button`, `if_actor_*`) geram aviso dedicado; `previewRomParity` mapeia lotes 1–4 + condicionais (`stop_event`, `switch_variable`, `repeat_expression` como OK ROM); matriz em `previewCommandParityMatrix.ts`; tilemap invalido bloqueia export via `prepareEngineProjectExport`.
- **Critérios de aceite:**
  - [x] Matriz publicada: verbo → {preview, export, engine opcode} — `previewCommandParityMatrix.ts`
  - [x] Comandos `preview-runtime` exibem aviso forte ao exportar — via `missingReferences` no workspace Eventos
  - [x] `auditPreviewRomParity` falha se comando P0 do boot não tiver op equivalente — dimensão `boot-commands`
  - [x] Export bloqueia (ou warn configurável) comandos não suportados na ROM — `export_warnings` + bloqueio tilemap; condicoes preview-only com aviso dedicado

---

### GBA-010 · Triggers On Leave na exportação
- **Área:** Rooms, Export Engine
- **Esforço:** S
- **Depende de:** —
- **Problema:** GB Studio tem On Enter + On Leave; export top-down só envia `on_enter`.
- **Critérios de aceite:**
  - [x] Modelo `.gba-project` aceita `onLeave` / binding equivalente
  - [x] Export gera script `on_leave` no trigger
  - [x] Engine executa ao sair da área — `update_trigger_state` + `trigger_event_script_for_result` com `on_leave`; teste host
  - [x] Teste unitário export + smoke room

---

## P1 — Conteúdo completo

### GBA-011 · Platformer export nativo (não adapter topdown)
- **Área:** Scene types, Export Engine
- **Esforço:** L
- **Depende de:** GBA-001, GBA-007
- **Problema:** `platformer_project` existe na engine; no app, cenas platformer usam `topdown_adapter` para ROM mista.
- **Notas (2026-07-08):** rooms platformer exportam `triggers`, `npcs` e `portals` (`scenaConnections`) com areas em pixels 16×16, alinhado ao contrato topdown.
- **Critérios de aceite:**
  - [x] Cena `sceneType: platformer` gera `platformer_project` dedicado
  - [x] Física/gravidade de `settings.platformer` refletida na ROM
  - [x] Playtest platformer em projeto demo — fixture `buildFunctionalPlatformerProject` + teste de contrato export
  - [x] Badge runtime no editor: `native` vs `adapter`

---

### GBA-012 · Settings de gameplay refletidos na ROM
- **Área:** Settings, Export Engine
- **Esforço:** M
- **Depende de:** GBA-011 (platformer), GBA-007 (topdown)
- **Problema:** 19 seções em Settings; maioria só persiste JSON.
- **Notas (2026-07-08):** `settings.topdown.walkSpeed` → `player.speed`, `gridSize` → `player.size`/NPC size, `settings.save` → bloco SRAM, `settings.uiDialogs` → boot ops na room inicial + metadata `dialogue_ui`. `interactButton` exportado em `player.interact_button` (topdown) e `platformer_project.interact_button`; `jumpButton`/`runButton` em `platformer_project.jump_button`/`run_button`.
- **Critérios de aceite:**
  - [x] `settings.topdown` (grid 8/16, speed, interact) → export — `walkSpeed` + `gridSize` + `interact_button`; NPC `on_interact` usa `eventBindings.onInteract`
  - [x] `settings.platformer` (gravity, jump, coyote) → export
  - [x] `settings.save` (slots, autoSave) → export SRAM block
  - [x] `settings.preview` não confunde usuário (separar preview-only vs export) — seções marcadas com escopo `So preview` / `Export ROM`
  - [x] Teste: alterar speed no settings muda velocidade na ROM — unitário de export (`walkSpeed` → `player.speed`) + preview; playtest hardware opcional

---

### GBA-013 · Pipeline assets com validação hardware GBA
- **Área:** Arquivos, Sprites, Rooms, Export
- **Esforço:** L
- **Depende de:** GBA-001, GBA-002
- **Problema:** Import funciona; falta validação VRAM, paleta, tile budget, formato OBJ.
- **Notas (2026-07-08):** `auditProjectSpriteVramWarnings` + `auditProjectTilemapWarnings` + `auditProjectEventReferenceWarnings` injetam avisos em `export_warnings`; sprites 8bpp OBJ geram aviso de paleta/VRAM dedicado. `highVRAMUsage` (>32 KB) agora bloqueia `prepareEngineProjectExport`. Fonte custom em `uiDialogs.font` gera aviso dedicado (`auditProjectDialogueUiFontWarnings`) — metadata exporta, `assetc`/engine ainda ignoram o PNG.
- **Critérios de aceite:**
  - [x] Diagnóstico por asset: dimensão, paleta, tiles únicos, VRAM estimada — `analyzeSpriteVram` no workspace Sprites + audit no export
  - [x] Export bloqueia ou avisa quando limites GBA excedidos — tilemap inválido, sprite >8 tiles horizontais e VRAM >32 KB bloqueiam export; avisos leves em `export_warnings`
  - [x] Tileset → BG e Sprite → OBJ sem placeholders — path P0 nativo: `emit_animation_fallback: false` + asset_pack bg/obj reais no contrato visual
  - [ ] Fontes custom → diálogo ROM (liga com GBA-006) — metadata + `export_warnings`; render na ROM ainda bloqueado na engine

---

### GBA-014 · Scene type isometric — export dedicado
- **Área:** Scene types, Engine
- **Esforço:** XL
- **Depende de:** GBA-011
- **Problema:** Opção na UI; engine tem `isometric_project`; sem ligação no exportador Electron.
- **Notas (2026-07-08):** export nativo `kind: isometric` + `isometric_project` + template `exported_isometric`; tileset padrão `fixtures/Assets/tiles/isometric-sandbox-sheet.png`; template Welcome `isometric-demo`; preview `exportStatus: native`. ROM hardware/playtest visual ainda parcial.
- **Critérios de aceite:**
  - [x] Export gera `isometric_project_data.hpp` — contrato `project_data` + assetc template `exported_isometric`
  - [x] Room isometric jogável em demo mínima — fixture `buildFunctionalIsometricProject` + template `isometric-demo` (contrato/export); playtest ROM hardware opcional
  - [x] Preview marca perfil `isometric` (não topdown_adapter) — `resolveSceneRuntimeExport` nativo

---

### GBA-015 · Scene types shmup + point-and-click — export dedicado
- **Área:** Scene types, Engine
- **Esforço:** XL cada (sub-issues recomendadas)
- **Depende de:** GBA-014 ou paralelo
- **Notas (2026-07-08):** export nativo para todos os templates engine: `point_click` / `shmup` / `visual_novel` / `menu` / `cutscene` / `world_map` (+ topdown/platformer/isometric). Fixtures + Welcome demos; preview `exportStatus: native`. Smoke ROM hardware ainda parcial. `battleRpg`/`custom` seguem no adapter topdown.
- **Critérios de aceite (cada tipo):**
  - [x] Export nativo para template engine correspondente — contrato + assetc templates + testes unitários
  - [x] Controles específicos (cursor P&C, scroll shmup) — settings → contrato; playtest hardware opcional
  - [x] Projeto demo + smoke ROM — demos/templates + testes de contrato; smoke ROM hardware parcial

---

### GBA-016 · On Update actor (loop por frame)
- **Área:** Eventos, Actors, Engine
- **Esforço:** M
- **Depende de:** GBA-007
- **Problema:** GB Studio: script On Update por ator; GBA Studio só `eventName` on interact.
- **Notas (2026-07-08):** binding `onUpdate` no modelo + preview dispara a cada 1s via `tickPreviewRuntime`; export ROM compila `on_update` em NPCs; template topdown habilita `actor_update_script_enabled` e chama `queue_actor_update_scripts()` no loop; host `assert_topdown_template_queues_npc_on_update_scripts` + assetc emite `on_update` no header.
- **Critérios de aceite:**
  - [x] Binding `onUpdate` no modelo de ator
  - [x] Export compila script por frame/tick engine — `on_update` no contrato + assetc + queue no template topdown
  - [x] Preview alinhado (não só timer simulado) — `tickPreviewRuntime` + `eventBindings.onUpdate`

---

### GBA-017 · Condicionais completas (if/else, loops)
- **Área:** Eventos, Export
- **Esforço:** L
- **Depende de:** GBA-007
- **Problema:** `if_*` compila jump; falta else encadeado, `for`/`while`, `switch`.
- **Notas (2026-07-08):** guards `if_*` compilam para pares `jump_if_*` + `jump`; blocos `if/else` geram ramo verdadeiro + `jump` de saida + ramo falso; `switch_variable` expande para cadeia `jump_if_*` + `call_script`; `repeat_expression` desenrola iteracoes com guarda + `call_script` (incl. operador `ne`); `stop_event` compila como `jump` sobre passos restantes; preview alinhado.
- **Critérios de aceite:**
  - [x] Editor suporta blocos else sem hack de `call_event` — comando `else` na biblioteca + fluxo no workspace
  - [x] Export gera bytecode/script com branches aninhados — guards simples e if/else com offsets relativos
  - [x] Testes: fluxo if/else/loop em projeto fixture — `guarded_flow` + `branch_else`

---

### GBA-018 · Export Web com ROM sempre real (eliminar placeholder)
- **Área:** Export Web
- **Esforço:** S
- **Depende de:** GBA-003
- **Problema:** Path A gera `roms/README.md` stub se não houver build prévio.
- **Notas (2026-07-08):** `resolveWebExportRomSource` auto-descobre ROM; `writeWebProjectExport` tenta build via `buildProjectRomArtifact` quando gbsbuild disponivel; default `requireRom: true` (placeholder só com `requireRom: false`); `manifest.json` inclui `romResolved`/`packageComplete`; `.itch.toml` gerado para upload HTML no itch.io. `gbsbuild` e staging do Electron copiam Engine Pack para paths sem espacos (monorepo `GBA Studio`).
- **Critérios de aceite:**
  - [x] Export Web dispara build ROM ou exige ROM existente — auto-descoberta + build opcional; default exige ROM
  - [x] Pacote itch.io sempre contém `.gba` jogável — fluxo real falha sem ROM; `packageComplete: true` só com `.gba` copiado
  - [x] `exportWebProject.test.ts` atualizado — default fail-fast + opt-in placeholder + `packageComplete`

---

### GBA-019 · Diálogo: typewriter, textSound, emote na ROM
- **Área:** Diálogo
- **Esforço:** M
- **Depende de:** GBA-006
- **Notas (2026-07-08):** export compila `set_dialogue_text_speed`, `set_dialogue_frame`, `set_text_sfx`; boot da room inicial aplica `uiDialogs`; linhas exportam `text_sound`/`confirm_sound`; preview simula save/load SRAM por slot.
- **Critérios de aceite:**
  - [x] `textSpeed` controla revelação de caracteres — `update_dialogue` + `set_dialogue_text_speed` na engine; boot/export aplicam metadata
  - [x] `textSound` / `confirmSound` disparam SFX — metadata por linha + `set_text_sfx` antes de `show_dialogue` quando `textSound` configurado; `assetc` emite `text_sound`/`confirm_sound`/`confirm_sfx`/`confirm_pcm` e o template topdown toca SFX/PCM ao confirmar o diálogo
  - [x] Emote 16×16 acima do ator quando configurado — `emote_assets` no export + OBJ no slot 123 acima do ator em diálogo

---

### GBA-020 · Inventário e wallet — persistência SRAM
- **Área:** Eventos, Save
- **Esforço:** M
- **Depende de:** GBA-008
- **Problema:** Preview simula; export P0 tem ops mas save/load não fechados.
- **Notas (2026-07-08):** preview runtime persiste `saveSlots` com variáveis/inventário/wallet/flags/equippedItems; `save_game`/`load_game`/`remove_save_game` e `if_save_game` por slot com testes de preview (corrigido parsing de slot em comandos multi-token); export SRAM block + ops já no contrato.
- **Critérios de aceite:**
  - [x] `add_item`, `has_item`, `modify_wallet` persistem após save/load — preview por slot SRAM simulado
  - [x] Slots configuráveis em `settings.save` — export `save.slot_count` + slot em `save_game N`
  - [ ] Playtest: comprar item → save → reload → estado mantido — hardware pendente

---

## P2 — Produto maduro

### GBA-021 · Debugger GBA (VRAM, breakpoints, variáveis live)
- **Área:** Debug, Play
- **Esforço:** XL
- **Depende de:** GBA-003
- **Critérios de aceite:**
  - [x] Painel VRAM OBJ/BG durante play
  - [x] Breakpoint em evento/script
  - [x] Edição live de variáveis
  - [x] Step por instrução de script exportado

---

### GBA-022 · Run From Here (preview de room isolada)
- **Área:** Preview, Rooms
- **Esforço:** M
- **Depende de:** GBA-003
- **Notas (2026-07-08):** `bootPreviewRuntimeAtRoom` + botão "Preview desta cena" no inspector de Rooms; `startRoomName` no payload do Preview Runtime.
- **Critérios de aceite:**
  - [x] Botão na room exporta/boota só aquela cena — preview isolado por room
  - [x] Player posicionado no `player_start` da room — `playerForRoom` na room alvo

---

### GBA-023 · Templates de projeto (Blank, Topdown demo, Platformer demo)
- **Área:** Shell, newProject
- **Esforço:** M
- **Depende de:** GBA-004
- **Notas (2026-07-08):** Welcome Screen com galeria `blank` / `topdown-demo` / `platformer-demo` / `isometric-demo` / `point-click-demo` / `shmup-demo` / `visual-novel-demo` / `menu-demo` / `cutscene-demo` / `world-map-demo` via `projectTemplates.ts`. Topdown-demo usa tileset sandbox real (`tiles_topdown_sandbox.png` + mapa stage_1 do projeto Butano de referencia).
- **Critérios de aceite:**
  - [x] Galeria na Welcome Screen
  - [x] Cada template passa export + playtest mínimo — testes de contrato export para demos funcionais

---

### GBA-024 · Integração Tiled (.tmx / .json)
- **Área:** Rooms, Import
- **Esforço:** L
- **Depende de:** GBA-002
- **Notas (2026-07-08):** parser/import JSON + TMX (CSV/base64; gzip/zlib via `expandCompressedTiledMapText` no main) em `tiledImport.ts`/`tiledMapCompression.ts`; IPC `assets:import-tiled-map` + botão Rooms; cria room ou reimporta preservando actors/triggers; tileset PNG adjacente copiado para assets. Tilesets externos `.tsx` ainda pendentes.
- **Critérios de aceite:**
  - [x] Importar mapa Tiled → `tilemap` + layers — JSON tilelayer → `tilemap` flat + testes
  - [x] Atualizar reimport sem perder actors/triggers — `targetRoomId` preserva entidades
  - [x] UI Rooms para escolher `.json`/`.tmx` e aplicar import — botão "Tiled" no inspector de paint + IPC
  - [x] Parser `.tmx` XML — CSV, base64 e gzip/zlib; `.tsx` externos ainda fora

---

### GBA-025 · Custom scripts / procedures reutilizáveis
- **Área:** Eventos
- **Esforço:** L
- **Depende de:** GBA-017
- **Notas (2026-07-08):** `call_event` já compila para `call_script` por índice (sem args). Engine `CallScript` só recebe índice de script — parâmetros/args bloqueados até evolução do opcode. Fase 1 sem args seria só alias de eventos; não fecha os critérios. CRUD de `variables`/`constants` no editor de Eventos (`variablesWorkspace.ts`) desbloqueia cadastro para comandos existentes.
- **Critérios de aceite:**
  - [ ] Recurso `script` com parâmetros
  - [ ] `call_script` com argumentos no export

---

### GBA-026 · Plugins (engine + eventos + assets)
- **Área:** Arquitetura
- **Esforço:** XL
- **Depende de:** GBA-009, estabilidade P0
- **Notas (2026-07-08):** MVP Electron: varredura `plugins/**/plugin.json`, `recipePack` + `eventCommandPack` no palette, export handler declarativo (`export.op`/`opcode` + tokens), IPC `plugins:load`/`plugins:install`, menu `Projeto > Instalar plugin...`. Extensao: catalogo remoto (`plugins:fetch-repository`/`plugins:install-from-catalog`), `assetPack`/`dataTablePack` executaveis, preview runtime com rewrite de verbos + `data_table_lookup`, `plugin_data_tables` no contrato de export.
- **Critérios de aceite:**
  - [x] Pasta `plugins/` carregada no startup
  - [x] Plugin de evento registra verbo na biblioteca + export handler
  - [x] Documentação de API mínima
  - [x] Catálogo remoto (`repository.json`) com instalação por download
  - [x] `assetPack` copia assets para `Assets/` na instalação
  - [x] `dataTablePack` carrega tabelas + export declarativo `plugin_data_tables`
  - [x] Preview runtime executa verbos customizados via rewrite/`data_table_lookup`

---

### GBA-027 · Split project / recursos `.gbares` (Git-friendly)
- **Área:** Persistência, project-contract
- **Esforço:** XL
- **Depende de:** —
- **Critérios de aceite:**
  - [ ] Opção exportar/importar projeto monolítico ou multi-arquivo
  - [ ] Diff por recurso (room, sprite, event) em Git
  - [ ] Sem quebrar `.gba-project` atual (opt-in)

---

### GBA-028 · Windows + Linux — validação e empacotamento
- **Área:** Distribuição, CI
- **Esforço:** L
- **Depende de:** macOS Electron pronto para finalizacao/distribuicao
- **Notas (2026-07-09):** job `electron-desktop` empacota macOS/Windows/Linux + `smoke:ci-artifacts`; `audit:cross-platform --strict` no CI. Associação `.gba-project` declarada + handler macOS; smoke Win/Linux de associação e fluxo P0 por plataforma seguem pendentes por decisao de roadmap. Nao puxar este item antes de fechar o app Electron macOS.
- **Critérios de aceite:**
  - [x] CI gera artefato Win/Linux — matriz `electron-desktop` + upload-artifact + validação de artefatos
  - [ ] Abrir `.gba-project` por associação de arquivo — config + open-file macOS; smoke Win/Linux pendente
  - [ ] Fluxo P0 executado em cada plataforma

---

### GBA-029 · macOS: assinatura, notarização, instalador
- **Área:** Distribuição
- **Esforço:** M
- **Depende de:** GBA-004
- **Critérios de aceite:**
  - [ ] `.app` assinado passa Gatekeeper
  - [ ] DMG ou PKG para distribuição pública
  - [x] `audit-macos-signing-readiness` verde — `npm run audit:macos-signing` → ready (entitlements + hardenedRuntime); Gatekeeper/notarização continuam externos

---

### GBA-030 · Dialogue Review (view centralizada de todo texto)
- **Área:** Diálogo, UX
- **Esforço:** M
- **Depende de:** —
- **Notas (2026-07-08):** workspace de diálogos com busca + filtro `character` (select/chip) e link para evento.
- **Critérios de aceite:**
  - [x] Lista todas as falas/choices do projeto
  - [x] Busca, filtro por personagem, link para evento

---

### GBA-031 · Remover ou implementar backend Butano legado
- **Área:** Settings, Export
- **Esforço:** S
- **Depende de:** —
- **Problema:** Campo `butano` em settings sem export; confunde usuário.
- **Notas (2026-07-08):** campos `butanoPath` e `exportReadableButanoProject` removidos da UI de Settings; backend ativo permanece `gbastudio_engine`.
- **Critérios de aceite:**
  - [x] Remover da UI **ou** implementar export mínimo documentado como experimental

---

### GBA-032 · Testes de renderer React (smoke de componentes críticos)
- **Área:** QA
- **Esforço:** M
- **Depende de:** —
- **Notas (2026-07-08):** bootstrap `@testing-library/react` + `happy-dom` no Vitest; smokes `eventsWorkspace`, `roomsWorkspace` (Nova room) e `PreviewRuntimeWorkspace` (Botao A).
- **Critérios de aceite:**
  - [x] Vitest + Testing Library para roomsWorkspace, eventsWorkspace, PreviewRuntime
  - [x] Cobertura de fluxos: criar room, adicionar passo de evento, acionar preview (Botao A)

---

## Ordem de execução recomendada

Leitura de 2026-07-09: as sprints P0 abaixo viraram historico de execucao. O caminho ativo agora e `Release macOS -> stress real-base -> polish/P1/P2 -> Windows/Linux`.

```
Sprint 1 (fundação ROM)
  GBA-001 ∥ GBA-002 ∥ GBA-005 (paralelo, times diferentes)
  GBA-010

Sprint 2 (jogável)
  GBA-003 → GBA-004
  GBA-006
  GBA-007

Sprint 3 (profundidade)
  GBA-008 → GBA-009
  GBA-020
  GBA-012

Sprint 4+ (expansão)
  GBA-011 → GBA-013 → GBA-014/015
  P2 conforme capacidade

Finalização cross-platform
  GBA-029 → stress macOS final → GBA-028
```

---

## Métricas de progresso (dashboard)

| Métrica | Atual (est.) | Meta P0 | Meta 100% |
|---------|--------------|---------|-----------|
| Verbos `OK ROM` | ~50 | 30 | ≥80 |
| Scene types com export nativo | 9 | 2 estáveis | 6+ |
| Dimensões `auditPreviewRomParity` OK | ~8 | 12 | 15+ |
| Playtest manual P0 | Fechado | Fechado | Automatizado parcial |
| Sprites reais na ROM | Sim | Sim | Sim + animação |
| Animação walk/idle no P0 | Contrato+header OK; playtest mGBA aprovado (walk 4 dirs) | Sim | Sim + playtest visual |
| Música tracker na ROM | Sim | Sim | Sim |
| Web packageComplete exige `.gba` | Sim | Sim | Sim |
| Play = 1 clique | Sim (UI) | Sim | Sim + debugger |
| Save/load reboot simulado (preview) | Sim | Sim | + hardware |
| macOS signing readiness audit | Verde | Verde | + notarização |
| Release macOS assinado/notarizado | Pendente | Pendente | Verde |
| Windows/Linux real | Adiado | Fora do P0 macOS | Verde na finalização |

---

## Issues fora de escopo (não criar)

- Super Game Boy, Link Cable GB, GB Printer, RTC DMG
- Export Analogue Pocket
- Compatibilidade com `.gbsproj` do GB Studio
- Migração automática de projetos GB Studio → GBA Studio

---

## Como usar este backlog

1. Criar issue no GitHub com ID `GBA-NNN` e copiar título + critérios.
2. Labels sugeridas: `P0`/`P1`/`P2`, `area/sprites`, `area/export`, `area/preview`, `area/audio`, `area/events`.
3. Antes de fechar issue P0: `npm test`, `npm run typecheck`, smoke relevante, playtest se aplicável.
4. Atualizar métricas neste arquivo ao fechar cada milestone.
