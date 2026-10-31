const actorReferenceCommands = new Set([
  "set_actor_position", "move_actor_to", "teleport_actor", "move_actor", "move_actor_relative",
  "set_actor_relative_position", "set_actor_visible", "set_actor_active", "set_actor_collision_enabled",
  "launch_projectile", "set_actor_animation_speed", "set_actor_sprite", "change_actor_sprite",
  "show_actor_gesture", "set_actor_collision_box", "store_actor_position", "store_actor_direction",
  "set_actor_animation", "set_actor_animation_state", "set_actor_direction", "turn_actor",
  "set_actor_movement_speed", "push_actor_away_from_player", "wait_actor_animation",
  "play_actor_animation", "set_actor_animation_frame", "actor_effects", "cancel_actor_movement",
  "launch_projectile_slot", "if_actor_direction", "if_actor_at_position", "if_actor_distance",
  "if_actor_relative", "open_shop", "push_actor", "lantern", "reveal_area"
]);

const twoActorReferenceCommands = new Set(["if_actor_distance", "if_actor_relative"]);

/** Actor operands only, using the same quoting rules as the command compiler. */
export function actorCommandReferences(command: string, actorNames: readonly string[] = []): string[] {
  const parts = sceneChangeCommandParts(command, actorNames);
  if (!actorReferenceCommands.has(parts[0] ?? "")) return [];
  return parts.slice(1, twoActorReferenceCommands.has(parts[0]!) ? 3 : 2);
}

function hasQuotedFirstReference(verb: string): boolean {
  return verb === "change_scene" || actorReferenceCommands.has(verb);
}

function quotedOperands(value: string): string[] {
  return (value.match(/"(?:\\.|[^"\\])*"(?=\s|$)|[^\s]+/g) ?? []).map(token => {
    if (token.startsWith('"')) {
      try {
        const parsed: unknown = JSON.parse(token);
        if (typeof parsed === "string") return parsed;
      } catch { /* Preserve malformed input for reference validation. */ }
    }
    return token;
  });
}

/** Keep quoted actor/resource operands intact; free-text commands retain their own grammar. */
export function sceneChangeCommandParts(command: string, actorNames: readonly string[] = []): string[] {
  const verb = command.trim().split(/\s+/, 1)[0] ?? "";
  if (twoActorReferenceCommands.has(verb)) {
    let remainder = command.trim().slice(verb.length).trim();
    const references: string[] = [];
    const names = [...actorNames].filter(Boolean).sort((a, b) => b.length - a.length);
    for (let index = 0; index < 2; index += 1) {
      const quoted = /^("(?:\\.|[^"\\])*")(?=\s|$)/.exec(remainder);
      if (quoted) {
        try {
          const parsed: unknown = JSON.parse(quoted[1]!);
          if (typeof parsed === "string") {
            references.push(parsed);
            remainder = remainder.slice(quoted[0].length).trim();
            continue;
          }
        } catch { /* Leave malformed references for existing validation. */ }
      }
      const named = names.find((name) => remainder === name || remainder.startsWith(`${name} `));
      const token = named ?? remainder.split(/\s+/, 1)[0] ?? "";
      if (!token) break;
      references.push(token);
      remainder = remainder.slice(token.length).trim();
    }
    return [verb, ...references, ...quotedOperands(remainder)];
  }
  const match = /^\s*([^\s]+)\s+("(?:\\.|[^"\\])*")(?=\s|$)([\s\S]*)$/.exec(command);
  if (match && hasQuotedFirstReference(match[1]!)) {
    try {
      const name: unknown = JSON.parse(match[2]!);
      if (typeof name === "string") return [match[1]!, name, ...quotedOperands(match[3]!)];
    } catch {
      // Invalid quoting remains an invalid reference and is reported by validation.
    }
  }
  if (actorReferenceCommands.has(verb)) {
    const remainder = command.trim().slice(verb.length).trim();
    for (const name of [...actorNames].filter(Boolean).sort((a, b) => b.length - a.length)) {
      if (remainder === name || remainder.startsWith(`${name} `)) {
        return [verb, name, ...quotedOperands(remainder.slice(name.length))];
      }
    }
    return [verb, ...quotedOperands(remainder)];
  }
  return command.trim().split(/\s+/).filter(Boolean);
}

/** Scene, actor and actor-resource names use JSON string escaping when required. */
export function sceneChangeCommand(parts: string[]): string {
  if (!hasQuotedFirstReference(parts[0] ?? "") || !parts[1]) return parts.join(" ").trim();
  const quote = (value: string) => /[\s"\\]/.test(value) ? JSON.stringify(value) : value;
  const first = quote(parts[1]);
  const tail = parts.slice(2).map(quote);
  return [parts[0], first, ...tail].join(" ").trim();
}
