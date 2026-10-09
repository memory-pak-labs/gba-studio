import type { GBAProjectData } from "./projectFile.js";

export interface McpServerRegistrationInput {
  appPath: string;
  executablePath: string;
  isPackaged: boolean;
  projectPath: string;
  enginePackPath?: string;
}

const MCP_V1_TOOL_NAMES = [
  "gbs_project_summary",
  "gbs_project_diagnostics",
  "gbs_list_assets",
  "gbs_inspect_asset",
  "gbs_project_budget"
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function settingsSection(data: GBAProjectData, key: string): Record<string, unknown> | undefined {
  if (!isRecord(data.settings)) return undefined;
  const value = data.settings[key];
  return isRecord(value) ? value : undefined;
}

export function isMcpEnabled(data: GBAProjectData): boolean {
  return settingsSection(data, "mcp")?.enabled === true;
}

export function mcpEnginePackPath(data: GBAProjectData): string | undefined {
  const value = settingsSection(data, "build")?.enginePackPath;
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function mcpRegistrationEnginePackPath(registration: string | null): string | undefined {
  if (!registration) return undefined;
  try {
    const parsed: unknown = JSON.parse(registration);
    if (!isRecord(parsed) || !isRecord(parsed.mcpServers)) return undefined;
    const server = parsed.mcpServers["gba-studio"];
    if (!isRecord(server) || !Array.isArray(server.args)) return undefined;
    const index = server.args.indexOf("--engine-pack");
    const value: unknown = index >= 0 ? server.args[index + 1] : undefined;
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
  } catch {
    return undefined;
  }
}

function mcpServerArgs(input: McpServerRegistrationInput): string[] {
  const args = input.isPackaged ? [] : [input.appPath];
  args.push("--mcp", "--project", input.projectPath);
  if (input.enginePackPath) args.push("--engine-pack", input.enginePackPath);
  return args;
}

function tomlArray(values: readonly string[]): string {
  return `[${values.map((value) => JSON.stringify(value)).join(", ")}]`;
}

export function createMcpServerRegistration(input: McpServerRegistrationInput): string {
  return JSON.stringify({
    mcpServers: {
      "gba-studio": {
        command: input.executablePath,
        args: mcpServerArgs(input)
      }
    }
  }, null, 2);
}

export function createCodexMcpServerRegistration(input: McpServerRegistrationInput): string {
  const args = mcpServerArgs(input);
  return [
    "[mcp_servers.gba-studio]",
    `command = ${JSON.stringify(input.executablePath)}`,
    `args = ${tomlArray(args)}`,
    "enabled = true",
    "default_tools_approval_mode = \"prompt\"",
    "startup_timeout_sec = 15",
    "tool_timeout_sec = 240",
    `enabled_tools = ${tomlArray(MCP_V1_TOOL_NAMES)}`,
    ""
  ].join("\n");
}
