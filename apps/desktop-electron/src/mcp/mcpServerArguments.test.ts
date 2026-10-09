import { describe, expect, it } from "vitest";

import { McpServerArgumentsError, parseMcpServerArguments } from "./mcpServerArguments.js";

describe("parseMcpServerArguments", () => {
  it("reads the configured project and optional Engine Pack path", () => {
    expect(parseMcpServerArguments([
      "--project",
      "/projects/demo.gba-project",
      "--engine-pack",
      "/packs/GBAStudioEnginePack"
    ])).toEqual({
      projectPath: "/projects/demo.gba-project",
      enginePackPath: "/packs/GBAStudioEnginePack"
    });
  });

  it("requires a non-empty project path", () => {
    expect(() => parseMcpServerArguments([])).toThrow(McpServerArgumentsError);
    expect(() => parseMcpServerArguments(["--project", " "]))
      .toThrow("--project precisa receber o caminho de um arquivo .gba-project.");
  });
});
