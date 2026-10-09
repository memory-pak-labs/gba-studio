import type { GBAProjectData } from "./projectFile.js";

// Only numeric operands can reference a constant. Resource names and writable
// variable operands remain names, never silently substituted with numbers.
const numericOperands: Record<string, number[]> = {
  set_variable: [2], add_variable: [2], divide_variable: [2], mod_variable: [2], multiply_variable: [2],
  random_variable: [2, 3], add_variable_flags: [2], set_variable_flags: [2], clear_variable_flags: [2],
  if_variable: [2], if_variable_greater_than: [2], if_variable_less_than: [2],
  modify_wallet: [2, 3], wait: [1], set_stat: [2, 3]
};

export function constantOperandIndices(verb: string): readonly number[] {
  return numericOperands[verb] ?? [];
}

export function projectNumericConstants(data: GBAProjectData): Array<{ name: string; value: number }> {
  const entries = Array.isArray(data.constants) ? data.constants : [];
  return entries.flatMap(entry => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const item = entry as Record<string, unknown>;
    return typeof item.name === "string" && item.name.trim() && item.valueType !== "text" &&
      typeof (item.value ?? 0) === "number" && Number.isSafeInteger(item.value ?? 0) && Number(item.value ?? 0) >= -2147483648 && Number(item.value ?? 0) <= 2147483647
      ? [{ name: item.name, value: (item.value ?? 0) as number }] : [];
  });
}

export function resolveProjectConstantCommand(data: GBAProjectData, command: string): string {
  const parts = command.split(/\s+/).filter(Boolean);
  const verb = parts[0] ?? "noop";
  const entries = Array.isArray(data.constants) ? data.constants : [];
  const constants = entries.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object" && !Array.isArray(entry));
  const writableFirstOperand = /^(set_variable|add_variable|divide_variable|mod_variable|multiply_variable|random_variable|add_variable_flags|set_variable_flags|clear_variable_flags|set_flag|modify_wallet|open_text_input)$/;
  const variableOperands = writableFirstOperand.test(verb) ? [1]
    : verb === "store_actor_position" ? [2, 3]
    : ["store_actor_direction", "read_rtc"].includes(verb) ? [2]
    : ["if_variable", "if_variable_greater_than", "if_variable_less_than", "switch_variable", "set_random_seed"].includes(verb) ? [1]
    : verb === "if_variable_variable" ? [1, 2] : [];
  for (const index of variableOperands) {
    if (constants.some(item => item.name === parts[index])) {
      throw new Error(`Constante não pode ser alterada ou usada como variável: ${parts[index]}. Use const(${parts[index]}) em um valor.`);
    }
  }
  let changed = false;
  const resolved = parts.map((part, index) => {
    if (!part.startsWith("const(")) return part;
    const name = /^const\(([^\s()]+)\)$/.exec(part)?.[1];
    if (!name) throw new Error(`Referência de constante inválida: ${part}.`);
    if (!constantOperandIndices(verb).includes(index)) throw new Error(`Este argumento de ${verb} não aceita constante.`);
    const matches = constants.filter(item => item.name === name);
    if (!matches.length) throw new Error(`Constante não encontrada: ${name}.`);
    if (matches.length > 1) throw new Error(`Constante duplicada: ${name}.`);
    const item = matches[0]!;
    const value = item.value ?? 0;
    if (item.valueType === "text" || typeof value !== "number" || !Number.isSafeInteger(value) || value < -2147483648 || value > 2147483647) {
      throw new Error(`Constante deve ter um valor inteiro de 32 bits: ${name}.`);
    }
    changed = true;
    return String(value);
  });
  return changed ? resolved.join(" ") : command;
}
