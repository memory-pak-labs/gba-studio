#!/usr/bin/env node
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const appRoot = path.resolve(path.dirname(scriptPath), "..");
const repoRoot = path.resolve(appRoot, "../..");
const appBaseProjectPath = path.join(appRoot, "default-assets/templates/exemplo-gba/exemplo-gba.gba-project");

const steps = [
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
    label: "Smoke welcome",
    command: "npm",
    args: ["run", "smoke:welcome"]
  },
  {
    label: "Smoke projeto completo",
    command: "npm",
    args: ["run", "smoke:exemplo-template"]
  },
  {
    label: "Smoke package macOS",
    command: "npm",
    args: ["run", "smoke:package"]
  },
  {
    label: "Smoke visual",
    command: "npm",
    args: ["run", "smoke:visual"]
  },
  {
    label: "Painel de revisao visual",
    command: "npm",
    args: ["run", "review:visual"]
  },
  {
    label: "Smoke projetos reais",
    command: "npm",
    args: ["run", "smoke:projects"],
    env: {
      GBA_STUDIO_REAL_PROJECTS: appBaseProjectPath
    }
  },
  {
    label: "Smoke Engine ROM + mGBA",
    command: "npm",
    args: ["run", "smoke:engine-rom", "--", "--open-mgba"],
    env: {
      GBA_STUDIO_ENGINE_ROM_SMOKE_DIR: "artifacts/engine-rom/latest"
    }
  },
  {
    label: "Auditoria projeto real",
    command: "npm",
    args: ["run", "audit:real-project", "--", "--strict"]
  },
  {
    label: "Auditoria config cross-platform",
    command: "npm",
    args: ["run", "audit:cross-platform", "--", "--strict"]
  },
  {
    label: "Auditoria signing macOS",
    command: "npm",
    args: ["run", "audit:macos-signing", "--", "--strict"]
  },
  {
    label: "Auditoria piloto macOS",
    command: "npm",
    args: ["run", "audit:macos-pilot"]
  },
  {
    label: "Auditoria paridade funcional",
    command: "npm",
    args: ["run", "audit:functional-parity", "--", "--strict"]
  },
  {
    label: "Higiene do diff",
    command: "git",
    args: ["diff", "--check"],
    cwd: repoRoot
  },
  {
    label: "Readiness macOS estrita",
    command: "npm",
    args: ["run", "audit:macos-pilot", "--", "--strict"]
  }
];

function runStep(step) {
  return new Promise((resolve, reject) => {
    console.log(`\n==> ${step.label}`);
    const child = spawn(step.command, step.args, {
      cwd: step.cwd ?? appRoot,
      env: { ...process.env, ...(step.env ?? {}) },
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
  if (process.platform !== "darwin") {
    throw new Error("gate:macos-pilot deve rodar no macOS porque valida .app e mGBA local.");
  }

  for (const step of steps) {
    await runStep(step);
  }

  console.log("\nGate macOS pilot finalizado. Confira o status em artifacts/macos-pilot-readiness/latest/.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
