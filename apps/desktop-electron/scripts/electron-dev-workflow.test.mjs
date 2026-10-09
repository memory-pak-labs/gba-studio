import { describe, expect, it } from "vitest";

import { createElectronDevWorkflowPlan } from "./electron-dev-workflow.mjs";

describe("electron dev workflow", () => {
  it("creates a quick local loop with typecheck, tests and diff hygiene", () => {
    const plan = createElectronDevWorkflowPlan({ profile: "quick" });

    expect(plan.profile).toBe("quick");
    expect(plan.steps.map((step) => step.label)).toEqual([
      "Typecheck",
      "Testes Electron",
      "Higiene do diff"
    ]);
    expect(plan.steps[0]).toMatchObject({ command: "npm", args: ["run", "typecheck"] });
    expect(plan.steps[1]).toMatchObject({ command: "npm", args: ["test"] });
    expect(plan.steps[2]).toMatchObject({
      command: "git",
      args: [
        "diff",
        "--check",
        "--",
        ".",
        ":!apps/desktop-electron/static/WebPlayer/player/mgba-core.mjs"
      ]
    });
    expect(plan.steps[2].cwd).toBe(plan.repoRoot);
  });

  it("creates a readiness workflow from the existing Electron gates", () => {
    const plan = createElectronDevWorkflowPlan({ profile: "readiness" });

    expect(plan.profile).toBe("readiness");
    expect(plan.steps.map((step) => step.label)).toEqual([
      "Typecheck",
      "Testes Electron",
      "Build Electron",
      "Auditoria estrita das fontes e assets P0",
      "Smoke projeto completo GBA Studio",
      "Smoke visual responsivo",
      "Smoke ROM Engine Pack",
      "Auditoria projeto real",
      "Auditoria paridade funcional",
      "Auditoria config cross-platform",
      "Higiene do diff"
    ]);
    expect(plan.steps[1]).toMatchObject({ command: "npm", args: ["run", "test:all"] });
    expect(plan.steps.map((step) => [step.command, step.args])).toContainEqual([
      "npm",
      ["run", "smoke:exemplo-template"]
    ]);
    expect(plan.steps.map((step) => step.args)).not.toContainEqual(["run", "smoke:scene-profiles"]);
    expect(plan.steps.map((step) => step.args)).not.toContainEqual(["run", "smoke:functional-p0"]);
    expect(plan.steps.map((step) => step.args)).not.toContainEqual(["run", "smoke:preview-p0"]);
    expect(plan.steps.map((step) => [step.command, step.args])).toContainEqual([
      "npm",
      ["run", "audit:functional-parity"]
    ]);
    expect(plan.steps.map((step) => [step.command, step.args])).toContainEqual([
      "npm",
      ["run", "smoke:engine-rom"]
    ]);
    expect(plan.steps.map((step) => [step.command, step.args])).toContainEqual([
      "npm",
      ["run", "audit:real-project", "--", "--strict"]
    ]);
  });

  it("creates a reproducible verify workflow with the ROM smoke", () => {
    const plan = createElectronDevWorkflowPlan({ profile: "verify" });

    expect(plan.profile).toBe("verify");
    expect(plan.steps.map((step) => step.label)).toEqual([
      "Toolchain GBA",
      "Typecheck",
      "Testes Electron",
      "Build Electron",
      "Smoke ROM Engine Pack",
      "Higiene do diff"
    ]);
    expect(plan.steps[2]).toMatchObject({ command: "npm", args: ["run", "test:all"] });
    expect(plan.steps.map((step) => [step.command, step.args])).toContainEqual([
      "npm",
      ["run", "check:toolchain"]
    ]);
    expect(plan.steps.map((step) => [step.command, step.args])).toContainEqual([
      "npm",
      ["run", "smoke:engine-rom"]
    ]);
    expect(plan.steps.at(-1).cwd).toBe(plan.repoRoot);
  });

  it("uses the complete GBA Studio project as the global app and engine approval gate", () => {
    const plan = createElectronDevWorkflowPlan({ profile: "complete-project" });

    expect(plan.profile).toBe("complete-project");
    expect(plan.steps.map((step) => step.label)).toEqual([
      "Engine Pack completo",
      "Auditoria estrita das fontes e assets P0",
      "Testes Electron",
      "Gate acústico do projeto completo",
      "Build Electron",
      "Smoke dos workspaces no projeto completo",
      "Smoke temporal do Mercado Suspenso",
      "Smoke das cenas do projeto completo",
      "Replay comportamental da campanha (quando configurado)",
      "Higiene do diff do app",
      "Higiene do diff da engine"
    ]);
    expect(plan.steps[0]).toMatchObject({
      command: "make",
      args: ["verify-package"]
    });
    expect(plan.steps[2]).toMatchObject({ command: "npm", args: ["run", "test:all"] });
    expect(plan.steps.at(-2)).toMatchObject({
      command: "git",
      args: [
        "diff",
        "--check",
        "--",
        ".",
        ":!apps/desktop-electron/static/WebPlayer/player/mgba-core.mjs"
      ]
    });
    expect(plan.steps[0].cwd).toBe(plan.engineRoot);
    expect(plan.steps.map((step) => step.args)).toContainEqual(["run", "smoke:exemplo-template"]);
    expect(plan.steps.map((step) => step.args)).toContainEqual(["run", "smoke:isometric-market-stability"]);
    expect(plan.steps.map((step) => step.args)).toContainEqual(["run", "smoke:exemplo-scenes"]);
    expect(plan.steps.map((step) => step.args)).toContainEqual(["run", "audit:p0-sources:strict"]);
    expect(plan.steps.map((step) => step.args)).not.toContainEqual(["run", "smoke:exemplo-structural-fixture"]);
    expect(plan.steps.map((step) => step.args)).toContainEqual(["run", "gate:audio-acoustic"]);
    expect(plan.steps.flatMap((step) => step.args)).not.toContain("smoke:functional-p0");
    expect(plan.steps.flatMap((step) => step.args)).not.toContain("smoke:preview-p0");
  });

  it("rejects unknown profiles with the supported options in the message", () => {
    expect(() => createElectronDevWorkflowPlan({ profile: "slow" })).toThrow(
      "Perfil desconhecido 'slow'. Use quick, verify, readiness ou complete-project."
    );
  });
});
