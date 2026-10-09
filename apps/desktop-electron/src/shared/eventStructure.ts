export interface EventStructureStep {
  command: string;
  isEnabled: boolean;
}

export interface EventStructureDiagnostic {
  index: number;
  message: string;
}

export interface EventStructureSequence {
  kind: "sequence";
  children: EventStructureNode[];
  startIndex: number;
  endIndex: number;
}

export interface EventStructureStepNode {
  kind: "step";
  index: number;
  step: EventStructureStep;
}

export interface EventStructureConditionNode {
  kind: "condition";
  index: number;
  command: string;
  trueBranch: EventStructureSequence;
  falseBranch: EventStructureSequence | null;
  elseIndex: number | null;
  endIndex: number | null;
}

export interface EventStructureRateLimitNode {
  kind: "rateLimit";
  index: number;
  command: string;
  frames: number;
  slot: number;
  body: EventStructureSequence;
  endIndex: number | null;
}

export type EventStructureNode = EventStructureStepNode | EventStructureConditionNode | EventStructureRateLimitNode;

export interface EventStructure {
  root: EventStructureSequence;
  diagnostics: EventStructureDiagnostic[];
}

export type EventStructureInsertionTarget =
  | { kind: "root" }
  | { kind: "trueBranch"; conditionIndex: number }
  | { kind: "falseBranch"; conditionIndex: number };

const conditionVerbs = new Set([
  "has_item",
  "if_actor_at_position",
  "if_actor_direction",
  "if_actor_distance",
  "if_actor_relative",
  "if_button",
  "if_engine_field",
  "if_engine_field_variable",
  "if_flag",
  "if_save_game",
  "if_scene",
  "if_variable",
  "if_variable_greater_than",
  "if_variable_less_than",
  "if_variable_variable"
]);

function commandVerb(command: string): string {
  return command.trim().split(/\s+/)[0] ?? "";
}

function enabledStep(command: string): EventStructureStep {
  return { command: command.trim() || "noop", isEnabled: true };
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function boundedSlot(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(31, parsed)) : fallback;
}

interface ParseResult {
  sequence: EventStructureSequence;
  cursor: number;
  terminator: "else" | "condition_end" | "rate_limit_end" | null;
}

function parseSequence(
  steps: EventStructureStep[],
  diagnostics: EventStructureDiagnostic[],
  startIndex: number,
  terminators: ReadonlySet<string>
): ParseResult {
  const children: EventStructureNode[] = [];
  let cursor = startIndex;

  while (cursor < steps.length) {
    const step = steps[cursor]!;
    const verb = commandVerb(step.command);
    if (terminators.has(verb)) {
      return {
        sequence: { kind: "sequence", children, startIndex, endIndex: cursor },
        cursor,
        terminator: verb as ParseResult["terminator"]
      };
    }

    if (verb === "else") {
      diagnostics.push({ index: cursor, message: "else sem condição aberta." });
      cursor += 1;
      continue;
    }

    if (verb === "condition_end") {
      diagnostics.push({ index: cursor, message: "condition_end sem condição aberta." });
      cursor += 1;
      continue;
    }

    if (verb === "rate_limit_end") {
      diagnostics.push({ index: cursor, message: "rate_limit_end sem bloco rate_limit aberto." });
      cursor += 1;
      continue;
    }

    if (conditionVerbs.has(verb)) {
      const trueResult = parseSequence(steps, diagnostics, cursor + 1, new Set(["else", "condition_end"]));
      let falseBranch: EventStructureSequence | null = null;
      let elseIndex: number | null = null;
      let endIndex: number | null = null;
      let nextCursor = trueResult.cursor;

      if (trueResult.terminator === "else") {
        elseIndex = trueResult.cursor;
        const falseResult = parseSequence(steps, diagnostics, trueResult.cursor + 1, new Set(["condition_end"]));
        falseBranch = falseResult.sequence;
        nextCursor = falseResult.cursor;
        if (falseResult.terminator === "condition_end") {
          endIndex = falseResult.cursor;
          nextCursor += 1;
        } else {
          diagnostics.push({ index: cursor, message: "condition_end ausente para condição." });
          nextCursor = steps.length;
        }
      } else if (trueResult.terminator === "condition_end") {
        endIndex = trueResult.cursor;
        nextCursor += 1;
      } else {
        diagnostics.push({ index: cursor, message: "condition_end ausente para condição." });
        nextCursor = steps.length;
      }

      children.push({
        kind: "condition",
        index: cursor,
        command: step.command,
        trueBranch: trueResult.sequence,
        falseBranch,
        elseIndex,
        endIndex
      });
      cursor = nextCursor;
      continue;
    }

    if (verb === "rate_limit") {
      const parts = step.command.trim().split(/\s+/);
      const bodyResult = parseSequence(steps, diagnostics, cursor + 1, new Set(["rate_limit_end"]));
      const endIndex = bodyResult.terminator === "rate_limit_end" ? bodyResult.cursor : null;
      if (endIndex === null) {
        diagnostics.push({ index: cursor, message: "rate_limit_end ausente para bloco rate_limit." });
      }
      children.push({
        kind: "rateLimit",
        index: cursor,
        command: step.command,
        frames: positiveInteger(parts[1], 1),
        slot: boundedSlot(parts[2], cursor % 32),
        body: bodyResult.sequence,
        endIndex
      });
      cursor = endIndex === null ? steps.length : endIndex + 1;
      continue;
    }

    children.push({ kind: "step", index: cursor, step });
    cursor += 1;
  }

  return {
    sequence: { kind: "sequence", children, startIndex, endIndex: cursor },
    cursor,
    terminator: null
  };
}

