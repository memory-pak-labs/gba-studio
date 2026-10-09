import { spawn } from "node:child_process";
import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const minDiscoveredProjectBytes = 10_000;
const maxDiscoveredProjects = 12;
const defaultEvidencePath = join(appRoot, "artifacts/project-validation/latest/project_validation_evidence.json");

function projectExtension(filePath) {
  const lowercased = filePath.toLowerCase();
  if (lowercased.endsWith(".gba-project")) return "gba-project";
  if (lowercased.endsWith(".gbastudio")) return "gbastudio";
  return null;
}

function explicitProjectPaths() {
  const raw = process.env.GBA_STUDIO_REAL_PROJECTS?.trim();
  if (!raw) return [];
  return raw
    .split(delimiter)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => resolve(item));
}

async function discoverProjectsIn(rootPath, found) {
  let entries = [];
  try {
    entries = await readdir(rootPath, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (found.length >= maxDiscoveredProjects) return;
    if (entry.name.startsWith(".")) continue;

    const fullPath = join(rootPath, entry.name);
    if (entry.isDirectory()) {
      await discoverProjectsIn(fullPath, found);
      continue;
    }

    if (!entry.isFile() || !projectExtension(fullPath)) continue;

    const fileStat = await stat(fullPath);
    if (fileStat.size < minDiscoveredProjectBytes) continue;
    found.push(fullPath);
  }
}

async function discoveredProjectPaths() {
  const found = [];
  for (const rootPath of [join(homedir(), "Documents"), join(homedir(), "Desktop")]) {
    await discoverProjectsIn(rootPath, found);
  }
  return found;
}

async function main() {
  const explicitPaths = explicitProjectPaths();
  const externalProjectPaths = explicitPaths.length > 0 ? explicitPaths : await discoveredProjectPaths();

  if (externalProjectPaths.length === 0) {
    throw new Error(
      `Nenhum projeto real .gba-project/.gbastudio encontrado. Defina GBA_STUDIO_REAL_PROJECTS com caminhos separados por ${JSON.stringify(delimiter)}.`
    );
  }

  const child = spawn(
    "npx",
    ["vitest", "run", "--run", "src/shared/realProjectsSmoke.test.ts"],
    {
      cwd: appRoot,
      env: {
        ...process.env,
        GBA_STUDIO_REAL_PROJECT_PATHS: JSON.stringify(externalProjectPaths),
        GBA_STUDIO_PROJECT_SMOKE_EVIDENCE: defaultEvidencePath
      },
      stdio: "inherit"
    }
  );

  const exitCode = await new Promise((resolve) => {
    child.once("exit", (code) => resolve(code ?? 1));
  });

  if (exitCode !== 0) {
    process.exit(exitCode);
  }

  console.log(`[smoke-real-projects] projetos reais validados: ${externalProjectPaths.length}`);
  console.log(`[smoke-real-projects] evidencia: ${defaultEvidencePath}`);
}

main().catch((error) => {
  console.error("[smoke-real-projects] failed");
  console.error(error);
  process.exit(1);
});
