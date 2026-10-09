const MENU_RUNTIME_KIND = 3;
const DUNGEON_RUNTIME_KIND = 6;
const RACING_RUNTIME_KIND = 7;

function variableValue(state, index) {
  return Number(state?.variables?.[index] ?? 0);
}

export function auditCampaignReplayOutcome({
  completedState,
  continuedState,
  dungeonState,
  finishVariableIndex,
  racingCompletedState,
  rebootPerformed,
  saveDataAfterCompletion,
  saveDataBeforeContinue,
  resetTitleState
}) {
  const issues = [];
  if (Number(dungeonState?.runtimeKind) !== DUNGEON_RUNTIME_KIND) {
    issues.push("O replay nao iniciou no runtime dungeon crawler.");
  }
  if (Number(racingCompletedState?.runtimeKind) !== RACING_RUNTIME_KIND) {
    issues.push("A conclusao do dungeon nao avancou para o runtime racing.");
  }
  if (Number(completedState?.runtimeKind) !== MENU_RUNTIME_KIND) {
    issues.push("A campanha nao retornou ao menu depois do epilogo.");
  }
  if (variableValue(racingCompletedState, finishVariableIndex) !== 1) {
    issues.push("A conclusao da corrida nao marcou a variavel final.");
  }
  if (Number(resetTitleState?.runtimeKind) !== MENU_RUNTIME_KIND) {
    issues.push("O snapshot do titulo nao restaurou o menu para testar Continue.");
  }
  if (rebootPerformed !== true) {
    issues.push("O core nao foi reiniciado antes de Continue.");
  }
  if (saveDataBeforeContinue?.slot?.status !== "ok") {
    issues.push("O save persistido ficou invalido depois do reboot.");
  }
  if (saveDataAfterCompletion?.contentChecksum !== saveDataBeforeContinue?.contentChecksum) {
    issues.push("O conteudo do save mudou durante o reboot.");
  }
  if (Number(continuedState?.runtimeKind) !== RACING_RUNTIME_KIND) {
    issues.push("Continuar nao restaurou o runtime racing.");
  }
  if (variableValue(continuedState, finishVariableIndex) !== 1) {
    issues.push("Continuar nao restaurou a variavel de conclusao.");
  }
  return {
    issues,
    ok: issues.length === 0
  };
}
