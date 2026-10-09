const expectedRuntimes = [
  "menu",
  "topdown",
  "platformer",
  "isometric",
  "dungeon_crawler",
  "racing",
  "point_click",
  "shmup",
  "cutscene",
  "visual_novel",
  "world_map",
  "battle_rpg",
  "luta"
];

export function activeBuildRomPaths(files) {
  return files.filter((file) => file.endsWith(".gba") && !file.split(/[\\/]/).includes(".gba-cache"));
}

export function fullProjectRuntimeEvidence(contract) {
  const dispatch = contract?.runtime_dispatch;
  const runtimes = Array.isArray(dispatch?.runtimes) ? dispatch.runtimes : [];
  const hasEveryRuntime = expectedRuntimes.every((runtime) => runtimes.includes(runtime));
  if (contract?.kind !== "mixed" || runtimes.length !== expectedRuntimes.length || !hasEveryRuntime) {
    throw new Error("O smoke deve compilar o projeto completo com todos os runtimes na mesma ROM.");
  }
  if (dispatch.initial_runtime !== "cutscene" || dispatch.initial_scene !== "logo" || dispatch.initial_room < 0) {
    throw new Error("O smoke deve iniciar pela Cena Logo do Vértice no projeto completo.");
  }
  return Object.freeze({
    kind: contract.kind,
    initialRuntime: dispatch.initial_runtime,
    initialRoom: dispatch.initial_room,
    initialScene: dispatch.initial_scene,
    runtimes: [...runtimes]
  });
}
