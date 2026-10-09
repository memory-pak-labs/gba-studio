import type { PluginCommandExportMapping } from "./gbaStudioPlugins.js";

export interface CompiledPluginEventCommand {
  opcode: string;
  targetKind: string;
  targetIndex: number;
  arg0: number;
  arg1: number;
  operand: string;
  rawCommand: string;
  enabled: boolean;
}

export interface CompiledPluginContractEventCommand {
  op: string;
  frames?: number;
  amount?: number;
  key?: string;
  value?: string | number | boolean;
  index?: number;
}

function commandParts(command: string): string[] {
  return command.trim().split(/\s+/).filter(Boolean);
}

function tokenValue(parts: string[], tokenIndex: number | undefined): string {
  if (tokenIndex === undefined || tokenIndex < 1) return "";
  return parts[tokenIndex] ?? "";
}

function integerToken(parts: string[], tokenIndex: number | undefined, fallback = 0): number {
  const raw = tokenValue(parts, tokenIndex);
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizedPluginOp(mapping: PluginCommandExportMapping): string {
  if (mapping.op) return mapping.op.trim().toLowerCase();
  if (!mapping.opcode) return "noop";
  return mapping.opcode
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/__/g, "_")
    .toLowerCase();
}

export function compilePluginMappedEventCommand(
  rawCommand: string,
  enabled: boolean,
  mapping: PluginCommandExportMapping,
  resolveTargetIndex: (targetKind: string, operand: string) => number
): CompiledPluginEventCommand {
  const parts = commandParts(rawCommand);
  const operand = tokenValue(parts, mapping.operandToken ?? 1);
  const targetKind = mapping.targetKind ?? "None";

  return {
    opcode: mapping.opcode ?? mapping.op?.replace(/(^|_)([a-z])/g, (_, __, letter: string) => letter.toUpperCase()) ?? "Noop",
    targetKind,
    targetIndex: resolveTargetIndex(targetKind, operand),
    arg0: integerToken(parts, mapping.arg0Token),
    arg1: integerToken(parts, mapping.arg1Token),
    operand,
    rawCommand,
    enabled
  };
}

export function compilePluginContractEventCommand(
  parts: string[],
  mapping: PluginCommandExportMapping
): CompiledPluginContractEventCommand {
  const op = normalizedPluginOp(mapping);
  const command: CompiledPluginContractEventCommand = { op };

  if (mapping.arg0Token !== undefined) {
    const value = integerToken(parts, mapping.arg0Token, 0);
    if (op === "wait") {
      command.frames = Math.max(0, Math.min(600, value));
    } else {
      command.amount = value;
    }
  }

  if (mapping.operandToken !== undefined) {
    command.key = tokenValue(parts, mapping.operandToken);
  }

  return command;
}
