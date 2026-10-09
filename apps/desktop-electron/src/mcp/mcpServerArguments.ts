export interface McpServerConfiguration {
  projectPath: string;
  enginePackPath?: string;
}

export class McpServerArgumentsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "McpServerArgumentsError";
  }
}

function optionValue(argv: string[], option: "--project" | "--engine-pack"): string | undefined {
  const index = argv.indexOf(option);
  if (index < 0) return undefined;

  const value = argv[index + 1]?.trim();
  if (!value || value.startsWith("--")) {
    throw new McpServerArgumentsError(`${option} precisa receber um caminho.`);
  }
  return value;
}

export function parseMcpServerArguments(argv: string[]): McpServerConfiguration {
  let projectPath: string | undefined;
  try {
    projectPath = optionValue(argv, "--project");
  } catch (error) {
    if (error instanceof McpServerArgumentsError) {
      throw new McpServerArgumentsError("--project precisa receber o caminho de um arquivo .gba-project.");
    }
    throw error;
  }
  if (!projectPath) {
    throw new McpServerArgumentsError("--project precisa receber o caminho de um arquivo .gba-project.");
  }

  return {
    projectPath,
    enginePackPath: optionValue(argv, "--engine-pack")
  };
}