export function deriveEventStructure(steps: EventStructureStep[]): EventStructure {
  const diagnostics: EventStructureDiagnostic[] = [];
  const parsed = parseSequence(steps, diagnostics, 0, new Set());
  return { root: parsed.sequence, diagnostics };
}

function findCondition(nodes: EventStructureNode[], conditionIndex: number): EventStructureConditionNode | null {
  for (const node of nodes) {
    if (node.kind === "condition") {
      if (node.index === conditionIndex) return node;
      const nested = findCondition(node.trueBranch.children, conditionIndex)
        ?? (node.falseBranch ? findCondition(node.falseBranch.children, conditionIndex) : null);
      if (nested) return nested;
    }
    if (node.kind === "rateLimit") {
      const nested = findCondition(node.body.children, conditionIndex);
      if (nested) return nested;
    }
  }
  return null;
}

export function insertEventStructureCommands(
  steps: EventStructureStep[],
  target: EventStructureInsertionTarget,
  commands: string[]
): EventStructureStep[] {
  const inserted = commands.map(enabledStep);
  if (inserted.length === 0) return steps;
  if (target.kind === "root") return [...steps, ...inserted];

  const condition = findCondition(deriveEventStructure(steps).root.children, target.conditionIndex);
  if (!condition || condition.endIndex === null) return steps;
  if (target.kind === "trueBranch") {
    return [...steps.slice(0, condition.trueBranch.endIndex), ...inserted, ...steps.slice(condition.trueBranch.endIndex)];
  }
  if (condition.falseBranch) {
    return [...steps.slice(0, condition.falseBranch.endIndex), ...inserted, ...steps.slice(condition.falseBranch.endIndex)];
  }
  return [
    ...steps.slice(0, condition.endIndex),
    enabledStep("else"),
    ...inserted,
    ...steps.slice(condition.endIndex)
  ];
}

export function setEventUpdateFrequency(
  steps: EventStructureStep[],
  frames: number,
  slot: number
): EventStructureStep[] {
  const safeFrames = Math.max(1, Math.floor(frames));
  const safeSlot = Math.max(0, Math.min(31, Math.floor(slot)));
  const structure = deriveEventStructure(steps);
  const existingRateLimit = structure.root.children[0];
  if (existingRateLimit?.kind === "rateLimit" && existingRateLimit.endIndex !== null) {
    return steps.map((step, index) => index === existingRateLimit.index
      ? { ...step, command: `rate_limit ${safeFrames} ${safeSlot}` }
      : step);
  }
  return [enabledStep(`rate_limit ${safeFrames} ${safeSlot}`), ...steps, enabledStep("rate_limit_end")];
}
