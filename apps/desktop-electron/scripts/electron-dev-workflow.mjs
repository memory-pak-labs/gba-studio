#!/usr/bin/env node
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  inspectGbaToolchain,
  resolveToolchainEnvironment
} from "./check-gba-toolchain.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const appRoot = path.resolve(path.dirname(scriptPath), "..");
const repoRoot = path.resolve(appRoot, "../..");
const engineRoot = path.join(repoRoot, "packages", "GBAStudioEngine");
const appDiffCheckArgs = [
  "diff",
  "--check",
  "--",
  ".",
  ":!apps/desktop-electron/static/WebPlayer/player/mgba-core.mjs"
];

const profiles = {
  quick: [
    {
      label: "Typecheck",
      command: "npm",
      args: ["run", "typecheck"]
    },
    {
      label: "Testes Electron",
      command: "npm",
      args: ["test"]
    },
    {
      label: "Higiene do diff",
      command: "git",
      args: appDiffCheckArgs,
      cwd: repoRoot
    }
  ],
  verify: [
    {
      label: "Toolchain GBA",
      command: "npm",
      args: ["run", "check:toolchain"]
    },
    {
      label: "Typecheck",
      command: "npm",
      args: ["run", "typecheck"]
    },
    {
      label: "Testes Electron",
      command: "npm",
      args: ["run", "test:all"]
    },
    {
      label: "Build Electron",
      command: "npm",
      args: ["run", "build"]
    },
    {
      label: "Smoke ROM Engine Pack",
      command: "npm",
      args: ["run", "smoke:engine-rom"]
    },
    {
      label: "Higiene do diff",
      command: "git",
      args: appDiffCheckArgs,
      cwd: repoRoot
    }
  ],
  readiness: [
    {
      label: "Typecheck",
      command: "npm",
      args: ["run", "typecheck"]
    },
    {
      label: "Testes Electron",
      command: "npm",
      args: ["run", "test:all"]
    },
    {
      label: "Build Electron",
      command: "npm",
      args: ["run", "build"]
    },
    {
      label: "Auditoria estrita das fontes e assets P0",
      command: "npm",
      args: ["run", "audit:p0-sources:strict"]
    },
    {
      label: "Smoke projeto completo GBA Studio",
      command: "npm",
      args: ["run", "smoke:exemplo-template"]
    },
    {
      label: "Smoke visual responsivo",
      command: "npm",
      args: ["run", "smoke:visual:responsive"]
    },
    {
      label: "Smoke ROM Engine Pack",
      command: "npm",
      args: ["run", "smoke:engine-rom"]
    },
    {
      label: "Auditoria projeto real",
      command: "npm",
      args: ["run", "audit:real-project", "--", "--strict"]
    },
    {
      label: "Auditoria paridade funcional",
      command: "npm",
      args: ["run", "audit:functional-parity"]
    },
    {
      label: "Auditoria config cross-platform",
      command: "npm",
      args: ["run", "audit:cross-platform"]
    },
    {
      label: "Higiene do diff",
      command: "git",
      args: appDiffCheckArgs,
      cwd: repoRoot
    }
  ],
  "complete-project": [
    {
      label: "Engine Pack completo",
      command: "make",
      args: ["verify-package"],
      cwd: engineRoot
    },
    {
      label: "Auditoria estrita das fontes e assets P0",
      command: "npm",
      args: ["run", "audit:p0-sources:strict"]
    },
    {
      label: "Testes Electron",
      command: "npm",
      args: ["run", "test:all"]
    },
    {
      label: "Gate acústico do projeto completo",
      command: "npm",
      args: ["run", "gate:audio-acoustic"]
    },
    {
      label: "Build Electron",
      command: "npm",
      args: ["run", "build"]
    },
    {
      label: "Smoke dos workspaces no projeto completo",
      command: "npm",
      args: ["run", "smoke:exemplo-template"]
    },
    {
      label: "Smoke temporal do Mercado Suspenso",
      command: "npm",
      args: ["run", "smoke:isometric-market-stability"]
    },
    {
      label: "Smoke das cenas do projeto completo",
      command: "npm",
      args: ["run", "smoke:exemplo-scenes"]
    },
    {
      label: "Replay comportamental da campanha (quando configurado)",
      command: "node",
      args: ["scripts/smoke-exemplo-campaign-replay.mjs"]
    },
    {
      label: "Higiene do diff do app",
      command: "git",
      args: appDiffCheckArgs,
      cwd: repoRoot
    },
    {
      label: "Higiene do diff da engine",
      command: "git",
      args: ["diff", "--check"],
      cwd: engineRoot
    }
  ]
};

function readArgValue(name, fallback) {
  const prefix = `${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);

  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  return process.argv[index + 1] ?? fallback;
}

function cloneStep(step) {
  return {
    ...step,
    args: [...step.args],
    cwd: step.cwd ?? appRoot
  };
}

export function createElectronDevWorkflowPlan(options = {}) {
  const profile = options.profile ?? "quick";
  const steps = profiles[profile];
  if (!steps) {
    const supportedProfiles = Object.keys(profiles);
    const supportedProfilesLabel = `${supportedProfiles.slice(0, -1).join(", ")} ou ${supportedProfiles.at(-1)}`;
    throw new Error(`Perfil desconhecido '${profile}'. Use ${supportedProfilesLabel}.`);
  }

  return {
    profile,
    appRoot,
    engineRoot,
    repoRoot,
    steps: steps.map(cloneStep)
  };
}

function formatCommand(step) {
  return [step.command, ...step.args].join(" ");
}

export async function runElectronDevWorkflow(options = {}) {
  const plan = createElectronDevWorkflowPlan({ profile: options.profile });
  const dryRun = options.dryRun ?? false;
  const runner = options.runner ?? runStep;

  console.log(`[electron-dev-workflow] perfil: ${plan.profile}`);
  for (const [index, step] of plan.steps.entries()) {
    console.log(`${index + 1}. ${step.label}: ${formatCommand(step)}`);
  }

  if (dryRun) {
    console.log("[electron-dev-workflow] dry-run: nenhum comando executado.");
    return plan;
  }

  let workflowEnv = process.env;
  if (plan.profile === "verify") {
    const report = inspectGbaToolchain();
    if (!report.ok) {
      throw new Error(`Toolchain GBA incompleta: ${report.missing.join(", ")}`);
    }
    workflowEnv = resolveToolchainEnvironment(report);
  }

  for (const step of plan.steps) {
    await runner(step, workflowEnv);
  }

  console.log("[electron-dev-workflow] workflow finalizado.");
  return plan;
}

function runStep(step, env = process.env) {
  return new Promise((resolve, reject) => {
    console.log(`\n==> ${step.label}`);
    const child = spawn(step.command, step.args, {
      cwd: step.cwd,
      env,
      stdio: "inherit"
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${step.label} falhou com codigo ${code ?? "desconhecido"}.`));
    });
  });
}

async function main() {
  const profile = readArgValue("--profile", process.argv.includes("--readiness") ? "readiness" : "quick");
  const dryRun = process.argv.includes("--dry-run");
  await runElectronDevWorkflow({ profile, dryRun });
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
