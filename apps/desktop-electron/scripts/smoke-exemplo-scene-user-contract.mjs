/**
 * Prepara uma cópia efêmera do projeto para reproduzir o fluxo de um usuário
 * final. O smoke nunca deve mutar o template canônico em disco.
 */
export function buildUserScenePlayProject(project) {
  if (!project || typeof project !== "object" || Array.isArray(project)) {
    throw new Error("O projeto do smoke precisa ser um objeto JSON.");
  }

  const settings = project.settings && typeof project.settings === "object" && !Array.isArray(project.settings)
    ? project.settings
    : {};
  const debug = settings.debug && typeof settings.debug === "object" && !Array.isArray(settings.debug)
    ? settings.debug
    : {};

  return {
    ...project,
    settings: {
      ...settings,
      debug: {
        ...debug,
        developerMode: false
      }
    }
  };
}

export function assertUserScenePlayProject(project) {
  if (project?.settings?.debug?.developerMode !== false) {
    throw new Error("O projeto efêmero precisa iniciar com debug.developerMode=false.");
  }
  return project;
}

export function auditUserScenePlayEvidence({
  childEvidence,
  childExitCode,
  exerciseBattleInput = false,
  project,
  runAll,
  sceneName
}) {
  const expectedSceneNames = Array.isArray(project?.scenas)
    ? project.scenas.map((scene) => scene?.name).filter((name) => typeof name === "string")
    : [];
  const results = Array.isArray(childEvidence?.results) ? childEvidence.results : [];
  const sceneResults = runAll
    ? results
    : results.filter((result) => result?.name === sceneName);
  const runtimeFrames = sceneResults.map((result) => Number(result?.runtimeState?.frame ?? 0));
  const selectedAllScenes = runAll
    ? childEvidence?.requestedSceneName == null
      && results.length === expectedSceneNames.length
      && expectedSceneNames.every((name, index) => results[index]?.name === name)
    : childEvidence?.requestedSceneName === sceneName
      && sceneResults.length === 1;

  const checks = {
    childSmokePassed: childEvidence?.ok === true,
    developerModeDisabled: project?.settings?.debug?.developerMode === false,
    playWindowsOpened: sceneResults.length > 0
      && sceneResults.every((result) => typeof result?.playerUrl === "string"
        && result.playerUrl.includes("/player/runtime.html")),
    requestedSceneSelected: selectedAllScenes,
    runtimeAdvanced: sceneResults.length > 0 && runtimeFrames.every((frame) => frame >= 8),
    sceneAuditsPassed: childEvidence?.audit?.ok === true,
    battleInputPassed: !exerciseBattleInput
      || (sceneResults.length > 0 && sceneResults.every((result) => result?.battleInput?.ok === true)),
    playWindowsClosed: childExitCode === 0
  };

  return {
    checks,
    runtimeFrames,
    sceneNames: sceneResults.map((result) => result?.name).filter((name) => typeof name === "string")
  };
}
