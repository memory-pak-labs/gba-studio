import { readFileSync } from "node:fs";

export const OPENING_V4_BACKGROUND = Object.freeze({
  name: "opening-v4-per-tile-14-banks.png",
  sha256: "071905536628830df779a17d758eb4c9373baf14076612927680cb5f03d5ee74"
});

const palettePlan = JSON.parse(readFileSync(new URL(
  "../fixtures/asset-provenance/opening-v4-palette-reference-plan.json",
  import.meta.url
), "utf8"));

function openingBackgroundAsset() {
  return {
    id: "opening-v4-background",
    kind: "Background",
    name: OPENING_V4_BACKGROUND.name,
    systemImage: "sunrise",
    metadata: {
      source: `Assets/backgrounds/${OPENING_V4_BACKGROUND.name}`,
      provenance: "tools/gba-sprite-prep/production/exemplo-gba-opening-v4-candidate/SOURCES.md",
      generatedBy: "opening-v4-per-tile-14-banks",
      role: "opening-bg",
      sceneRoles: ["opening-bg"],
      profile: "menu",
      colorMode: "4bpp",
      backgroundPaletteBankBudget: 14,
      paletteBankCount: 14,
      width: 240,
      height: 160,
      tileCount: 600,
      backgroundTileOptimizer: {
        enabled: true,
        tileBudget: 1024,
        sourceTileCount: 588,
        optimizedTileCount: 588,
        maxFramebufferMismatchRatio: 0,
        totalMappingError: 0
      },
      backgroundPaletteReferencePlan: structuredClone(palettePlan),
      assetcStatus: "attention",
      assetcReviewed: true,
      technicalStatus: "isolated_scene_verified",
      technicalNote: "A preparação perdeu cores da fonte gerada e usa 224/256 entradas de paleta BG; com o plano fixo, o Play isolado preservou todos os pixels do PNG preparado.",
      reviewStatus: "approved",
      visualStatus: "approved",
      candidateStatus: "canonical-integrated",
      sourcePreserving: false,
      preparedSha256: OPENING_V4_BACKGROUND.sha256
    }
  };
}

export function promoteApprovedOpeningV4(project) {
  const originalScene = project.rooms?.find((room) => room.name === "abertura");
  if (!originalScene || originalScene.runtime?.type !== "cutscene") {
    throw new Error("Cena abertura ausente ou sem runtime cutscene");
  }
  if (!["opening-v2-background-240x160.png", "opening-v3-background-240x160.png", OPENING_V4_BACKGROUND.name]
    .includes(originalScene.backgroundAssetName)) {
    throw new Error("A abertura precisa usar um fundo da sequência de promoção ou o V4 atual");
  }
  if (!Array.isArray(originalScene.runtime.config?.steps) || originalScene.runtime.config.steps.length === 0) {
    throw new Error("A abertura precisa ter ao menos um quadro");
  }

  const scene = {
    ...originalScene,
    backgroundAssetName: OPENING_V4_BACKGROUND.name,
    runtime: {
      ...originalScene.runtime,
      config: {
        ...originalScene.runtime.config,
        steps: originalScene.runtime.config.steps.map((step) => ({
          ...step,
          ...(step.backgroundAssetName ? { backgroundAssetName: OPENING_V4_BACKGROUND.name } : {})
        }))
      }
    }
  };
  const assets = [...(project.assets ?? [])];
  const previousBackgroundIds = new Set([
    "opening-v2-background",
    "opening-v3-background",
    "opening-v4-background"
  ]);
  const oldIndex = assets.findIndex((asset) => previousBackgroundIds.has(asset.id));
  if (oldIndex < 0) throw new Error("Background da sequência não encontrado no catálogo da abertura");
  const filteredAssets = assets.filter((asset) => !previousBackgroundIds.has(asset.id));
  filteredAssets.splice(oldIndex, 0, openingBackgroundAsset());

  return {
    ...project,
    assets: filteredAssets,
    rooms: project.rooms.map((room) => room.name === "abertura" ? scene : room),
    scenas: project.scenas.map((room) => room.name === "abertura" ? structuredClone(scene) : room)
  };
}
