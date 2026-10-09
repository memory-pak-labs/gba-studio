import { nativeEventCommandExportHandling, type NativeEventCommandExportHandling } from "./eventCommandRegistry.js";
import { eventCommandCatalog } from "./eventCommandLibrary.js";
import { eventCommandReview } from "./eventCommandReview.js";
import { isLutaEventVerb, parseLutaEventCommand, lutaEventVerbs } from "./lutaEventCommands.js";

// A product candidate remains unavailable until authoring, export and runtime are integrated.
const excluded: Record<string, string> = {
  gbvm_script: "Script GBVM pertence ao backend legado de Game Boy e não é executado pela GBAStudioEngine.",
  printer: "A impressora GB não possui contrato de transporte e runtime neste backend GBA."
};

const scoped: Record<string, string[]> = {
  draw_text:["topdown"],
  start_segment:["topdown"], stop_segment:["topdown"], set_adventure_state:["topdown"], push_actor:["topdown"],
  open_menu: ["topdown"], open_shop: ["topdown"], open_equip_menu: ["topdown"], open_code_lock: ["topdown"],
  actor_effects: ["topdown"], set_actor_animation_state: ["topdown"], cancel_actor_movement: ["topdown"],
  projectile_load_slot: ["topdown"], launch_projectile_slot: ["topdown"],
  start_game_clock: ["topdown", "platformer", "isometric"], advance_time: ["topdown", "platformer", "isometric"],
  ...Object.fromEntries(lutaEventVerbs.map(verb => [verb, ["luta"]])),
  attach_adventure_callback: ["topdown"], remove_adventure_callback: ["topdown"],
  remove_platform_callback: ["platformer"], set_platform_state: ["platformer"],
  store_save_variable: ["topdown", "platformer"], visual_effect: ["topdown", "platformer", "isometric"]
};

export interface EventCommandSupport {
  handling: NativeEventCommandExportHandling | null;
  status: "native" | "structural" | "editor-only" | "pending" | "not-applicable" | "unknown";
  /** null means that a complete per-runtime matrix has not been established. */
  runtimes: string[] | null;
  reason: string | null;
}

export function eventCommandSupport(verb: string): EventCommandSupport {
  const handling = nativeEventCommandExportHandling(verb);
  if (handling) return { handling, status: handling === "runtime" ? "native" : handling, runtimes: scoped[verb] ?? null, reason: null };
  if (excluded[verb]) return { handling: null, status: "not-applicable", runtimes: [], reason: excluded[verb]! };
  const review = eventCommandReview(verb);
  if (review) return { handling: null, status: "pending", runtimes: [], reason: review.reason };
  return { handling: null, status: "unknown", runtimes: [], reason: "Comando não registrado no backend GBA." };
}

export function buildEventCommandSupportMatrix() {
  return eventCommandCatalog.map(definition => ({
    id: definition.id, title: definition.title, commandTemplate: definition.commandTemplate,
    verb: definition.commandTemplate.split(/\s+/)[0] ?? "noop",
    ...eventCommandSupport(definition.commandTemplate.split(/\s+/)[0] ?? "noop"),
    review: eventCommandReview(definition.commandTemplate.split(/\s+/)[0] ?? "noop")
  }));
}

const adventureCallbacks = new Set(["on_interact", "interact", "interaction", "on_room_enter", "room_enter", "enter", "on_enter", "on_room_exit", "room_exit", "exit", "on_exit"]);
const platformCallbacks = new Set([
  "fallstart", "fall_start", "fallend", "fall_end", "groundstart", "ground_start", "on_land", "land", "landed",
  "groundend", "ground_end", "on_leave_ground", "leave_ground", "left_ground", "jumpstart", "jump_start", "on_jump", "jump",
  "jumpend", "jump_end", "dashstart", "dash_start", "dashready", "dash_ready", "dashend", "dash_end",
  "ladderstart", "ladder_start", "ladderend", "ladder_end", "wallstart", "wall_start", "wallend", "wall_end",
  "knockbackstart", "knockback_start", "knockbackend", "knockback_end", "blankstart", "blank_start", "blankend", "blank_end",
  "runstart", "run_start", "runend", "run_end", "floatstart", "float_start", "floatend", "float_end"
]);
export const nativeEngineReadFields = new Set(["current_scene_index", "current_room", "scene", "room", "camera_x", "camera_y", "player_x", "player_y", "plat_blank_grav", "platformer_blank_gravity"]);
export const nativePlatformStates = new Set(["fall", "ground", "jump", "dash", "ladder", "wall", "knockback", "blank", "run", "float"]);

