import type { ProjectPluginRegistry } from "./gbaStudioPlugins.js";

function commandParts(command: string): string[] {
  return command.trim().split(/\s+/).filter(Boolean);
}

function tokenValue(parts: string[], tokenIndex: number | undefined): string {
  if (tokenIndex === undefined || tokenIndex < 1) return "";
  return parts[tokenIndex] ?? "";
}

export function rewritePluginPreviewCommand(command: string, registry: ProjectPluginRegistry): string | null {
  const parts = commandParts(command);
  const verb = parts[0] ?? "";
  const mapping = registry.exportMappingByVerb.get(verb);
  if (!mapping?.op) return null;

  const rewrittenParts = [mapping.op];
  if (mapping.operandToken !== undefined) {
    const operand = tokenValue(parts, mapping.operandToken);
    if (operand) rewrittenParts.push(operand);
  }
  if (mapping.arg0Token !== undefined) {
    const arg0 = tokenValue(parts, mapping.arg0Token);
    if (arg0) rewrittenParts.push(arg0);
  }
  if (mapping.arg1Token !== undefined) {
    const arg1 = tokenValue(parts, mapping.arg1Token);
    if (arg1) rewrittenParts.push(arg1);
  }

  return rewrittenParts.join(" ");
}

export function isPluginPreviewVerb(registry: ProjectPluginRegistry, verb: string): boolean {
  return registry.commandVerbs.has(verb);
}
