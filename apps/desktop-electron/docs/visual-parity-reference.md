# Visual reference history

Reference screenshots supplied on 2026-07-01 around 20:16 from the former Swift/macOS app. Use this file as historical context only. The Electron design system in `src/renderer/styles/base.css` and `src/renderer/styles/typography.css` is the current visual source of truth.

The local side-by-side review source is `apps/desktop-electron/docs/visual-reference-sources.json`. `npm run review:visual` reads that manifest, renders any historical screenshots still available on disk next to the Electron screenshots, and records missing old references in `artifacts/visual-review/latest/visual_review_manifest.json`. Historical screenshots can explain intent, but they should not override current Electron tokens, typography, density, or component behavior.

## Global shell

- Light desktop shell with a slim macOS title area and a persistent top toolbar.
- Brand on the left, project dirty/saved status next to project name, centered workspace switcher, and run/export/language/menu actions on the right.
- Workspace switcher uses compact pill tabs with icons: Editor, Eventos, Sprites, Dialogos, Audio, Arquivos, Ajustes.
- Electron now opens directly on `Editor`, uses the visible topbar order `Editor`, `Eventos`, `Sprites`, `Dialogos`, `Audio`, `Arquivos`, `Ajustes`, and renders real Lucide workspace icons instead of shortcut-letter placeholders.
- Electron now uses a single compact project toolbar instead of a second document bar, keeping project name/status and `Gerar ROM`, `Abrir`, `Salvar`, `Salvar como` actions in the same shell row.
- Electron now exposes the project action menu captured in `02g-project-menu.png` with `Criar backup`, `Exportar ROM - GBAStudio Engine`, `Exportar Web / itch.io` and `Fechar projeto`; backup and close are functional, ROM delegates to the current Engine Pack build flow, and Web export remains disabled until that target is migrated.
- Purple is the primary action/selection color; most surfaces are pale gray or white with subtle borders.
- Prefer dense operational panels over large dark cards.

## Welcome

- Two-column first screen: left setup rail and large empty/template area on the right.
- Left rail includes logo, language selector, continue card, create-project form, primary new-project button, open-project button, credits and recent projects.
- Template area is sparse, with small template cards and helper copy anchored near the bottom.
- Electron now renders this state when no project is open; `npm run smoke:visual:responsive` verifies the welcome screen and writes the responsive captures under `artifacts/visual-responsive/latest/`, while project creation always uses `Exemplo GBA Completo`.

## Editor / Rooms

- Three-column editor: project navigator left, large grid canvas center, inspector right.
- Center canvas is the primary surface, with zoom/tools overlays and draggable room cards over a subtle grid.
- Room card has compact header metadata, status chips, bottom metrics and purple selection border.
- Inspector is a vertical form grouped by sections: type/size, camera, parallax, connections and scene limits.
- Debugger strip sits at the bottom below the canvas.
- Editor toolbar modes change the inspector: tile paint, collision, triggers/events, actors and room settings each expose a specialized right panel.
- Tile painting inspector includes layer selector, mode, composite count, flip toggles, ghost preview opacity and a tileset grid.
- Collision inspector shows colored collision type buttons, hover preview, border and clear actions.
- Actor inspector exposes position, direction segmented controls, sprite sheet/animation selectors, movement/animation speed, health and attack damage.
- Electron now includes a `Ferramentas do Editor` strip with `Pintura`, `Colisao`, `Ator`, `Trigger` and `Cena`, plus a contextual `Painel de ferramenta` in the inspector for the selected mode.
- Electron Rooms now exposes rail search plus count chips for scene type and status (`Todas`, `Ativa`, `Inicial`, `Alertas`), keeping canvas and inspector anchored to the active room while the list is filtered.
- `npm run smoke:exemplo-template` is the functional source of truth for the Room tools and captures the complete template in `artifacts/exemplo-template/latest/`; the responsive smoke captures the rendered Editor at `editor-half.png`, `editor-compact.png` and `editor-full.png`.

## Eventos

