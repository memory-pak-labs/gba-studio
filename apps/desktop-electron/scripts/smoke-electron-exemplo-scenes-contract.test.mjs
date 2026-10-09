import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("exemplo scenes smoke wiring", () => {
  it("mantém uma página tática visível até a residência e o DMA estarem prontos", async () => {
    const source = await readFile(
      new URL("../../../packages/GBAStudioEngine/examples/isometric_basic/src/main.cpp", import.meta.url),
      "utf8"
    );
    const smokeSource = await readFile(
      new URL("./smoke-electron-exemplo-scenes.mjs", import.meta.url),
      "utf8"
    );
    expect(source).toContain("tactical_surface_page_resources_ready");
    expect(source).toContain("iso_tactical_surface_camera_position_with_page_lock");
    expect(source).toContain("gbs::dma_vblank_queue_count() == 0");
    expect(source).toContain("tactical_surface_pending_page_index");
    expect(source).toContain("tactical_surface_requested_page_index");
    expect(source).toContain("tactical_surface_page_load_started");
    expect(source).toContain("tactical_grid_fallback");
    expect(source).toContain("Commit only after the complete layer set is loaded");
    expect(smokeSource).toContain("auditTacticalSurfaceScreenshot");
    expect(smokeSource).toContain("surfaceMissing = uniqueColorCount < 48 && dominantColorRatio > 0.72");
    expect(smokeSource).toContain("a grade/atores podem permanecer sobre um fundo uniforme");
    expect(smokeSource).toContain("state = await capture(`${label}_turn_${turn + 1}`)");
    expect(smokeSource).toContain("const hasDungeonMapOverlay = isDungeonCrawler");
    expect(smokeSource).toContain("module?.id === \"map\" && module?.enabled !== false");
  });

  it("amostra a estabilidade temporal de background e atores durante o Play", async () => {
    const source = await readFile(
      new URL("./smoke-electron-exemplo-scenes.mjs", import.meta.url),
      "utf8"
    );
    expect(source).toContain('import { auditTemporalVisualStability } from "./visual-frame-stability.mjs";');
    expect(source).toContain("async function samplePlayerVisualStability(cdp, sampleCount = 36, actorRegions = [])");
    expect(source).toContain("background: analyzeRegion");
    expect(source).toContain("actors: resolvedActorRegions");
    expect(source).toContain("hudTop: analyzeRegion");
    expect(source).toContain("dialogue: analyzeRegion");
    expect(source).toContain("titleMenu:");
    expect(source).toContain("const temporalVisualFidelity = auditTemporalVisualStability(visualStabilitySamples.samples, {");
    expect(source).toContain("enforceSignatureContinuity: scene.runtime === \"isometric\"");
    expect(source).toContain("temporalVisualFidelity,");
  });

  it("declares the resolved project source in scene evidence", async () => {
    const source = await readFile(
      new URL("./smoke-electron-exemplo-scenes.mjs", import.meta.url),
      "utf8"
    );
    expect(source).toContain('classifyP0ProjectPath(appRoot, templatePath)');
    expect(source).toContain("sourceKey: projectSource.sourceKey");
    expect(source).toContain("role: projectSource.role");
    expect(source).toContain("async function waitForPlayerTarget(mainCdp, beforeIDs");
    expect(source).toContain("studio-status-bar-message");
  });

  it("audita todas as cores RGB555 usadas pelo viewport, nao somente a cor dominante do mapa", async () => {
    const source = await readFile(
      new URL("./smoke-electron-exemplo-scenes.mjs", import.meta.url),
      "utf8"
    );
    const paletteAuditBody = source.match(
      /async function auditExportedScenePalette[\s\S]*?\n}\n\nfunction spriteFrameDimensions/
    )?.[0] ?? "";

    expect(paletteAuditBody).toContain(
      "expectedRgb555: usedExportedTilemapRgb555(exportCoverage)"
    );
  });

  it("audita o frame ativo de backgrounds animados antes de reprovar a fidelidade", async () => {
    const source = await readFile(
      new URL("./smoke-electron-exemplo-scenes.mjs", import.meta.url),
      "utf8"
    );
    expect(source).toContain("exemploSceneBackgroundAnimationAssetNames(room)");
    expect(source).toContain("async function auditExportedSceneBackgroundAsset");
    expect(source).toContain("selectedFrameIndex: animatedAssetNames.indexOf(selectedAssetName)");
  });

  it("aceita a remapagem de paleta declarada pelo exportador sem relaxar o framebuffer", async () => {
    const source = await readFile(
      new URL("./smoke-electron-exemplo-scenes.mjs", import.meta.url),
      "utf8"
    );
    expect(source).toContain("const paletteReferenceDeclared =");
    expect(source).toContain("sourcePixelsWithBackgroundPaletteReference");
    expect(source).toContain("framebufferPixelsWithNativeReduction");
  });

  it("accepts the normalized camelCase zoom returned by the camera contract", async () => {
    const source = await readFile(
      new URL("./smoke-electron-exemplo-scenes.mjs", import.meta.url),
      "utf8"
    );
    expect(source).toContain("camera?.zoom_x256 ?? camera?.zoomX256 ?? CAMERA_SCALE_ONE");
  });

  it("forwards the compiled tile destination into the isometric framebuffer renderer", async () => {
    const source = await readFile(
      new URL("./smoke-electron-exemplo-scenes.mjs", import.meta.url),
      "utf8"
    );
    const auditBody = source.match(
      /function auditIsometricRoomFramebuffer[\s\S]*?\n}\n\nasync function auditExportedSceneBackground/
    )?.[0] ?? "";

    expect(auditBody).toContain(
      "const sourceTileDestination = Number(options?.sourceTileDestination ?? 0);"
    );
    expect(auditBody).toMatch(
      /renderIsometricRoomRgba\(\{[\s\S]*?sourceTileDestination,[\s\S]*?sourceTilemapEntries/
    );
    expect(auditBody).toContain("resolveIsometricActorFramebufferMasks(room, runtimeState)");
  });

  it("renders isometric fidelity from the compiled RGB555 tile bytes instead of PNG atlas positions", async () => {
    const source = await readFile(
      new URL("./smoke-electron-exemplo-scenes.mjs", import.meta.url),
      "utf8"
    );

    expect(source).toContain("auditNativeIsometricComposition");
    expect(source).toMatch(
      /const isometricCompiledTileset = [\s\S]*?decodeExportedTilemapRgba\([\s\S]*?transparentPaletteZero: true/
    );
    expect(source).toMatch(
      /auditIsometricRoomFramebuffer\(\s*isometricCompiledTileset,/
    );
  });

  it("projects the isometric player through the runtime camera and compares compiled sprite pixels", async () => {
    const source = await readFile(
      new URL("./smoke-electron-exemplo-scenes.mjs", import.meta.url),
      "utf8"
    );
    const playerAuditBody = source.match(
      /async function auditExportedRuntimePlayer[\s\S]*?\n}\n\nasync function capturePlayerScreenshot/
    )?.[0] ?? "";

    expect(playerAuditBody).toMatch(
      /const compiledSource = runtime === "isometric"[\s\S]*?decodeExportedSpriteSheetRgba\(\{/
    );
    expect(playerAuditBody).toContain("const camera = isometricCameraPosition(room, frameRuntimeState);");
    expect(playerAuditBody).toMatch(/target = isometricCameraWorldToScreen\([\s\S]*?camera\s*\);/);
    expect(playerAuditBody).toMatch(/sourcePixels: (?:compiledSource|renderedSource)\.pixels/);
    expect(playerAuditBody).toContain("allowedOcclusionRgb555: compiledBackgroundPalette");
  });

  it("projects the racing player through the authored room camera and tracks the current sprite sheet", async () => {
    const source = await readFile(
      new URL("./smoke-electron-exemplo-scenes.mjs", import.meta.url),
      "utf8"
    );
    const playerAuditBody = source.match(
      /async function auditExportedRuntimePlayer[\s\S]*?\n}\n\nasync function capturePlayerScreenshot/
    )?.[0] ?? "";

    expect(source).toContain("function racingCameraPosition(room, runtimeState)");
    expect(source).toContain("const deadZone = track.camera_dead_zone ?? track.cameraDeadZone ?? {};");
    expect(source).toContain("room?.runtime?.config?.topdownTrack");
    expect(source).toContain("room?.width_tiles ?? room?.width ?? 0");
    expect(source).toContain("room?.height_tiles ?? room?.height ?? 0");
    expect(source).toContain("track.cameraDeadZoneX");
    expect(source).toContain("track.cameraDeadZoneY");
    expect(playerAuditBody).toMatch(
      /if \(runtime === "racing"\) \{[\s\S]*?const camera = racingCameraPosition\(racingRoom, frameRuntimeState\);[\s\S]*?x: nativeRacingPlayer\?\.x \?\? Number\(player\.x\) - camera\.x,[\s\S]*?y: nativeRacingPlayer\?\.y \?\? Number\(player\.y\) - camera\.y/
    );
    expect(playerAuditBody).toContain('matrix:nativeRacingPlayer.matrix');
    expect(source).toContain('sha256: "d933dc6a743c06312ea3c343079080430272e43ff0fe1bed0a5d5cc016446185"');
    expect(source).toMatch(
      /racing: Object\.freeze\(\{[\s\S]*?frameCount: 3,[\s\S]*?sheetWidth: 96,[\s\S]*?tileCount: 48/
    );
    expect(source).toContain('const exactBackgroundCamera = scene.runtime === "racing"');
    expect(source).toContain("sourceX: exactBackgroundCamera.x");
    expect(source).toContain("sourceY: exactBackgroundCamera.y");
  });

  it("mantém a HUD fixa da corrida em BG0 sobre o mapa autoral", async () => {
    const source = await readFile(
      new URL("../../../packages/GBAStudioEngine/templates/exported_racing/main.cpp", import.meta.url),
      "utf8"
    );
    expect(source).toContain("gbs::set_bg_priority(gbs::BackgroundLayer::BG0, 0);");
    expect(source).toContain("gbs::set_bg_enabled(gbs::BackgroundLayer::BG0, true);");
    expect(source).toContain("gbs::set_bg_priority(background.layer, 2);");
  });

  it("usa os limites do HUD exportado e dos OBJ nativos ao auditar o background da corrida", async () => {
    const source = await readFile(
      new URL("./smoke-electron-exemplo-scenes.mjs", import.meta.url),
      "utf8"
    );
    expect(source).toContain('if (runtime === "racing")');
    expect(source).toContain("masks.push(...(hudMasks.length ? hudMasks");
    expect(source).toContain("exportedHudFramebufferMasks(await readFile");
    expect(source).toContain("runtimeState.nativeVideo.objects.map");
  });

  it("desconsidera o cabeçalho fixo de mapa e visual novel ao auditar o background", async () => {
    const source = await readFile(
      new URL("./smoke-electron-exemplo-scenes.mjs", import.meta.url),
      "utf8"
    );
    expect(source).toMatch(
      /if \(\["visualNovel", "worldMap"\]\.includes\(runtime\)\) \{[\s\S]*?masks\.push\(\{ height: 32, width: 240, x: 0, y: 0 \}\);/
    );
  });

  it("desconsidera as duas molduras superiores da HUD dos Penedos ao auditar o composto do platformer", async () => {
    const source = await readFile(
      new URL("./smoke-electron-exemplo-scenes.mjs", import.meta.url),
      "utf8"
    );
    expect(source).toMatch(
      /if \(runtime === "platformer" && room\?\.name === "penedos_vento"\) \{[\s\S]*?\{ height: 24, width: 96, x: 8, y: 8 \}[\s\S]*?\{ height: 24, width: 96, x: 136, y: 8 \}/
    );
  });

  it("alinha a máscara do metasprite 64x64 do player platformer ao anchor visual", async () => {
    const source = await readFile(
      new URL("./smoke-electron-exemplo-scenes.mjs", import.meta.url),
      "utf8"
    );
    const playerMaskBranch = source.match(
      /if \(runtime === "platformer"\) \{[\s\S]*?\n    \} else if \(runtime === "shmup"\)/
    )?.[0] ?? "";

    expect(playerMaskBranch).toContain("x: anchorX - sourceX");
    expect(playerMaskBranch).toContain("y: anchorY - sourceY - frameHeight + 8");
  });

  it("desconsidera o logo OBJ da tela Title ao auditar o background", async () => {
    const source = await readFile(
      new URL("./smoke-electron-exemplo-scenes.mjs", import.meta.url),
      "utf8"
    );
    expect(source).toMatch(
      /if \(runtime === "menu" && room\?\.name === "titulo"\) \{[\s\S]*?masks\.push\(\{ height: 32, width: 96, x: 72, y: 32 \}\);/
    );
  });

  it("audita a variante OBJ selecionada pela cena quando o sprite usa uma família de paleta", async () => {
    const source = await readFile(
      new URL("./smoke-electron-exemplo-scenes.mjs", import.meta.url),
      "utf8"
    );
    const playerAuditBody = source.match(
      /async function auditExportedRuntimePlayer[\s\S]*?\n}\n\nasync function capturePlayerScreenshot/
    )?.[0] ?? "";

    expect(playerAuditBody).toContain(
      "const selectedSymbol = exportedRuntimePlayerAsset(exported, runtime);"
    );
    expect(playerAuditBody).toContain(
      "const playerSymbol = selectedSymbol ?? spec.symbol;"
    );
    expect(playerAuditBody).toContain(
      "selectedSymbol === spec.symbol || selectedSymbol?.startsWith(`${spec.symbol}_palette_`)"
    );
    expect(playerAuditBody).toContain(
      "exportedObjectPaletteOverride(exported, playerSymbol)"
    );
  });

  it("tracks the approved current topdown contract", async () => {
    const source = await readFile(
      new URL("./smoke-electron-exemplo-scenes.mjs", import.meta.url),
      "utf8"
    );
    expect(source).toMatch(
      /const topdownPlayerSpec = Object\.freeze\(\{[\s\S]*?assetName: "player-pilot-32x32\.png",[\s\S]*?frameCount: 16,[\s\S]*?frameHeight: 32,[\s\S]*?frameWidth: 32,[\s\S]*?sheetWidth: 512,[\s\S]*?tileCount: 16,[\s\S]*?streamFrames: true/
    );
    expect(source).toContain('const topdownPlayerSymbol = "player_pilot_32x32";');
    expect(source).toContain('const topdownPlayerSha256 = "4089313016c9bc9674ec2ce6857efd4b3a6ab4c14fde5fa03c613aa611fc1472";');
    expect(source).not.toContain("topdownPlayerPendingSourceSpec");
    expect(source).not.toContain("pending-context-review");
    expect(source).toContain("const auditSpec = topdownPlayerSpec;");
    expect(source).toContain("frame_count = ${auditSpec.frameCount};");
    expect(source).toContain("residentTileCount: auditSpec.tileCount");
    expect(source).toContain("frameResidency: auditSpec.streamFrames === true && residency.ok");
    expect(source).toContain("sourceFrames.every((frame) => frame.ok)");
  });

  it("tracks the promoted point-and-click cursor without reintroducing the workshop cursor", async () => {
    const source = await readFile(
      new URL("./smoke-electron-exemplo-scenes.mjs", import.meta.url),
      "utf8"
    );
    expect(source).toMatch(
      /pointAndClick: Object\.freeze\(\{[\s\S]*?assetName: "point-click-cursor\.png",[\s\S]*?frameCount: 2,[\s\S]*?sheetWidth: 32,[\s\S]*?tileCount: 8/
    );
    expect(source).toContain(
      'sha256: "2128a2c31ae447549b1aa295215cfcfad4233e3af89c1ad91e478d98dfcac1f8"'
    );
    expect(source).toContain(
      'const spec = runtimePlayerSpecs[runtime];'
    );
    expect(source).toContain(
      'if (runtime === "pointAndClick") return exported?.point_click_project?.cursor?.metasprite?.asset ?? null;'
    );
    expect(source).toContain(
      'assetName: "point-click-cursor.png"'
    );
    expect(source).not.toContain('assetName: "oficina-cursor.png"');
  });

  it("tracks the current six-frame battle player sheet promoted for the Relay Guardian", async () => {
    const source = await readFile(
      new URL("./smoke-electron-exemplo-scenes.mjs", import.meta.url),
      "utf8"
    );
    expect(source).toContain(
      'sha256: "7cfffa6566c2a2b3790891c8b9d3ce9a189da204174fd00f620610e44caf0c10"'
    );
    expect(source).toMatch(
      /battleRpg: Object\.freeze\(\{[\s\S]*?frameCount: 6,[\s\S]*?frameWidth: 64,[\s\S]*?sheetWidth: 384,[\s\S]*?tileCount: 320/
    );
    expect(source).toContain(
      "0x0000, 0x1482, 0x18c6, 0x18ec, 0x1d4f, 0x4250, 0x2528, 0x2dd1,\n      0x31aa, 0x52f5, 0x42b9, 0x575d, 0x29f8, 0x1975, 0x325d, 0x42de"
    );
  });

  it("audita os dois lutadores nativos da cena luta e separa HUD de OAM", async () => {
    const source = await readFile(
      new URL("./smoke-electron-exemplo-scenes.mjs", import.meta.url),
      "utf8"
    );
    expect(source).toContain("async function auditExportedLutaPlayers");
    expect(source).toMatch(/runtime === "luta"[\s\S]*?auditExportedLutaPlayers\([\s\S]*?\)/);
    expect(source).toContain("const lutaHudMasks = [");
    expect(source).toContain("player1: { x: 80, y: 80 }");
    expect(source).toContain("player2: { x: 200, y: 80 }");
    expect(source).toContain('side === "player1" ? "nara_fighter" : "rival_fighter"');
  });

  it("tracks the approved Tempestade v3 shmup player sheet promoted for the Storm", async () => {
    const source = await readFile(
      new URL("./smoke-electron-exemplo-scenes.mjs", import.meta.url),
      "utf8"
    );
    expect(source).toContain(
      'sha256: "3eb41a92131ae9e71c384aea57457e6222ce298b64dc040549d5edb901802f8a"'
    );
    expect(source).toMatch(
      /shmup: Object\.freeze\(\{[\s\S]*?assetName: "tempestade-v3-player\.png",[\s\S]*?frameCount: 1,[\s\S]*?frameHeight: 64,[\s\S]*?frameWidth: 64,[\s\S]*?sheetWidth: 64,[\s\S]*?tileCount: 64/
    );
    expect(source).toContain(
      "0x0000, 8489, 6417, 6519, 19057, 23387, 18036, 3136"
    );
  });

  it("liga o botao B ao freio aereo do runtime shmup", async () => {
    const source = await readFile(
      new URL("../../../packages/GBAStudioEngine/templates/exported_shmup/main.cpp", import.meta.url),
      "utf8"
    );
    const movementBody = source.match(
      /void move_player\(gbs::InputState input\) \{[\s\S]*?\n}\n\nvoid fire_projectile/
    )?.[0] ?? "";

    expect(movementBody).toContain("input.is_held(gbs::ButtonB)");
    expect(movementBody).toContain("gbs::shmup_player_movement_speed");
  });

  it("publica no telemetry os atores da cutscene ativa", async () => {
    const source = await readFile(
      new URL("../../../packages/GBAStudioEngine/templates/exported_cutscene/main.cpp", import.meta.url),
      "utf8"
    );
    const telemetryBody = source.match(
      /void publish_runtime_telemetry\(\) \{[\s\S]*?\n}\n\nvoid stream_current_step_resource_group/
    )?.[0] ?? "";

    expect(telemetryBody).toContain("const gbs::CutsceneSceneData* scene = gbs::cutscene_scene_for(project, cutscene_state.scene_index);");
    expect(telemetryBody).toContain("runtime_telemetry.actor_count");
    expect(telemetryBody).toContain("runtime_telemetry.first_actor_visible = actor.metasprite != nullptr && gbs::is_valid_metasprite(*actor.metasprite) ? 1 : 0;");
  });

  it("mantém um exercício isolado de direcional, disparo e freio para a Tempestade", async () => {
    const source = await readFile(
      new URL("./smoke-electron-exemplo-scenes.mjs", import.meta.url),
      "utf8"
    );
    expect(source).toContain("const exerciseShmupInputRequested = process.argv.includes(\"--exercise-shmup-input\");");
    expect(source).toContain("async function runShmupInputExercise(cdp, sceneName, faceButtons)");
    expect(source).toContain("sceneName !== \"tempestade\"");
    expect(source).toContain("const brakeDelta = Number(afterBrakedMovement?.player?.x)");
    expect(source).toContain("brakeDelta < normalDelta");
    expect(source).toContain("await pressPlayerButton(cdp, faceButtons.a.code, faceButtons.a.key, faceButtons.a.windowsVirtualKeyCode, 80);");
  });

  it("mantém um exercício isolado de movimento, salto, rampa, escada e bloqueio para os Penedos", async () => {
    const source = await readFile(
      new URL("./smoke-electron-exemplo-scenes.mjs", import.meta.url),
      "utf8"
    );
    const platformerRuntimeSource = await readFile(
      new URL("../../../packages/GBAStudioEngine/examples/platformer_basic/src/main.cpp", import.meta.url),
      "utf8"
    );
    expect(source).toContain("const exercisePlatformerInputRequested = process.argv.includes(\"--exercise-platformer-input\");");
    expect(source).toContain("async function runPlatformerInputExercise(cdp, sceneName, faceButtons)");
    expect(source).toContain("a: faceButtons.a");
    expect(source).toContain("sceneName !== \"penedos_vento\"");
    expect(source).toContain('route: ["jump", "walk_right", "upper_platform_jump", "return_left"]');
    expect(source).toContain("upper_platform_jump");
    expect(source).toContain("return_left");
    expect(platformerRuntimeSource).toContain("uint32_t runtime_blocked_direction_bits = 0;");
    expect(platformerRuntimeSource).toContain("runtime_blocked_direction_bits |= player.facing");
    expect(platformerRuntimeSource).toContain("runtime_telemetry.blocked_direction_bits = runtime_blocked_direction_bits");
    expect(source).toContain("platformerInput,");
  });

  it("exercita os hotspots, diálogos e saída das cenas de apontar e clicar no Play", async () => {
    const source = await readFile(
      new URL("./smoke-electron-exemplo-scenes.mjs", import.meta.url),
      "utf8"
    );
    expect(source).toContain('const exercisePointClickInputRequested = process.argv.includes("--exercise-point-click-input");');
    expect(source).toContain("async function runPointClickInputExercise(cdp, sceneName, exportedProject, faceButtons)");
    expect(source).toContain("pointClickInput,");
  });

  it("mantém um exercício isolado de seleção, movimento em grade e ataque para a Arena Tática", async () => {
    const source = await readFile(
      new URL("./smoke-electron-exemplo-scenes.mjs", import.meta.url),
      "utf8"
    );
    const isometricRuntimeSource = await readFile(
      new URL("../../../packages/GBAStudioEngine/examples/isometric_basic/src/main.cpp", import.meta.url),
      "utf8"
    );
    expect(source).toContain("const exerciseIsometricTacticalRequested = process.argv.includes(\"--exercise-isometric-tactical\");");
    expect(source).toContain("async function runIsometricTacticalInputExercise(cdp, sceneName)");
    expect(source).toContain('sceneName !== "arena_tatica"');
    expect(source).toContain("firstActor?.visible");
    expect(source).toContain("decodeTacticalState");
    expect(source).toContain("route: [\"select\", \"move_step_1\", \"move_step_1\", \"move_step_1\", \"move_step_1\", \"move_step_1\", \"move_attack_lane\", \"attack_1\", \"attack_2\"]");
    expect(isometricRuntimeSource).toContain("uint32_t iso_tactical_telemetry_bits(");
    expect(isometricRuntimeSource).toContain("runtime_telemetry.flag_bits |= iso_tactical_telemetry_bits(tactical_state, cursor);");
    expect(isometricRuntimeSource).toContain("runtime_telemetry.first_actor_visible = actor_count > 1 && actors[1].visible ? 1 : 0;");
    expect(source).toContain("isometricTacticalInput,");
  });

  it("captures save and restored runtime telemetry in the same renderer turn", async () => {
    const source = await readFile(
      new URL("./smoke-electron-exemplo-scenes.mjs", import.meta.url),
      "utf8"
    );
    const saveLoadBody = source.match(
      /async function exercisePlayerSaveLoad[\s\S]*?\n}\n\nasync function runIntegratedSessionSoak/
    )?.[0] ?? "";

    expect(saveLoadBody).toMatch(
      /const saved = await evaluate\(playerCdp,[\s\S]*?const before = player\.inspectRuntime\(\)\?\.state \?\? null;[\s\S]*?const saveSucceeded = player\.save\(\) === true;[\s\S]*?return \{ before, saveSucceeded \};/
    );
    expect(saveLoadBody).toMatch(
      /const loaded = await evaluate\(playerCdp,[\s\S]*?const loadSucceeded = player\.load\(\) === true;[\s\S]*?const restoredState = player\.inspectRuntime\(\)\?\.state \?\? null;[\s\S]*?return \{ loadSucceeded, restoredState \};/
    );
  });

  it("exercises the Dungeon Crawler map before reopening inventory", async () => {
    const source = await readFile(
      new URL("./smoke-electron-exemplo-scenes.mjs", import.meta.url),
      "utf8"
    );
    expect(source).toContain('const select = { code: "Backspace", key: "Backspace", windowsVirtualKeyCode: 8 };');
    expect(source).toContain('const mapScreenshot = await capturePlayerScreenshot(cdp, `${sceneName}_map`);');
    expect(source).toContain("await pressPlayerButton(cdp, select.code, select.key, select.windowsVirtualKeyCode, 80);");
  });

  it("closes Play Windows through the browser target after releasing the page CDP session", async () => {
    const source = await readFile(
      new URL("./smoke-electron-exemplo-scenes.mjs", import.meta.url),
      "utf8"
    );
    expect(source).toContain('browserCdp.send("Target.closeTarget", { targetId: targetID })');
    expect(source).not.toContain('browserCdp.send("Target.closeTarget", { targetId });');
    expect(source).toContain("await closeTargetFromBrowser(playerTarget.id);");
    expect(source).not.toContain('playerCdp.send("Page.close")');
  });

  it("polls player readiness with a low-frequency CDP cadence during WebAssembly startup", async () => {
    const source = await readFile(
      new URL("./smoke-electron-exemplo-scenes.mjs", import.meta.url),
      "utf8"
    );
    const readinessBody = source.match(
      /async function waitForPlayerInputReady[\s\S]*?\n}\n\nasync function waitForRuntimeRoom/
    )?.[0] ?? "";
    expect(readinessBody).toContain("while (Date.now() < deadline)");
    expect(readinessBody).toContain("await wait(500);");
  });

  it("nao espera um load event tardio antes de capturar telas com auto-avanco", async () => {
    const source = await readFile(
      new URL("./smoke-electron-exemplo-scenes.mjs", import.meta.url),
      "utf8"
    );
    expect(source).not.toContain('playerCdp.waitForEvent("Page.loadEventFired", 30_000)');
    expect(source).toContain("await waitForPlayerInputReady(playerCdp);");
  });

  it("valida Title Screen, carrossel e Prólogo como duas transições distintas", async () => {
    const source = await readFile(
      new URL("./smoke-electron-exemplo-scenes.mjs", import.meta.url),
      "utf8"
    );
    expect(source).toContain("async function waitForRuntimeScene(cdp, runtime, targetRoom");
    expect(source).toContain('screen.name === "title_options"');
    expect(source).toContain('screen.name === "escolha_genero"');
    expect(source).toContain('screen.title === "Escolha de gênero"');
    expect(source).toContain('screen.name === "nome_jogador"');
    expect(source).toContain('const pressA = () => pressButton(faceButtons.a.code, faceButtons.a.key, faceButtons.a.windowsVirtualKeyCode)');
    expect(source).toContain('String(item?.label ?? "").trim().toLowerCase() === "confirmar"');
    expect(source).toContain('waitForRuntimeScene(playerCdp, "menu", titleOptionsRoom, 0)');
    expect(source).toContain('waitForRuntimeScene(playerCdp, "menu", genderRoom, 0)');
    expect(source).toContain('waitForRuntimeScene(playerCdp, "menu", nameRoom, nameRevealFrames + 6)');
    expect(source).toContain('waitForRuntimeScene(playerCdp, "cutscene", targetRoom');
    expect(source).toContain("titleToOptions: titleOptionsEvidence");
    expect(source).toContain("optionsToGender: genderEvidence");
    expect(source).toContain("genderToName: nameEvidence");
    expect(source).toContain("optionsToPrologue: transitionEvidence");
    expect(source).toMatch(/waitForRuntimeVariable\(\s*playerCdp,\s*characterGenderVariableIndex,\s*1/);
    expect(source).toContain('const pressBack = () => pressButton(faceButtons.b.code, faceButtons.b.key, faceButtons.b.windowsVirtualKeyCode);');
    expect(source).toContain('if (optionVisualHashes[0] === optionVisualHashes[1])');
    expect(source).toContain('if (carouselWrapHash !== optionVisualHashes[0])');
    expect(source).toContain("await pressBack();");
    expect(source).toContain("nameInputScreenshotPath = await capturePlayerScreenshot");
    expect(source).toContain("inspectSaveData?.() ?? null");
    expect(source).toContain("nameInput: nameInputScreenshotPath");
  });

  it("reconhece o runtimeKind numérico exposto pelo player direto", async () => {
    const source = await readFile(
      new URL("./smoke-electron-exemplo-scenes.mjs", import.meta.url),
      "utf8"
    );
    expect(source).toMatch(/const runtimeKindByName = Object\.freeze\(\{[\s\S]*menu: 3,[\s\S]*cutscene: 8,/);
    expect(source).toContain("const runtimeMatches = Number(runtimeState?.runtimeKind)");
    expect(source).toContain("|| activeRuntime === ${JSON.stringify(runtime)}");
  });

  it("usa o índice da tela de menu na telemetria de runtime", async () => {
    const source = await readFile(
      new URL("../../../packages/GBAStudioEngine/templates/exported_menu/main.cpp", import.meta.url),
      "utf8"
    );
    expect(source).toContain("runtime_telemetry.current_room = menu_state.screen_index;");
  });

  it("publica as variáveis numéricas do menu na telemetria do runtime", async () => {
    const source = await readFile(
      new URL("../../../packages/GBAStudioEngine/templates/exported_menu/main.cpp", import.meta.url),
      "utf8"
    );
    expect(source).toMatch(
      /void publish_menu_screen_telemetry\(\) \{[\s\S]*?volatile gbs::RuntimeTelemetryBlock& runtime_telemetry = gbs::runtime_telemetry_block\(\);[\s\S]*?for \(size_t index = 0; index < gbs::runtime_telemetry_variable_count; \+\+index\)[\s\S]*?runtime_telemetry\.variables\[index\] = event_state\.variables\[index\];/
    );
  });

  it("desativa as camadas opcionais no runtime visual novel antes de desenhar o fundo", async () => {
    const source = await readFile(
      new URL("../../../packages/GBAStudioEngine/templates/exported_visual_novel/main.cpp", import.meta.url),
      "utf8"
    );
    const initBody = source.match(
      /int initialize_visual_novel_runtime\(\) \{[\s\S]*?start_scene\(current_scene_index\);/
    )?.[0] ?? "";

    expect(initBody).toContain("gbs::set_bg_enabled(gbs::BackgroundLayer::BG2, false);");
    expect(initBody).toContain("gbs::set_bg_enabled(gbs::BackgroundLayer::BG3, false);");
  });

  it("habilita as camadas de fundo usadas pelo runtime shmup", async () => {
    const source = await readFile(
      new URL("../../../packages/GBAStudioEngine/templates/exported_shmup/main.cpp", import.meta.url),
      "utf8"
    );
    const applyBody = source.match(
      /void apply_background\(\) \{[\s\S]*?\n}\n\nconst gbs::MetaSprite\*/
    )?.[0] ?? "";

    expect(applyBody).toContain("gbs::set_bg_enabled(gbs::BackgroundLayer::BG2, false);");
    expect(applyBody).toContain("gbs::set_bg_enabled(gbs::BackgroundLayer::BG3, false);");
    expect(applyBody).toContain("gbs::set_bg_enabled(layer.layer, true);");
  });

  it("habilita a camada do cenário usado pelo runtime battle RPG", async () => {
    const source = await readFile(
      new URL("../../../packages/GBAStudioEngine/templates/exported_battle_rpg/main.cpp", import.meta.url),
      "utf8"
    );
    const applyBody = source.match(
      /void apply_battle_visuals\(const gbs::BattleRpgEncounterData& encounter\) \{[\s\S]*?\n}\n\nvoid clear_battle_meter_tiles/
    )?.[0] ?? "";

    expect(applyBody).toContain("gbs::set_bg_enabled(gbs::BackgroundLayer::BG1, false);");
    expect(applyBody).toContain("gbs::set_bg_enabled(gbs::BackgroundLayer::BG2, false);");
    expect(applyBody).toContain("gbs::set_bg_enabled(gbs::BackgroundLayer::BG3, false);");
    expect(applyBody).toContain("gbs::set_bg_enabled(background->layer, true);");
  });

  it("limpa o OAM antes de iniciar o runtime visual novel", async () => {
    const source = await readFile(
      new URL("../../../packages/GBAStudioEngine/templates/exported_visual_novel/main.cpp", import.meta.url),
      "utf8"
    );
    const initBody = source.match(
      /int initialize_visual_novel_runtime\(\) \{[\s\S]*?gbs::init_dialogue\(dialogue\);/
    )?.[0] ?? "";

    expect(initBody.indexOf("gbs::hide_all_sprites();")).toBeGreaterThan(-1);
    expect(initBody.indexOf("gbs::hide_all_sprites();")).toBeLessThan(
      initBody.indexOf("gbs::init_dialogue(dialogue);")
    );
  });

  it("configura e desenha retratos no runtime visual novel", async () => {
    const source = await readFile(
      new URL("../../../packages/GBAStudioEngine/templates/exported_visual_novel/main.cpp", import.meta.url),
      "utf8"
    );

    expect(source).toContain("void draw_dialogue_portrait()");
    expect(source).toContain("gbs::configure_dialogue_portraits(");
    expect(source).toContain("gbastudio_visual_novel_project::dialogue_portrait_assets");
    expect(source).toContain("draw_dialogue_portrait();");
  });

  it("não mascara o player placeholder em platformers sem arte de jogador", async () => {
    const source = await readFile(
      new URL("./smoke-electron-exemplo-scenes.mjs", import.meta.url),
      "utf8"
    );
    expect(source).toContain("const playerHasAuthoredVisual = runtime !== \"platformer\"");
    expect(source).toContain("room.playerActorName.trim().length > 0");
    expect(source).toContain("if (playerHasAuthoredVisual && Number.isFinite(runtimeState?.player?.x)");
  });

  it("audita platformers em camadas com o estado do framebuffer apresentado", async () => {
    const source = await readFile(
      new URL("./smoke-electron-exemplo-scenes.mjs", import.meta.url),
      "utf8"
    );
    expect(source).toContain("exactOptions.presentedRuntimeState ?? exactOptions.runtimeState");
    expect(source).toContain("presentedRuntimeState: playerEvidence.presentedRuntimeState");
    expect(source).toContain("presentedRuntimeState: playerEvidence.presentedRuntimeState,\n        romBytes");
  });

  it("usa o estado apresentado nas auditorias exatas de framebuffer isometrico", async () => {
    const source = await readFile(
      new URL("./smoke-electron-exemplo-scenes.mjs", import.meta.url),
      "utf8"
    );
    expect(source).toContain(
      "const frameRuntimeState = exactOptions?.presentedRuntimeState ?? exactOptions?.runtimeState;"
    );
    expect(source).toContain("auditIsometricRoomFramebuffer(\n      isometricCompiledTileset,");
    expect(source).toContain("frameRuntimeState,\n      exactOptions.framebufferRgbaBase64");
    expect(source).toContain("presentedRuntimeState: playerEvidence.presentedRuntimeState,\n              runtimeState");
  });

  it("fecha o diálogo da ponte isométrica por progresso antes de retomar a rota", async () => {
    const source = await readFile(
      new URL("./smoke-electron-exemplo-scenes.mjs", import.meta.url),
      "utf8"
    );
    const exerciseBody = source.match(
      /async function runIsometricInputExercise[\s\S]*?\n}\n\nasync function runBattleInputExercise/
    )?.[0] ?? "";

    expect(exerciseBody).toContain("const dismissBridgeDialogue = async () => {");
    expect(exerciseBody).toContain("const probe = buttons.down;");
    expect(exerciseBody).toContain("const bridgeDialogue = await dismissBridgeDialogue();");
    expect(exerciseBody).toContain("bridgeDismissals: bridgeDialogue.dismissals");
    expect(exerciseBody).toContain("bridgeProbe: bridgeDialogue.probe");
  });
});
