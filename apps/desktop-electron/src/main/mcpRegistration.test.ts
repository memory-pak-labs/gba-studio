import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createLocalMcpRegistrationInput } from "./mcpRegistration.js";
import { inspectEnginePack } from "./enginePack.js";
import { createCodexMcpServerRegistration, createMcpServerRegistration } from "../shared/mcpSettings.js";

vi.mock("./enginePack.js", () => ({ inspectEnginePack: vi.fn() }));
const input = { appPath: "/repo/apps/desktop-electron", executablePath: "/app/Electron", isPackaged: false, projectPath: "/projects/demo.gba-project", enginePackPath: "GBAStudioEnginePack" };

beforeEach(() => vi.clearAllMocks());
describe("local MCP registration", () => {
  it("uses the same detected pack as Play, instead of an unresolved project label", () => {
    vi.mocked(inspectEnginePack).mockReturnValue({ selected: { path: "/repo/engine/pack" } } as ReturnType<typeof inspectEnginePack>);
    const resolved = createLocalMcpRegistrationInput(input);
    expect(inspectEnginePack).toHaveBeenCalledWith({ preferredPath: "GBAStudioEnginePack" });
    expect(resolved.enginePackPath).toBe("/repo/engine/pack");
    expect(JSON.parse(createMcpServerRegistration(resolved)).mcpServers["gba-studio"].args).toContain("/repo/engine/pack");
    expect(createCodexMcpServerRegistration(resolved)).toContain('"--engine-pack", "/repo/engine/pack"');
  });
  it("normalizes detected relative paths to avoid dependence on the MCP client's cwd", () => {
    vi.mocked(inspectEnginePack).mockReturnValue({ selected: { path: "engine/pack" } } as ReturnType<typeof inspectEnginePack>);
    expect(createLocalMcpRegistrationInput(input).enginePackPath).toBe(path.resolve("engine/pack"));
  });
  it("omits an unavailable pack while retaining read-only project tools", () => {
    vi.mocked(inspectEnginePack).mockReturnValue({} as ReturnType<typeof inspectEnginePack>);
    const resolved = createLocalMcpRegistrationInput(input);
    expect(resolved.enginePackPath).toBeUndefined();
    expect(JSON.parse(createMcpServerRegistration(resolved)).mcpServers["gba-studio"].args).not.toContain("--engine-pack");
  });
});
