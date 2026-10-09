import catalog from "../../default-assets/templates/blank/dialogue-defaults.json" with { type: "json" };

export const BLANK_DIALOGUE_SKIN = "neutral-dialogue-skin.png";
export const BLANK_DIALOGUE_PORTRAIT = "neutral-portrait.png";

/** Approved assets for the existing BG nine-slice / OBJ dialogue consumers. */
export function blankDialogueContent(): Record<string, unknown>[] {
  return catalog.assets.map(asset => {
    const portrait = asset.id === "neutral-portrait";
    const folder = portrait ? "portraits" : "ui";
    return {
      id: `asset-${asset.name.replace(/\.png$/, "")}`, name: asset.name,
      kind: portrait ? "Portrait" : "UI",
      systemImage: portrait ? "person.crop.square" : "rectangle.bottomthird.inset.filled",
      metadata: {
        source: `Assets/${folder}/${asset.name}`,
        bundledDefaultAsset: `template:blank/Assets/${folder}/${asset.name}`,
        frameWidth: asset.width, frameHeight: asset.height,
        runtimeConsumer: portrait ? "dialogue-portrait-obj" : asset.id === "dialogue-selector" ? "dialogue-bg-selector" : "dialogue-bg-nine-slice",
        visualProfile: "neutral-purple", colorMode: "4bpp",
        provenance: "Original purple dialogue skin and anonymous portrait explicitly approved on 2026-10-06.",
        license: "Project-owned", sourceSha256: asset.sha256
      }
    };
  });
}
