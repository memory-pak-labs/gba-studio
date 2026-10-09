import path from "node:path";
import { inspectEnginePack } from "./enginePack.js";
import type { McpServerRegistrationInput } from "../shared/mcpSettings.js";

/** Use Play's pack discovery and an absolute path, independent of the client's cwd. */
export function createLocalMcpRegistrationInput(input: McpServerRegistrationInput): McpServerRegistrationInput {
  const selected = inspectEnginePack({ preferredPath: input.enginePackPath }).selected;
  return { ...input, enginePackPath: selected ? path.resolve(selected.path) : undefined };
}
