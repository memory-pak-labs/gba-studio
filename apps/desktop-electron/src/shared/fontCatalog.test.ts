import { describe, expect, it } from "vitest";
import { createBlankProjectData } from "./newProject.js";
import { deriveFontCatalog, setActiveFontInProject } from "./fontCatalog.js";

describe("fontCatalog", () => {
  it("exposes the standard profiles and project font assets without downloading external files", () => {
    const project = createBlankProjectData({ name: "Fonts" });
    const catalog = deriveFontCatalog(project);

    expect(catalog.fonts.map((font) => font.value)).toEqual(expect.arrayContaining([
      "GBA padrao",
      "GBA compacta",
      "GBA grande"
    ]));
    expect(catalog.fonts.every((font) => font.source === "builtin" || font.source === "project-asset")).toBe(true);
    expect(catalog.fonts.filter(font => font.source === "builtin" && font.ready).every(font => !font.variableWidth)).toBe(true);
  });

  it("marks a valid FONT project asset as ready and can activate it", () => {
    const project = createBlankProjectData({ name: "Imported font" });
    project.assets = [{
      name: "font-compacta.png",
      kind: "FONT",
      metadata: {
        source: "Assets/fonts/font-compacta.png",
        width: 128,
        height: 112,
        colors: 2,
        license: "CC0"
      }
    }];
    const catalog = deriveFontCatalog(project);
    const imported = catalog.fonts.find((font) => font.value === "font-compacta.png");
    const activated = setActiveFontInProject(project, "font-compacta.png");

    expect(imported).toMatchObject({ source: "project-asset", ready: true, license: "CC0" });
    expect(activated.settings).toMatchObject({ uiDialogs: { font: "font-compacta.png" } });
  });
});
