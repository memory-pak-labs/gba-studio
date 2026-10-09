const currentExampleAsset = (relativePath: string) => new URL(
  `../../default-assets/templates/exemplo-gba/Assets/${relativePath}`,
  import.meta.url
).href;

// Legacy logical IDs resolve to current template assets while a new project is
// still unsaved. Keep these aliases pointed at the current manifest; never
// resurrect the old bundled default-art files through preview fallbacks.
const bundledDefaultAssetURLs: Record<string, string> = {
  "dialogue-box": currentExampleAsset("ui/frame-lumen-v2.png"),
  "dialogue-portrait": currentExampleAsset("sprites/nara-portrait.png"),
  "dialogue-selector": currentExampleAsset("ui/dialogue-selector-gba-v4.png"),
  "isometric-sandbox-tiles": currentExampleAsset("backgrounds/tactical-v5-surface.png"),
  "point-click-actor": currentExampleAsset("sprites/point-click-keeper-lantern.png"),
  "point-click-cursor": currentExampleAsset("sprites/point-click-cursor.png"),
  "platformer-player": currentExampleAsset("sprites/penedos-v10-nara.png"),
  "isometric-actor": currentExampleAsset("sprites/player-pilot-32x32.png"),
  "shmup-player": currentExampleAsset("sprites/tempestade-v3-player.png"),
  "shmup-projectile": currentExampleAsset("sprites/storm-shot.png"),
  "shmup-enemy": currentExampleAsset("sprites/tempestade-v3-drone-horizontal.png"),
  "topdown-player-4dir": currentExampleAsset("sprites/nara-topdown.png")
};

const TEMPLATE_BUNDLE_PREFIX = "template:";
export const desktopAssetProtocol = "gba-asset";

export function isDesktopAssetURL(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(`${desktopAssetProtocol}:`);
}

export function desktopAssetURL(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  return `${desktopAssetProtocol}://asset?path=${encodeURIComponent(normalized)}`;
}

export function parseDesktopAssetURL(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== `${desktopAssetProtocol}:`) return null;
    const filePath = url.searchParams.get("path")?.trim();
    return filePath || null;
  } catch {
    return null;
  }
}

function localFileURL(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  const encoded = normalized
    .split("/")
    .map((part, index) => (index === 0 && part === "" ? "" : encodeURIComponent(part)))
    .join("/");
  if (/^[A-Za-z]:\//.test(normalized)) {
    return `file:///${encoded}`;
  }

  return `file://${encoded.startsWith("/") ? "" : "/"}${encoded}`;
}

function developmentAssetURL(filePath: string): string | null {
  if (typeof window === "undefined" || window.location.protocol === "file:") return null;

  return desktopAssetURL(filePath);
}

function resolveTemplateBundledDefaultAssetURL(bundledDefaultAsset: string): string | null {
  if (!bundledDefaultAsset.startsWith(TEMPLATE_BUNDLE_PREFIX)) return null;

  const relativeTemplatePath = bundledDefaultAsset
    .slice(TEMPLATE_BUNDLE_PREFIX.length)
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");

  if (!relativeTemplatePath) return null;
  const segments = relativeTemplatePath.split("/");
  if (segments.includes("..") || segments.includes(".")) {
    return null;
  }

  return new URL(`../../default-assets/templates/${segments.join("/")}`, import.meta.url).href;
}

export function resolveAssetURL(
  projectPath: string | undefined,
  source: string | null,
  bundledDefaultAsset?: string | null
): string | null {
  const bundledURL = bundledDefaultAsset
    ? bundledDefaultAssetURLs[bundledDefaultAsset] ?? resolveTemplateBundledDefaultAssetURL(bundledDefaultAsset)
    : null;
  if (!source || !projectPath) return bundledURL;

  const normalizedSource = source.replace(/\\/g, "/");
  if (normalizedSource.startsWith("/") || /^[A-Za-z]:\//.test(normalizedSource)) {
    return developmentAssetURL(normalizedSource) ?? localFileURL(normalizedSource);
  }

  const normalizedProjectPath = projectPath.replace(/\\/g, "/");
  const directory = normalizedProjectPath.split("/").slice(0, -1).join("/");
  const projectAssetPath = directory ? `${directory}/${normalizedSource}` : normalizedSource;
  return developmentAssetURL(projectAssetPath) ?? localFileURL(projectAssetPath);
}

export function resolveAssetURLWithBundledDefault(
  projectPath: string | undefined,
  source: string | null,
  bundledDefaultAsset?: string | null
): string | null {
  const bundledURL = bundledDefaultAsset ? bundledDefaultAssetURLs[bundledDefaultAsset] ?? null : null;
  return resolveAssetURL(projectPath, source, bundledDefaultAsset) ?? bundledURL;
}

export function resolveSpriteAssetURL(
  projectPath: string | undefined,
  source: string | null,
  bundledDefaultAsset?: string | null
): string | null {
  return resolveAssetURL(projectPath, source, bundledDefaultAsset);
}

export function runtimeAssetCacheKey(asset: {
  bundledDefaultAsset?: string | null;
  name?: string;
  source?: string | null;
} | null | undefined): string | null {
  if (!asset) return null;
  return asset.source ?? asset.bundledDefaultAsset ?? asset.name ?? null;
}
