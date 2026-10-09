import { describe, expect, it } from "vitest";
import { droppedProjectPath } from "./dropProject.js";

describe("dropped project path", () => {
  it("returns the first dropped GBA Studio project path", () => {
    expect(droppedProjectPath([
      { name: "notes.txt", path: "/tmp/notes.txt" },
      { name: "Demo.gba-project", path: "/tmp/Demo.gba-project" }
    ])).toBe("/tmp/Demo.gba-project");
  });

  it("accepts legacy .gbastudio project files", () => {
    expect(droppedProjectPath([{ name: "Legacy.gbastudio", path: "/tmp/Legacy.gbastudio" }])).toBe("/tmp/Legacy.gbastudio");
  });

  it("accepts GB Studio .gbsproj files for conversion", () => {
    expect(droppedProjectPath([{ name: "Source.gbsproj", path: "/tmp/Source.gbsproj" }])).toBe("/tmp/Source.gbsproj");
  });

  it("ignores files without a project extension or path", () => {
    expect(droppedProjectPath([
      { name: "tiles.png", path: "/tmp/tiles.png" },
      { name: "missing.gba-project" }
    ])).toBeNull();
  });
});
