import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("runtime de telas de apresentação do menu", () => {
  it("mantém telas Logo sem HUD, diálogo ou configuração de paleta da UI", async () => {
    const source = await readFile(
      new URL("../../../packages/GBAStudioEngine/templates/exported_menu/main.cpp", import.meta.url),
      "utf8"
    );

    expect(source).toContain("bool menu_screen_uses_ui(const gbs::MenuScreenData* screen)");
    const menuScreenUsesUi = source.match(
      /bool menu_screen_uses_ui\(const gbs::MenuScreenData\* screen\) \{[\s\S]*?\n\}/
    )?.[0] ?? "";
    expect(menuScreenUsesUi).toMatch(
      /screen->screen_type == gbs::MenuScreenType::Logo[\s\S]*?screen->screen_type == gbs::MenuScreenType::Title/
    );
    expect(source).toMatch(
      /void refresh_hud\(\) \{[\s\S]*?if \(!menu_screen_uses_ui\(screen\)[\s\S]*?gbs::hide_hud\(hud\)/
    );
    expect(source).toContain("void refresh_menu_text()");
    expect(source).toContain("menu_screen_uses_hud_layout(screen)");
    expect(source).toContain("gbs::hide_dialogue(dialogue)");
    expect(source).toContain("gbastudio_dialogue_ui::configure_for_scene");
    expect(source).toContain("menu_scene_has_hud_binding = gbastudio_dialogue_ui::has_hud_scene_binding");
    const startScreen = source.match(
      /void start_screen\(int screen_index, bool reset_selection = true, int target_item_index = -1\) \{[\s\S]*?\n\}/
    )?.[0] ?? "";
    expect(startScreen).toMatch(
      /screen->screen_type != gbs::MenuScreenType::Logo &&\s*screen->screen_type != gbs::MenuScreenType::Title\) \{[\s\S]*?gbastudio_dialogue_ui::configure_for_scene\(scene_name, true\);[\s\S]*?\} else \{\s*menu_scene_has_hud_binding = false;\s*gbs::hide_hud\(hud\);\s*gbs::hide_dialogue\(dialogue\);/
    );
    const updateMenuRuntime = source.match(
      /gbs::RuntimeAdapterFrameResult update_menu_runtime\([\s\S]*?\n\}/
    )?.[0] ?? "";
    expect(updateMenuRuntime).toMatch(
      /screen->screen_type != gbs::MenuScreenType::Logo &&\s*screen->screen_type != gbs::MenuScreenType::Title\) \{[\s\S]*?gbastudio_dialogue_ui::configure_for_scene\(scene_name\);[\s\S]*?\} else \{\s*menu_scene_has_hud_binding = false;/
    );
    expect(source).not.toMatch(
      /refresh_menu_save_slot_statuses\(\);\s*gbastudio_dialogue_ui::configure\(\);/
    );
  });

  it("permite que B execute o retorno de uma tela raiz sem pilha", async () => {
    const source = await readFile(
      new URL("../../../packages/GBAStudioEngine/templates/exported_menu/main.cpp", import.meta.url),
      "utf8"
    );

    expect(source).toContain("screen->on_back");
    expect(source).toMatch(
      /else if \(input\.was_pressed\(gbs::ButtonB\)\) \{[\s\S]*?back_from_screen\(\);/
    );
  });

  it("publica a troca de tela somente depois de limpar overlays e preparar a UI", async () => {
    const source = await readFile(
      new URL("../../../packages/GBAStudioEngine/templates/exported_menu/main.cpp", import.meta.url),
      "utf8"
    );
    const startScreen = source.match(
      /void start_screen\(int screen_index, bool reset_selection = true, int target_item_index = -1\) \{[\s\S]*?\n\}/
    )?.[0] ?? "";

    expect(startScreen).toMatch(
      /gbs::begin_render_publication_transaction\(\);[\s\S]*?gbs::hide_hud\(hud\);[\s\S]*?gbs::hide_dialogue\(dialogue\);[\s\S]*?gbs::disable_blending\(\);/
    );
    expect(startScreen).toContain("temporary_message_frames = 0;");
    expect(startScreen).toMatch(
      /stream_screen_resource_group\(\*screen\);[\s\S]*?load_screen_actor_resources\(\*screen\);[\s\S]*?menu_ui_assets_restore_pending = true;[\s\S]*?apply_background\(\*screen\);/
    );
    expect(source).toMatch(
      /gbs::wait_vblank\(\);[\s\S]*?if \(menu_ui_assets_restore_pending && !gbs::render_publication_transaction_active\(\)\)[\s\S]*?gbs::render_ui_assets\(\);/
    );
  });

  it("permite que Start confirme qualquer tela de menu", async () => {
    const source = await readFile(
      new URL("../../../packages/GBAStudioEngine/templates/exported_menu/main.cpp", import.meta.url),
      "utf8"
    );
    const updateMenuRuntime = source.match(
      /gbs::RuntimeAdapterFrameResult update_menu_runtime\([\s\S]*?\n\}/
    )?.[0] ?? "";

    expect(updateMenuRuntime).toMatch(
      /else if \(input\.was_pressed\(gbs::ButtonA\) \|\|\s*input\.was_pressed\(gbs::ButtonStart\)\) \{[\s\S]*?activate_selection\(\);/
    );
  });

  it("desenha somente os atores da tela ativa e carrega seus assets OBJ", async () => {
    const source = await readFile(
      new URL("../../../packages/GBAStudioEngine/templates/exported_menu/main.cpp", import.meta.url),
      "utf8"
    );

    expect(source).toContain("actor.tile_asset");
    expect(source).toContain("actor.palette_asset");
    expect(source).not.toContain("project.obj_palette_count");
    expect(source).toContain("gbs::hide_all_sprites();");
    expect(source).toContain(
      "const gbs::MenuScreenData* screen = gbs::menu_screen_for(project, menu_state.screen_index);"
    );
    expect(source).toContain("for (size_t actor_index = 0; actor_index < screen->actor_count; ++actor_index)");
    expect(source).toContain("gbs::set_metasprite");
    expect(source).toContain("gbs::MenuActorRole::Cursor");
    expect(source).toContain("position = gbs::menu_cursor_position_at(");
    expect(source).toMatch(/draw_screen_actors\(\);[\s\S]*?gbs::draw_hud\(hud\);[\s\S]*?draw_menu_text_input\(\);/);
  });

  it("renderiza a entrada de texto como uma superfície modal BG0 com texto dinâmico OBJ", async () => {
    const source = await readFile(
      new URL("../../../packages/GBAStudioEngine/engine/src/gbs_hw.c", import.meta.url),
      "utf8"
    );
    const menuTemplate = await readFile(
      new URL("../../../packages/GBAStudioEngine/templates/exported_menu/main.cpp", import.meta.url),
      "utf8"
    );

    expect(source).toContain("DYNAMIC_TEXT_OBJ_TILE_BASE = 900");
    expect(source).toContain("DYNAMIC_TEXT_OBJ_OAM_BASE = 96");
    const overlayFunction = source.match(/static void gbs_hw_draw_text_overlay_at\([\s\S]*?\n}\n\nvoid gbs_hw_draw_text_overlay\(/)?.[0] ?? "";
    expect(overlayFunction).toContain("gbs_hw_set_sprite(");
    expect(overlayFunction).not.toContain("screenblock[");
    expect(source).toContain("gbs_hw_draw_text_overlay_light");
    expect(source).toContain("gbs_hw_draw_text_input_surface");
    expect(source).toContain("gbs_hw_draw_name_input_surface");
    expect(menuTemplate).toContain("gbs::draw_text_overlay_light");
    expect(menuTemplate).toContain("gbs::draw_text_input_surface");
  });

  it("renderiza a moldura modal do campo de nome junto da superfície do teclado", async () => {
    const source = await readFile(
      new URL("../../../packages/GBAStudioEngine/templates/exported_menu/main.cpp", import.meta.url),
      "utf8"
    );
    const renderSource = await readFile(
      new URL("../../../packages/GBAStudioEngine/engine/src/gbs_hw.c", import.meta.url),
      "utf8"
    );

    expect(source).toContain("gbs::draw_text_input_surface");
    expect(renderSource).toContain("void gbs_hw_draw_text_input_surface");
    expect(renderSource).toContain("gbs_hw_draw_name_input_surface");
  });

  it("desativa a UI nativa e o diálogo quando a tela possui opções como atores", async () => {
    const source = await readFile(
      new URL("../../../packages/GBAStudioEngine/templates/exported_menu/main.cpp", import.meta.url),
      "utf8"
    );

    expect(source).toContain("menu_screen_uses_actor_options(screen)");
    expect(source).toContain("gbs::show_menu(menu_ui, title, menu_ui_items, visible_item_count)");
    const genericMenu = source.match(
      /bool menu_screen_uses_generic_menu\(const gbs::MenuScreenData\* screen\) \{[\s\S]*?\n\}/
    )?.[0] ?? "";
    expect(genericMenu).toMatch(
      /if \(menu_screen_uses_actor_options\(screen\)\) \{\s*return false;\s*\}/
    );
    expect(genericMenu).toMatch(
      /return !menu_screen_uses_hud_layout\(screen\) \|\|\s*screen->presentation_mode == gbs::MenuScenePresentationMode::Both;/
    );
    const refreshMenuUi = source.match(/void refresh_menu_ui\(\) \{[\s\S]*?\n\}/)?.[0] ?? "";
    const refreshMenuText = source.match(/void refresh_menu_text\(\) \{[\s\S]*?\n\}/)?.[0] ?? "";
    expect(refreshMenuUi).toMatch(/!menu_screen_uses_generic_menu\(screen\)\) \{\s*return;/);
    expect(refreshMenuText).toMatch(/!menu_screen_uses_generic_menu\(screen\)\) \{\s*gbs::hide_dialogue\(dialogue\);/);
    const renderMenuRuntime = source.match(
      /void render_menu_runtime\(const gbs::RuntimeFrameContext& context\) \{[\s\S]*?\n\}/
    )?.[0] ?? "";
    expect(renderMenuRuntime).toMatch(
      /refresh_menu_ui\(\);\s*draw_screen_actors\(\);\s*if \(menu_screen_uses_generic_menu\(screen\)\) \{\s*gbs::draw_menu\(menu_ui\);/
    );
    expect(source).toContain("screen->screen_type != gbs::MenuScreenType::Menu");
    expect(source).toContain("menu_screen_uses_actor_options(screen)");
  });

  it("ignora atores decorativos ao decidir entre UI nativa e opções OBJ", async () => {
    const source = await readFile(
      new URL("../../../packages/GBAStudioEngine/templates/exported_menu/main.cpp", import.meta.url),
      "utf8"
    );
    const helper = source.match(
      /bool menu_screen_uses_actor_options\(const gbs::MenuScreenData\* screen\) \{[\s\S]*?\n\}/
    )?.[0] ?? "";

    expect(helper).toContain("for (size_t actor_index = 0; actor_index < screen->actor_count; ++actor_index)");
    expect(helper).toContain("if (menu_text_input_config(screen) != nullptr)");
    expect(helper).toContain("actor.role == gbs::MenuActorRole::Option");
  });

  it("mantém a grade lateral no arranjo de oito letras por linha da referência", async () => {
    const source = await readFile(
      new URL("../../../packages/GBAStudioEngine/templates/exported_menu/main.cpp", import.meta.url),
      "utf8"
    );
    const hardwareSource = await readFile(
      new URL("../../../packages/GBAStudioEngine/engine/src/gbs_hw.c", import.meta.url),
      "utf8"
    );

    expect(source).toContain("menu_text_input_keyboard_side_grid[4][8]");
    expect(source).toContain("const int column_count = bottom_grid ? 8 : side_controls ? 9 : 10;");
    expect(hardwareSource).toContain("const int keyboard_rows = side_controls ? 4 : 3;");
    expect(hardwareSource).toContain("const int keyboard_columns = side_controls ? 8 : 10;");
  });

  it("faz DONE continuar para o próximo item selecionável da tela", async () => {
    const source = await readFile(
      new URL("../../../packages/GBAStudioEngine/templates/exported_menu/main.cpp", import.meta.url),
      "utf8"
    );

    expect(source).toMatch(
      /menu_text_input\.keyboard_index == 28[\s\S]*?menu_text_input\.editing = false;[\s\S]*?menu_item_is_available[\s\S]*?activate_selection\(\);/
    );
  });

  it("permite que uma tela selecione uma composição HUD própria com oito slots", async () => {
    const source = await readFile(
      new URL("../../../packages/GBAStudioEngine/templates/exported_menu/main.cpp", import.meta.url),
      "utf8"
    );

    expect(source).toContain("bool menu_screen_uses_hud_layout(const gbs::MenuScreenData* screen)");
    expect(source).toContain("gbastudio_dialogue_ui::has_hud_scene_binding");
    expect(source).toContain("bool menu_scene_has_hud_binding = false;");
    expect(source).toMatch(
      /if \(menu_screen_uses_hud_layout\(screen\)\) \{[\s\S]*?gbs::set_hud_text_slots\(hud, map_hud_text_slots, 8\)/
    );
    expect(source).toMatch(
      /menu_screen_uses_hud_layout\(screen\)[\s\S]*?gbs::hide_dialogue\(dialogue\)/
    );
  });

  it("renderiza as opções da tela de configurações dentro da HUD com linhas configuráveis e título separado", async () => {
    const source = await readFile(
      new URL("../../../packages/GBAStudioEngine/templates/exported_menu/main.cpp", import.meta.url),
      "utf8"
    );

    expect(source).toContain("format_hud_menu_item_label");
    expect(source).toContain("append_hud_audio_bar");
    expect(source).toContain("gbs::active_hud_layout()");
    expect(source).toMatch(
      /const size_t rows = screen->hud_list_rows;[\s\S]*?map_hud_text_slots\[i \+ 1\] = menu_item_label_buffers\[i\]/
    );
  });

  it("preserva todos os componentes da HUD avançada antes da limpeza do diálogo", async () => {
    const source = await readFile(
      new URL("../../../packages/GBAStudioEngine/templates/exported_menu/main.cpp", import.meta.url),
      "utf8"
    );

    expect(source).toMatch(
      /if \(gbs::active_hud_layout\(\) != nullptr\) \{[\s\S]*?gbs::draw_dialogue\(dialogue\);[\s\S]*?gbs::draw_hud\(hud\);[\s\S]*?\} else \{[\s\S]*?gbs::draw_hud\(hud\);[\s\S]*?gbs::draw_dialogue\(dialogue\);/
    );
  });
});
