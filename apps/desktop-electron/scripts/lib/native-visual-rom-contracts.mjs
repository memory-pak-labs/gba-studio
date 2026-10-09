export function verifyNativeVisualRuntimeMain(mainCpp) {
  const requiredContracts = [
    ["load-project-assets", "load_project_assets()"],
    ["draw-room-bg", "gbs::draw_room_to_bg(gbs::BackgroundLayer::BG2"],
    ["actor-metasprite", "set_actor_metasprite("],
    ["poll-input", ["gbs::poll_input()", "gbs::begin_frame().input"]],
    ["draw-dialogue", "gbs::draw_dialogue"]
  ];
  const forbiddenContracts = [
    ["witness-runtime", "struct RuntimeWitnessState"],
    ["debug-tile-player", "tile_runtime_player"],
    ["witness-playable-scene", "void draw_playable_scene()"],
    ["debug-set-bg-tile", "gbs::set_bg_tile(gbs::BackgroundLayer::BG2, x, y, runtime_bg_width, runtime_bg_height, tile)"]
  ];

  const missingContracts = requiredContracts
    .filter(([, tokenOrTokens]) => {
      const tokens = Array.isArray(tokenOrTokens) ? tokenOrTokens : [tokenOrTokens];
      return !tokens.some((token) => mainCpp.includes(token));
    })
    .map(([name]) => name);
  const forbiddenPresent = forbiddenContracts
    .filter(([, token]) => mainCpp.includes(token))
    .map(([name]) => name);

  if (missingContracts.length > 0 || forbiddenPresent.length > 0) {
    throw new Error([
      "Runtime visual nativo ausente ou incompleto no main.cpp exportado.",
      missingContracts.length > 0 ? `Contratos ausentes: ${missingContracts.join(", ")}` : "",
      forbiddenPresent.length > 0 ? `Contratos legados proibidos: ${forbiddenPresent.join(", ")}` : ""
    ].filter(Boolean).join(" "));
  }

  return requiredContracts.map(([feature]) => feature);
}

/** Oito slots canônicos usados pelo template topdown_basic. */
export const TOPDOWN_WALK_4DIRS_CANONICAL_PREFIX = [
  "idle_down",
  "idle_right",
  "idle_up",
  "idle_left",
  "walk_down",
  "walk_right",
  "walk_up",
  "walk_left"
];

export function playerAnimationNames(exportContract) {
  const animations = exportContract?.topdown_project?.player?.animations;
  if (!Array.isArray(animations)) return [];
  return animations.map((entry) => (typeof entry?.name === "string" ? entry.name : ""));
}

/**
 * Garante idle→walk 4 dirs no contrato exportado.
 * O template seleciona direção e movimento diretamente pelos oito slots canônicos.
 */
export function verifyTopdownWalk4DirsExportContract(exportContract) {
  const names = playerAnimationNames(exportContract);
  if (names.length < TOPDOWN_WALK_4DIRS_CANONICAL_PREFIX.length) {
    throw new Error(
      `Contrato walk 4 dirs incompleto: player.animations precisa de >= ${TOPDOWN_WALK_4DIRS_CANONICAL_PREFIX.length} entradas (recebeu ${names.length}).`
    );
  }
  const prefix = names.slice(0, TOPDOWN_WALK_4DIRS_CANONICAL_PREFIX.length);
  const mismatch = TOPDOWN_WALK_4DIRS_CANONICAL_PREFIX.filter((expected, index) => prefix[index] !== expected);
  if (mismatch.length > 0) {
    throw new Error(
      `Contrato walk 4 dirs fora da ordem canônica. Esperado prefixo [${TOPDOWN_WALK_4DIRS_CANONICAL_PREFIX.join(", ")}], recebeu [${prefix.join(", ")}].`
    );
  }
  return {
    animationCount: names.length,
    canonicalPrefix: [...TOPDOWN_WALK_4DIRS_CANONICAL_PREFIX]
  };
}

export function verifyNativeVisualExportContract(exportContract) {
  const topdown = exportContract?.topdown_project;
  if (!topdown) {
    throw new Error("export_project.json sem topdown_project para runtime visual nativo.");
  }

  const missing = [];
  if (!topdown.player?.metasprite) missing.push("player.metasprite");
  if (!Array.isArray(topdown.player?.animations) || topdown.player.animations.length === 0) missing.push("player.animations");
  if (topdown.player?.emit_animation_fallback !== false) missing.push("player.emit_animation_fallback=false");
  if (!Array.isArray(topdown.rooms) || topdown.rooms.length === 0) missing.push("rooms");
  if (!topdown.rooms?.[0]?.visual_tilemap) missing.push("rooms[0].visual_tilemap");
  if (!Array.isArray(topdown.rooms?.[0]?.visual_tiles) || topdown.rooms[0].visual_tiles.length === 0) {
    missing.push("rooms[0].visual_tiles");
  }

  const assetPack = Array.isArray(exportContract?.asset_pack?.assets) ? exportContract.asset_pack.assets : [];
  if (!assetPack.some((entry) => entry?.kind === "bg")) missing.push("asset_pack.bg");
  if (!assetPack.some((entry) => entry?.kind === "obj")) missing.push("asset_pack.obj");

  const playerAssetId = typeof topdown.player?.metasprite?.asset === "string"
    ? topdown.player.metasprite.asset
    : "";
  if (!playerAssetId) {
    missing.push("player.metasprite.asset");
  } else if (!assetPack.some((entry) => entry?.kind === "obj" && (entry?.id === playerAssetId || entry?.name === playerAssetId || entry?.symbol === playerAssetId))) {
    missing.push(`asset_pack.obj:${playerAssetId}`);
  }

  const bgTilemap = topdown.rooms?.[0]?.visual_tilemap;
  if (typeof bgTilemap === "string" && bgTilemap && !assetPack.some((entry) =>
    entry?.kind === "bg" && (entry?.id === bgTilemap || entry?.name === bgTilemap || entry?.symbol === bgTilemap)
  )) {
    missing.push(`asset_pack.bg:${bgTilemap}`);
  }

  if (missing.length > 0) {
    throw new Error(`Contrato visual nativo incompleto: ${missing.join(", ")}`);
  }

  return {
    spriteAssetCount: assetPack.filter((entry) => entry?.kind === "obj").length,
    tilesetAssetCount: assetPack.filter((entry) => entry?.kind === "bg").length,
    roomCount: topdown.rooms.length,
    playerAssetId,
    emitAnimationFallback: false
  };
}
