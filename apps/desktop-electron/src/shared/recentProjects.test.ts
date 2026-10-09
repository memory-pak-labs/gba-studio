import { describe, expect, it } from "vitest";

import {
  dedupeRecentProjectPaths,
  isGbaProjectPath,
  recentProjectNameFromPath,
  toRecentProjectEntries
} from "./recentProjects.js";

describe("recentProjects", () => {
  it("accepts only .gba-project paths", () => {
    expect(isGbaProjectPath("/tmp/demo/demo.gba-project")).toBe(true);
    expect(isGbaProjectPath("/tmp/demo/readme.txt")).toBe(false);
  });

  it("derives display names from project file paths", () => {
    expect(recentProjectNameFromPath("/tmp/meu_jogo/meu_jogo.gba-project")).toBe("meu_jogo");
  });

  it("dedupes and filters recent project paths", () => {
    expect(
      dedupeRecentProjectPaths([
        "/tmp/a/a.gba-project",
        "/tmp/b/readme.txt",
        "/tmp/a/a.gba-project",
        " /tmp/c/c.gba-project "
      ])
    ).toEqual(["/tmp/a/a.gba-project", "/tmp/c/c.gba-project"]);
  });

  it("maps recent paths to entries", () => {
    expect(
      toRecentProjectEntries([
        "/tmp/a/a.gba-project",
        "/tmp/b/readme.txt"
      ])
    ).toEqual([
      { path: "/tmp/a/a.gba-project", name: "a" }
    ]);
  });
});
