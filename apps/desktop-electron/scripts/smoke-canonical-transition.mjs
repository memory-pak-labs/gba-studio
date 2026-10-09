#!/usr/bin/env node
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { auditCanonicalP0Assets, resolveCanonicalP0Source } from "./p0-source-catalog.mjs";
import { copySmokeProject } from "./lib/electron-smoke-helpers.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const appRoot = path.resolve(path.dirname(scriptPath), "..");
const source = resolveCanonicalP0Source(appRoot);
const assetAudit = auditCanonicalP0Assets(appRoot);
const style = process.env.GBA_STUDIO_CANONICAL_TRANSITION_PROBE_STYLE?.trim() || "fade";
const allowedStyles = new Set(["fade", "fade-color", "wipe", "mosaic", "slide", "crossfade"]);
if (!allowedStyles.has(style)) {
  throw new Error(`Estilo de transição canônico inválido: ${style}. Use fade, fade-color, wipe, mosaic, slide ou crossfade.`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function run(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: appRoot,
      env,
      stdio: "inherit"
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} saiu com código ${code ?? "desconhecido"}.`));
    });
  });
}

async function findAvailablePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : null;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  assert(Number.isInteger(port) && port > 0, "Não foi possível reservar uma porta CDP para o probe canônico.");
  return port;
}

const project = JSON.parse(await readFile(source.projectPath, "utf8"));
const connection = (project.editorState?.scenaConnections ?? []).find((candidate) => (
  candidate?.from === "mercado_suspenso" && candidate?.to === "usina_submersa"
));
assert(connection, "A conexão canônica Mercado Suspenso → Usina Submersa não foi encontrada.");

const tempRoot = await mkdtemp(path.join(os.tmpdir(), "gba-studio-canonical-transition-"));
const tempProjectRoot = path.join(tempRoot, "exemplo-gba");
const tempProjectPath = path.join(tempProjectRoot, path.basename(source.projectPath));
const evidencePath = path.join(appRoot, "artifacts", "canonical-transition", "latest", "transition_probe_evidence.json");
const sceneEvidencePath = path.join(appRoot, "artifacts", "canonical-transition", "latest", "exemplo_scene_playtest_evidence.json");
const cdpPort = await findAvailablePort();

try {
  await copySmokeProject(path.dirname(source.projectPath), tempProjectRoot);
  connection.transition = {
    style,
    durationFrames: 8,
    fadeOut: true,
    fadeIn: true
  };
  await writeFile(tempProjectPath, `${JSON.stringify(project, null, 2)}\n`, "utf8");

  await run(process.execPath, [
    path.join(appRoot, "scripts", "smoke-electron-exemplo-scenes.mjs"),
    `--project=${tempProjectPath}`,
    `--evidence=${sceneEvidencePath}`,
    "--scene=mercado_suspenso",
    "--exercise-isometric-input"
  ], {
    ...process.env,
    GBA_STUDIO_SMOKE_CDP_PORT: String(cdpPort),
    GBA_STUDIO_CANONICAL_TRANSITION_PROBE_STYLE: style
  });

  const sceneEvidence = JSON.parse(await readFile(sceneEvidencePath, "utf8"));
  const result = sceneEvidence.results?.find((candidate) => candidate?.name === "mercado_suspenso");
  const probe = result?.isometricInput?.transitionProbe ?? null;
  assert(sceneEvidence.ok === true, `Smoke canônico derivado falhou: ${JSON.stringify(sceneEvidence).slice(0, 4000)}`);
  assert(probe?.ok === true, `Probe canônico ausente ou inválido: ${JSON.stringify(probe).slice(0, 4000)}`);

  const evidence = {
    acceptance: {
      global: false,
      reason: "Probe focado de transição em cópia temporária; o aceite global exige smoke:p0 e assets aprovados."
    },
    assetAudit,
    derivedFromCanonical: true,
    generatedAt: new Date().toISOString(),
    ok: true,
    source: {
      id: source.id,
      projectPath: source.projectPath,
      role: source.role,
      sourceKey: "canonicalP0"
    },
    style,
    scene: "mercado_suspenso",
    connection: {
      from: connection.from,
      to: connection.to,
      transition: connection.transition
    },
    sceneEvidencePath,
    probe
  };
  await mkdir(path.dirname(evidencePath), { recursive: true });
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  console.log(`Probe temporal canônico OK: ${evidencePath}`);
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}