/** Validate the newly integrated paths; existing native commands retain their own validators. */
export function eventCommandIntegrationIssue(command: string, runtime?: string): string | null {
  const parts = command.trim().split(/\s+/);
  const verb = parts[0] || "noop";
  const support = eventCommandSupport(verb);
  if (!support.handling) return `Comando ${verb} nao compila para a ROM: ${support.reason}`;
  const transitionEffect = verb === "visual_effect" && ["cover", "reveal"].includes(parts[5] ?? "");
  if (runtime && support.runtimes && !support.runtimes.includes(runtime) && !transitionEffect) {
    return `Comando ${verb} não possui consumidor em ${runtime}; use ${support.runtimes.join(" ou ")}.`;
  }
  if (isLutaEventVerb(verb)) {
    try { parseLutaEventCommand(command); } catch (error) { return error instanceof Error ? error.message : "Evento de Luta inválido."; }
  }
  const integer = (value: string | undefined, max: number) => value !== undefined && /^\d+$/.test(value) && Number(value) <= max;
  if(verb === "draw_text") {
    const text=parts.slice(4).join(" ");
    const width=Array.from(text).length;
    if(!integer(parts[1],511) || !integer(parts[2],511) || !["background","overlay"].includes(parts[3] ?? "") || !text || width>30 || (parts[3]==="overlay" && (Number(parts[1])+width>30 || Number(parts[2])>19 || width>27))) return "Texto requer X/Y em tiles, background ou overlay e até 27 caracteres no overlay (30 no fundo).";
  }
  if (verb === "start_segment" && (parts.length!==3 || !integer(parts[1],31) || !parts[2])) return "Script paralelo requer segmento 0–31 e script cadastrado.";
  if (verb === "stop_segment" && (parts.length!==2 || !integer(parts[1],31))) return "Parar script paralelo requer segmento 0–31.";
  if (verb === "set_adventure_state" && (parts.length!==2 || !["ground","dash","knockback","blank","run","push"].includes(parts[1] ?? ""))) return "Estado da Aventura inválido.";
  if (verb === "push_actor" && (parts.length!==3 || !parts[1] || !["true","false"].includes(parts[2] ?? ""))) return "Empurrar requer ator e continuar até colisão true ou false.";
  if (verb === "open_menu" && (parts.length !== 3 || !parts[1] || !parts[2])) return "Menu requer diálogo com opções e variável de resposta.";
  if (verb === "open_code_lock" && (parts.length !== 4 || !parts[1] || !integer(parts[2],4) || Number(parts[2])<1 || !integer(parts[3],9999) || Number(parts[3])>=10**Number(parts[2]))) return "Cadeado requer variável, 1–4 dígitos e código compatível.";
  if (verb === "open_equip_menu" && (parts.length !== 3 || !integer(parts[1],8) || Number(parts[1])<1 || !["true","false"].includes(parts[2] ?? ""))) return "Equipamento requer 1–8 slots e pausa true ou false.";
  if (verb === "open_shop" && (parts.length !== 2 || !parts[1])) return "Loja requer um ator.";
  if (verb === "actor_effects" && (parts.length !== 5 || !parts[1] || !["flash", "shake"].includes(parts[2] ?? "") || !integer(parts[3], 32767) || Number(parts[3]) < 1 || !integer(parts[4], 100))) return "Efeito requer ator, flash ou shake, duração positiva e intensidade 0–100.";
  if (verb === "cancel_actor_movement" && (parts.length !== 2 || !parts[1])) return "Cancelar movimento requer um ator.";
  if (verb === "set_actor_animation_state" && (parts.length !== 3 || !parts[1] || !parts[2])) return "Estado de animação requer ator e estado cadastrado.";
  if (verb === "projectile_load_slot" && (parts.length !== 5 || !integer(parts[1], 7) || !parts[2] || !integer(parts[3], 32767) || Number(parts[3]) < 1 || !integer(parts[4], 32767) || Number(parts[4]) < 1)) return "Projétil requer slot 0–7, sprite, dano e velocidade positivos.";
  if (verb === "launch_projectile_slot" && (parts.length !== 4 || !parts[1] || !integer(parts[2], 7) || !["down", "left", "right", "up", "down_left", "down_right", "up_left", "up_right"].includes(parts[3] ?? ""))) return "Lançar projétil requer ator, slot 0–7 e direção.";
  if (verb === "start_game_clock" && (parts.length !== 4 || !integer(parts[1], 1439) || Number(parts[1]) < 1 ||
    !integer(parts[2], 32767) || Number(parts[2]) < 1 || !["hud", "hidden"].includes(parts[3] ?? "")))
    return "Relógio requer minutos por tick (1–1439), quadros por tick (1–32767) e hud ou hidden.";
  if (verb === "advance_time" && (parts.length !== 2 || !/^-?\d+$/.test(parts[1] ?? "") || Math.abs(Number(parts[1])) > 32767))
    return "Avançar tempo requer minutos inteiros de -32767 a 32767.";
  if (verb === "store_engine_field" && (!nativeEngineReadFields.has(parts[1] ?? "") || !parts[2])) return "Ler campo do motor requer um campo nativo válido e uma variável de destino.";
  if (verb === "store_save_variable" && (!integer(parts[1], 7) || !parts[2])) return "Consultar save requer slot de 0 a 7 e variável de destino.";
  if (["attach_adventure_callback", "remove_adventure_callback"].includes(verb) && !adventureCallbacks.has(parts[1]?.toLowerCase() ?? "")) return "Callback de Aventura desconhecido.";
  if (verb === "attach_adventure_callback" && !parts[2]) return "Callback de Aventura requer um evento.";
  if (verb === "remove_platform_callback" && !platformCallbacks.has(parts[1]?.toLowerCase() ?? "")) return "Callback de Plataforma desconhecido.";
  if (verb === "set_platform_state" && (!nativePlatformStates.has(parts[1] ?? "") || parts.length !== 2)) return "Definir estado da Plataforma requer um estado nativo, como ground ou jump.";
  if (["pause_scene_type", "resume_scene_type"].includes(verb) && !["topdown", "platformer"].includes(parts[1] ?? "")) return "Pausa de lógica possui consumidor apenas para topdown e platformer.";
  if (verb === "idle" && !integer(parts[1], 32767)) return "Idle requer duração de 0 a 32767 quadros.";
  if (verb === "run_audio_routine" && !parts[1]) return "Rotina de áudio requer uma música compilada.";
  return null;
}
