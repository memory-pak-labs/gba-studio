import { describe, expect, it } from "vitest";

import { auditCampaignReplayOutcome } from "./exemplo-campaign-replay-contract.mjs";

function runtimeState({
  frame,
  runtimeKind,
  finishVariable = 0
}) {
  const variables = Array.from({ length: 16 }, () => 0);
  variables[4] = finishVariable;
  return {
    frame,
    runtimeKind,
    currentRoom: 0,
    variables
  };
}

describe("campaign replay behavior contract", () => {
  it("accepts completion, reboot and Continue only when the final racing save is restored", () => {
    expect(auditCampaignReplayOutcome({
      completedState: runtimeState({ frame: 4_200, runtimeKind: 3 }),
      continuedState: runtimeState({ frame: 260, runtimeKind: 7, finishVariable: 1 }),
      dungeonState: runtimeState({ frame: 120, runtimeKind: 6 }),
      finishVariableIndex: 4,
      racingCompletedState: runtimeState({ frame: 900, runtimeKind: 7, finishVariable: 1 }),
      rebootPerformed: true,
      saveDataAfterCompletion: { contentChecksum: 123, slot: { status: "ok" } },
      saveDataBeforeContinue: { contentChecksum: 123, slot: { status: "ok" } },
      resetTitleState: runtimeState({ frame: 4_200, runtimeKind: 3 })
    })).toEqual({
      issues: [],
      ok: true
    });
  });

  it("rejects a false positive where Continue does not restore the final racing save", () => {
    expect(auditCampaignReplayOutcome({
      completedState: runtimeState({ frame: 4_200, runtimeKind: 3 }),
      continuedState: runtimeState({ frame: 260, runtimeKind: 3 }),
      dungeonState: runtimeState({ frame: 120, runtimeKind: 6 }),
      finishVariableIndex: 4,
      racingCompletedState: runtimeState({ frame: 900, runtimeKind: 7, finishVariable: 1 }),
      rebootPerformed: true,
      saveDataAfterCompletion: { contentChecksum: 123, slot: { status: "ok" } },
      saveDataBeforeContinue: { contentChecksum: 123, slot: { status: "ok" } },
      resetTitleState: runtimeState({ frame: 4_200, runtimeKind: 3 })
    })).toEqual({
      issues: [
        "Continuar nao restaurou o runtime racing.",
        "Continuar nao restaurou a variavel de conclusao."
      ],
      ok: false
    });
  });

  it("rejects a reboot that changes or corrupts the persisted save", () => {
    expect(auditCampaignReplayOutcome({
      completedState: runtimeState({ frame: 4_200, runtimeKind: 3 }),
      continuedState: runtimeState({ frame: 260, runtimeKind: 7, finishVariable: 1 }),
      dungeonState: runtimeState({ frame: 120, runtimeKind: 6 }),
      finishVariableIndex: 4,
      racingCompletedState: runtimeState({ frame: 900, runtimeKind: 7, finishVariable: 1 }),
      rebootPerformed: true,
      saveDataAfterCompletion: { contentChecksum: 123, slot: { status: "ok" } },
      saveDataBeforeContinue: { contentChecksum: 456, slot: { status: "checksum-mismatch" } },
      resetTitleState: runtimeState({ frame: 4_200, runtimeKind: 3 })
    })).toEqual({
      issues: [
        "O save persistido ficou invalido depois do reboot.",
        "O conteudo do save mudou durante o reboot."
      ],
      ok: false
    });
  });
});
