import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const CURRENT_ASSET_SOURCES: Record<string, string> = {
  "tiles/tiles_topdown_sandbox.png": "backgrounds/arena-gba.png",
  "tiles/tiles_overworld.png": "backgrounds/arena-gba.png",
  "tiles/isometric-sandbox-sheet.png": "backgrounds/tactical-v5-surface.png",
  "sprites/player_topdown_4dir.png": "sprites/nara-topdown.png",
  "sprites/player_platformer.png": "sprites/penedos-v10-nara.png",
  "sprites/player_shmup.png": "sprites/tempestade-v3-player.png",
  "sprites/actor_isometric.png": "sprites/player-pilot-32x32.png",
  "sprites/actor_point_click.png": "sprites/point-click-keeper-lantern.png",
  "sprites/cursor_point_click.png": "sprites/point-click-cursor.png",
  "sprites/projectile_shmup.png": "sprites/storm-shot.png",
  "sprites/enemy_shmup.png": "sprites/tempestade-v3-drone-horizontal.png",
  "portraits/portrait.png": "sprites/nara-portrait.png",
  "ui/dialogue_box.png": "ui/frame-lumen-v2.png",
  "ui/dialogue_selector.png": "ui/dialogue-selector-gba-v4.png",
  "fonts/gba-dialogue-font-v3.png": "fonts/gba-dialogue-font-v3.png",
  "fonts/gba-variable-font.png": "fonts/gba-dialogue-font-v3.png"
};

function canonicalAssetsRoot(appRoot: string): string {
  return path.join(appRoot, "default-assets", "templates", "exemplo-gba", "Assets");
}

function enginePackAssetPath(appRoot: string, relativePath: string): string {
  const candidates = relativePath === "audio/intro_theme.mod"
    ? [
      path.join(appRoot, "../../packages/GBAStudioEngine/build/host/assetc/test.mod"),
      path.join(appRoot, "../../packages/GBAStudioEngine/dist/GBAStudioEnginePack/assets/test.mod")
    ]
    : [
      path.join(appRoot, "../../packages/GBAStudioEngine/build/host/assetc/wav/mono_u8.wav"),
      path.join(appRoot, "../../packages/GBAStudioEngine/dist/GBAStudioEnginePack/assets/mono_u8.wav")
    ];
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0]!;
}

export function currentTechnicalAssetSourcePath(appRoot: string, relativePath: string): string | null {
  if (relativePath === "audio/intro_theme.mod" || relativePath === "audio/confirm.wav") {
    return enginePackAssetPath(appRoot, relativePath);
  }
  const source = CURRENT_ASSET_SOURCES[relativePath];
  return source ? path.join(canonicalAssetsRoot(appRoot), source) : null;
}

function generatedTechnicalAsset(relativePath: string): string | null {
  if (relativePath !== "maps/topdown_sandbox_stage1.tmx") return null;
  return `<?xml version="1.0" encoding="UTF-8"?>
<map version="1.10" tiledversion="1.10.2" orientation="orthogonal" renderorder="right-down" width="32" height="32" tilewidth="16" tileheight="16" infinite="0" nextlayerid="2" nextobjectid="1">
 <layer id="1" name="ground" width="32" height="32"><data encoding="csv">${Array.from({ length: 32 * 32 }, () => 1).join(",")}</data></layer>
</map>
`;
}

export async function copyCurrentTechnicalAsset(options: {
  appRoot: string;
  relativePath: string;
  destinationPath: string;
}): Promise<void> {
  const generated = generatedTechnicalAsset(options.relativePath);
  await mkdir(path.dirname(options.destinationPath), { recursive: true });
  if (generated !== null) {
    await writeFile(options.destinationPath, generated, "utf8");
    return;
  }

  const sourcePath = currentTechnicalAssetSourcePath(options.appRoot, options.relativePath);
  if (!sourcePath || !existsSync(sourcePath)) {
    throw new Error(`Fonte técnica canônica ausente para ${options.relativePath}: ${sourcePath ?? "não mapeada"}`);
  }
  await copyFile(sourcePath, options.destinationPath);
}
