import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const repositoryRoot = resolve(appRoot, "../..");
const toolsRoot = join(repositoryRoot, "tools", "gba-sprite-prep");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const pythonCommand = process.env.PYTHON?.trim()
  || (process.platform === "win32" ? "python" : "python3");

const steps = [
  {
    label: "Rust gba-sprite-prep",
    command: "cargo",
    args: ["test", "--manifest-path", join(toolsRoot, "Cargo.toml")],
    cwd: repositoryRoot
  },
  {
    label: "Vitest gba-sprite-prep",
    command: npmCommand,
    args: [
      "exec",
      "--",
      "vitest",
      "run",
      "--root",
      repositoryRoot,
      "--config",
      join(toolsRoot, "vitest.config.mjs"),
      join(toolsRoot, "tests"),
      join(toolsRoot, "production", "exemplo-gba-advanced-scenes", "palette-quantization.test.mjs")
    ],
    cwd: appRoot
  },
  {
    label: "Python gba-sprite-prep",
    command: pythonCommand,
    args: ["-m", "unittest", "test_prepare_template_variants.py"],
    cwd: join(toolsRoot, "production", "cohesive-lighthouse-adventure-v2")
  }
];

for (const step of steps) {
  console.log(`\n[test:tools] ${step.label}`);
  const result = spawnSync(step.command, step.args, {
    cwd: step.cwd,
    env: process.env,
    stdio: "inherit"
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log("\n[test:tools] todas as suites passaram.");