- Main surface is a large visual graph canvas.
- Top row contains scene selector, new event, add block, test, validate and use-in controls.
- Graph toolbar has segmented filters: Tudo, Pendencias, Problemas, Selecionado, plus card count and zoom/fit controls.
- Event/actor/room cards are white, compact, draggable, connected by curved lines, and show pending slots.
- Electron event graph cards now use the compact node scale defined for the Electron canvas: wider cards, colored top accents, slot rows with category accents, rounded connector ports and tighter metadata footers.
- Inspector remains visible on the right.
- The add-block flow opens a centered command menu over the canvas titled for the selected event, for example `Adicionar bloco a player_start`.
- Command menu structure: search field, segmented tabs `Todos`, `Favoritos`, `Receitas`, metadata-backed favorite commands with `OK ROM` badges, a dedicated `Variaveis` section with `Definir valor`/`Somar valor`/conditional commands, and expandable categories such as Ator, Campos do motor, Cena, Cores, Camera, Dialogo e menus, Entrada de controle.
- Electron now treats command-menu categories as navigation: choosing a category returns to `Todos`, filters the command list by that category, and is captured by `03c-eventos-categoria-audio.png`.
- Event inspector for a focused event shows type, focused block/use count, back-to-editor action, preset/duplicate/normalize/export buttons, editable name/category/description, health metrics and usage list.
- Electron now wires the focused-event `Exportar` action to a stable `.event.json` file containing the selected event, steps, binding labels, missing references, command verbs and graph edges.

## Sprites

- Three-column animator: actor/animation library left, large sprite canvas center, inspector right.
- Top has mode segments: Selecionar, Pintar, Apagar, Geometria, Eventos; playback controls; frame indicator; zoom.
- Left side separates Atores and Animacoes, both searchable/list based.
- Electron now keeps the actor rail searchable, adds status chips with counts for `Todos`, `Referencias` and `Ausentes`, and separates the active actor animations into an `Animacoes` rail group with `Padrao` rows and frame counts.
- Center canvas is mostly empty white space with the sprite/frame in the middle and frame strip at the bottom.
- Inspector groups essential fields, animation state, GBA budget and canvas settings.
- Electron now keeps the animator mode strip interactive for `Selecionar`, `Pintar`, `Apagar`, `Geometria` and `Eventos`, with a contextual mode panel below playback.
- Electron `Pintar` now exposes the right tile-work panel signals from the Swift reference: total 8x8 tile count, active brush summary, active animation/reference row, size presets `16x16`, `16x32`, `32x32`, `Livre`, and editable W/H fields.
- Electron `Pintar` also applies the active brush slice to the metasprite frame from canvas clicks, while `Selecionar` and `Geometria` keep repositioning the selected tile.
- Electron `Pintar` keeps the metasprite canvas visible before the first tile is added by showing a faint pixelated reference frame and a compact paint hint, so the central canvas no longer reads as an empty panel in first-use captures.
- The visual smoke captures these states in `04a-sprites-filtro-referencias.png`, `04b-sprites-selecionar.png`, `04c-sprites-pintar.png`, `04d-sprites-apagar.png`, `04e-sprites-geometria.png` and `04f-sprites-eventos.png`.

## Dialogos

- Layout has left dialogue/search/translation rail, central editor card, and right settings/preview rail.
- Right side includes game font, box/selector and GBA preview panels.
- Empty state is very sparse; avoid filling it with unrelated diagnostics.
- Electron now derives project dialogues, character counts, translation summary, event usage, font/box settings and GBA preview, with visual smoke captured in `04g-dialogos.png`.
- Electron Dialogos now uses a lighter reference-style title row with an icon, no white title card, a right-aligned `+ Dialogo` action, and the three-column editor layout starting closer to the top of the workspace.
- Electron Dialogos now exposes rail search plus count chips for dialogue status (`Todas`, `Usadas`, `Sem uso`, `Avisos`, `Escolhas`), and the smoke captures the warning-filtered state in `04h-dialogos-filtro-avisos.png`.
- Electron now exposes functional `Duplicar`, `Normalizar` and `Exportar` actions in the selected dialogue editor toolbar; `Exportar` writes a stable `.dialogue.json` payload for the selected speech.

## Audio

- Audio has two modes: Basico and Completo.
- Common top transport: play, stop, previous/next, BPM, loop and status.
- Basic mode: left library with search/filters/imports/validation/summary, large empty composer center, right data/mix/usage panels.
- Complete mode adds piano roll/tracker/sequence segmented controls and validation panel placement changes.
- Empty state should remain calm and centered.
- Electron now opens Audio in `Basico`, with a reference-like left `Biblioteca` rail that includes quick import/create actions, count chips for type/status filters, `Resumo` cards and `Validacao GBA`.
- Electron `Completo` has real `Piano Roll`, `Tracker` and `Sequencia atual` surfaces.
- Electron `Tracker` now selects a step, shows the active channel/note state, applies a quick pattern preset without overwriting existing notes, moves the selected note left/right when the adjacent step is empty, and clears a selected note through `Limpar passo`.
- Electron now exposes a functional `Exportar` action in the selected audio inspector; it writes a stable `.audio.json` payload with metadata, usage labels, sequence and preview rows for the selected item.
- The visual smoke captures this state in `05-audio.png`, `05a-audio-filtro-sfx.png`, `05b-audio-completo.png`, `05c-audio-tracker.png` and `05d-audio-sequencia.png`.

