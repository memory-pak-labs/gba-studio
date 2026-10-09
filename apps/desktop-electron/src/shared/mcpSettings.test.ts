import { describe, expect, it } from "vitest";

import type { GBAProjectData } from "./projectFile.js";
import {
  createCodexMcpServerRegistration,
  createMcpServerRegistration,
  isMcpEnabled,
  mcpEnginePackPath,
  mcpRegistrationEnginePackPath
} from "./mcpSettings.js";

function projectWithSettings(settings: Record<string, unknown>): GBAProjectData {
  return { settings } as GBAProjectData;
}

describe("MCP project settings", () => {
  it("reads the pack from generated configuration and handles missing or malformed registration", () => {
    const registration = createMcpServerRegistration({ appPath: "/app", executablePath: "/app/Electron", isPackaged: true, projectPath: "/projects/demo.gba-project", enginePackPath: "/engines/pack" });
    expect(mcpRegistrationEnginePackPath(registration)).toBe("/engines/pack");
    for (const value of [null, "invalid json", '{"mcpServers":{}}', '{"mcpServers":{"gba-studio":{"args":["--engine-pack"]}}}']) {
      expect(mcpRegistrationEnginePackPath(value)).toBeUndefined();
    }
  });
  it("treats MCP as disabled until the project explicitly enables it", () => {
    expect(isMcpEnabled(projectWithSettings({}))).toBe(false);
    expect(isMcpEnabled(projectWithSettings({ mcp: { enabled: false } }))).toBe(false);
    expect(isMcpEnabled(projectWithSettings({ mcp: { enabled: true } }))).toBe(true);
  });

  it("reads a configured Engine Pack path without accepting empty values", () => {
    expect(mcpEnginePackPath(projectWithSettings({ build: { enginePackPath: "  /Engines/GBA  " } }))).toBe("/Engines/GBA");
    expect(mcpEnginePackPath(projectWithSettings({ build: { enginePackPath: "  " } }))).toBeUndefined();
  });

  it("creates a packaged registration with the selected project and Engine Pack", () => {
    expect(JSON.parse(createMcpServerRegistration({
      appPath: "/Applications/GBA Studio.app",
      executablePath: "/Applications/GBA Studio.app/Contents/MacOS/GBA Studio",
      isPackaged: true,
      projectPath: "/projects/demo.gba-project",
      enginePackPath: "/engines/pack"
    }))).toEqual({
      mcpServers: {
        "gba-studio": {
          command: "/Applications/GBA Studio.app/Contents/MacOS/GBA Studio",
          args: ["--mcp", "--project", "/projects/demo.gba-project", "--engine-pack", "/engines/pack"]
        }
      }
    });
  });

  it("uses the Electron app path when the application runs from source", () => {
    expect(JSON.parse(createMcpServerRegistration({
      appPath: "/repo/apps/desktop-electron",
      executablePath: "/repo/node_modules/electron/Electron",
      isPackaged: false,
      projectPath: "/projects/demo.gba-project"
    })).mcpServers["gba-studio"]).toEqual({
      command: "/repo/node_modules/electron/Electron",
      args: ["/repo/apps/desktop-electron", "--mcp", "--project", "/projects/demo.gba-project"]
    });
  });

  it("creates a Codex config.toml registration with the read-only tool policy", () => {
    expect(createCodexMcpServerRegistration({
      appPath: "/Applications/GBA Studio.app",
      executablePath: "/Applications/GBA Studio.app/Contents/MacOS/GBA Studio",
      isPackaged: true,
      projectPath: "/projects/demo.gba-project",
      enginePackPath: "/engines/pack"
    })).toBe([
      "[mcp_servers.gba-studio]",
      "command = \"/Applications/GBA Studio.app/Contents/MacOS/GBA Studio\"",
      "args = [\"--mcp\", \"--project\", \"/projects/demo.gba-project\", \"--engine-pack\", \"/engines/pack\"]",
      "enabled = true",
      "default_tools_approval_mode = \"prompt\"",
      "startup_timeout_sec = 15",
      "tool_timeout_sec = 240",
      "enabled_tools = [\"gbs_project_summary\", \"gbs_project_diagnostics\", \"gbs_list_assets\", \"gbs_inspect_asset\", \"gbs_project_budget\"]",
      ""
    ].join("\n"));
  });
});
