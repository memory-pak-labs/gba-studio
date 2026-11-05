import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { promoteApprovedBookMenus } from "./book-menus-promotion.mjs";
import { promoteExemploGBStudioSceneTypes } from "./exemplo-gba-scene-types.mjs";

const template = new URL("../default-assets/templates/exemplo-gba/", import.meta.url);
const project = JSON.parse(readFileSync(new URL("exemplo-gba.gba-project", template), "utf8"));
const bookManifest = JSON.parse(readFileSync(new URL("../fixtures/asset-provenance/book-menu-manifest.json", import.meta.url), "utf8"));
const digest = (source) => createHash("sha256").update(readFileSync(new URL(source, template))).digest("hex");

describe("dialogue selector attribution", () => {
  it("keeps both uses attributed to the project owner under the recorded MIT grant", () => {
    const dialogue = project.assets.find((asset) => asset.id === "asset-dialogue-selector-gba-v4");
    const book = project.assets.find((asset) => asset.id === "book-menu-book-cursor");
    const expected = "4dbeabbb353282be052bdc6e28c417a6005c160d96f0c9802ff652f079c7ce69";
    expect(digest(dialogue.metadata.source)).toBe(expected);
    expect(digest(book.metadata.source)).toBe(expected);
    for (const asset of [dialogue, book]) {
      expect(asset.metadata).toMatchObject({ license: "MIT", author: "GBA Studio project owner" });
    }
    expect(bookManifest.assets["book-cursor"]).toMatchObject({
      sha256: expected,
      license: "MIT",
      author: "GBA Studio project owner"
    });
  });

  it("preserves attribution when the example or book menus are regenerated", () => {
    const dialogue = promoteExemploGBStudioSceneTypes(project).assets.find((asset) => asset.id === "asset-dialogue-selector-gba-v4");
    const book = promoteApprovedBookMenus(project).assets.find((asset) => asset.id === "book-menu-book-cursor");
    expect(dialogue.metadata).toMatchObject({ license: "MIT", author: "GBA Studio project owner" });
    expect(book.metadata).toMatchObject({ license: "MIT", author: "GBA Studio project owner" });
  });
});