## Arquivos

- Asset workspace has top category tabs and action toolbar.
- Summary stat cards sit above a three-column body: filter/list left, large preview center, usage/action panel right.
- Left list groups assets by type and supports search, used/unused filters and list/grid toggle.
- Right usage panel highlights recommendations and workspace-specific actions such as opening sprites in the animator.
- Electron now derives usage labels from current project references such as room backgrounds/reference images, sprite sheets, generated sprite assets, audio items and event commands.
- Electron Arquivos exposes count chips for asset type and used/unused filters, plus list/grid view controls; the smoke captures `01-arquivos.png` and `01a-arquivos-filtro-audio.png` check the default library and the filtered Audio view.
- Electron Arquivos now groups the left rail by asset kind with used/total counts and exposes contextual primary actions: `Usar no Editor`, `Abrir no Animador` or `Abrir no Audio`.
- Electron Arquivos now adds the reference-like workflow strip `Importar > Organizar > Validar > Usar no projeto`; its final action opens the related workspace for the active asset, matching the inspector primary action. The workspace also includes top summary cards for total assets, images, audio, fonts, attention and unused files.

## Ajustes

- Settings is a two-column layout: category navigation left and form content right.
- Left nav groups: Aplicativo, Projeto, Tipos de Cena, Assets e Conteudo, Sistemas and Avancado.
- Right content uses wide form sections with inline controls and a restore-default action per section.
- Keep settings forms dense, light and scannable.
- Additional references show nested Settings sections for `Tipos de Cena` and `Save Data`: the left rail uses grouped headings, purple selected rows, compact icon+title+subtitle rows, and the right side remains a wide form with sparse controls and toggles.
- `Tipos de Cena` exposes a default scene-type selector, enabled/disabled toggles for multiple scene families, and default player sprite selectors with thumbnail previews.
- `Save Data` exposes save type, slot count/slider, many compact boolean toggles and reset action, leaving most of the page as calm empty working space.
- Later references add `Sprites`, `Backgrounds`, `UI / Dialogos`, `Audio`, `Transicoes`, `Projeteis`, `Preview` and `Avancado` sections, with dense rows of inputs, toggles and preset cards for movement families.
- Electron now derives the same grouped Settings map across 19 sections and captures representative Settings states in `06-settings.png`, `06b-settings-tipos-cena.png`, `06c-settings-save-data.png`, `06d-settings-transicoes.png`, `06e-settings-topdown.png`, `06f-settings-plataforma.png`, `06g-settings-isometrico.png`, `06h-settings-shootemup.png`, `06i-settings-apontar-clicar.png`, `06j-settings-sprites.png`, `06k-settings-backgrounds.png`, `06l-settings-ui-dialogos.png`, `06m-settings-audio.png`, `06n-settings-projeteis.png`, `06o-settings-preview.png` and `06p-settings-avancado.png`.
- Electron Settings now uses a closer two-column composition: grouped navigation on the left, a wide section header with `Restaurar padrao`, form-like rows in the main area, and diagnostics moved below the active form instead of a persistent right inspector.
- Electron Settings now exposes editable fields and restore-default behavior for `Tipos de Cena` and dense reference sections including `Top-down`, `Plataforma`, `Isometrico`, `Shoot em Up`, `Apontar e Clicar`, `Sprites`, `Backgrounds`, `UI / Dialogos`, `Transicoes` and `Projeteis`; `Tipos de Cena` includes nested enabled toggles for the scene families.
- Electron Settings now derives compact `Ajustes por intencao` cards for `Top-down`, `Plataforma`, `Isometrico`, `Shoot em Up` and `Apontar e Clicar`, including applied-state chips such as `Ja aplicado` and change counts.

## Electron gap notes

- Current Electron workspaces are functionally richer than their early shell, and the global topbar now matches the Swift naming/order more closely.
- Next visual convergence should prioritize the light three-column workspace layout before detailed component polish.
- Rooms, Eventos, Sprites, Dialogos, Audio, Arquivos and Settings should keep the new functional filters, but restyle them to match the Swift reference rails/toolbars.
