import { existsSync } from "node:fs";
import { access, cp, mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateEngineProjectExport, type EngineProjectExport } from "../shared/engineProjectExport.js";
import type { GBAProjectData } from "../shared/projectFile.js";
import { resolvePluginPathWithinRoot } from "../shared/pluginPathContainment.js";
import { writeEngineProjectExport } from "./engineProjectExport.js";

export interface WebProjectExport {
  target: string;
  title: string;
  romFileName: string;
  engineProject: EngineProjectExport;
}

export interface PreparedWebProjectExport {
  generated?: WebProjectExport;
  error?: string;
}

export interface WriteWebProjectExportOptions {
  destination: string;
  generated: WebProjectExport;
  projectPath?: string;
  projectData?: GBAProjectData;
  romSourcePath?: string;
  buildRom?: () => Promise<string | null | undefined>;
  requireRom?: boolean;
}

export interface WriteWebProjectExportResult {
  destination: string;
  files: string[];
  target: string;
  romResolved: boolean;
  romSource?: "explicit" | "discovered" | "built";
  romWarning?: string;
}

export interface EnsureWebExportRomSourceOptions {
  data: GBAProjectData;
  romFileName: string;
  projectPath?: string;
  explicitRomSourcePath?: string;
  buildRom?: () => Promise<string | null | undefined>;
}

export interface EnsureWebExportRomSourceResult {
  romSourcePath: string | null;
  source: "explicit" | "discovered" | "built" | "none";
  buildError?: string;
}

export interface InspectWebProjectRuntimeOptions {
  romFileName: string;
}

export interface WebProjectRuntimeInspection {
  runtimeComplete: boolean;
  requiredRuntimeFiles: string[];
  missingRuntimeFiles: string[];
}

const currentModuleDirectory = path.dirname(fileURLToPath(import.meta.url));
const webPlayerRelativePath = path.join("static", "WebPlayer");
const baseRequiredRuntimeFiles = [
  "index.html",
  "manifest.json",
  "player/gbastudio-player.js",
  "player/gbastudio-player.css",
  "player/runtime.html",
  "player/mgba-direct-player.mjs",
  "player/mgba-core.mjs",
  "player/mgba-core.wasm",
  "player/mgba-core.manifest.json",
  "licenses/mGBA-MPL-2.0.txt"
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringField(source: Record<string, unknown> | undefined, key: string, fallback: string): string {
  const value = source?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function child(source: Record<string, unknown> | undefined, key: string): Record<string, unknown> | undefined {
  return isRecord(source?.[key]) ? source[key] : undefined;
}

function settings(data: GBAProjectData): Record<string, unknown> | undefined {
  return isRecord(data.settings) ? data.settings : undefined;
}

function projectTitle(data: GBAProjectData): string {
  const general = child(settings(data), "general");
  return stringField(general, "gameTitle", stringField(data, "name", "Projeto sem nome"));
}

function romFileName(data: GBAProjectData, target: string): string {
  const build = child(settings(data), "build");
  return assertSafeRomFileName(stringField(build, "romFileName", `${target}.gba`));
}

function isSafeRomFileName(value: string): boolean {
  const normalized = value.trim();
  return normalized.length > ".gba".length
    && normalized.endsWith(".gba")
    && !normalized.includes("/")
    && !normalized.includes("\\")
    && !path.isAbsolute(normalized);
}

function assertSafeRomFileName(value: string): string {
  const normalized = value.trim();
  if (!isSafeRomFileName(normalized)) {
    throw new Error("romFileName precisa ser um nome de arquivo .gba relativo e seguro.");
  }
  return normalized;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function webManifest(exported: WebProjectExport, romResolved: boolean): string {
  return `${JSON.stringify(
    {
      schema: 1,
      kind: "gbastudio_web_export",
      title: exported.title,
      target: exported.target,
      romFileName: exported.romFileName,
      romPath: `roms/${exported.romFileName}`,
      romResolved,
      packageComplete: romResolved,
      playerPath: "player/gbastudio-player.js",
      engineProjectPath: "engine-project/gbastudio_project.json",
      engineSourcePath: "engine-project",
      distribution: {
        platform: "itch.io",
        format: "static-web-package",
        runtime: "gbastudio-player",
        core: "mgba",
        adapter: "mgba-wasm-direct"
      },
      licenses: { mgba: "licenses/mGBA-MPL-2.0.txt" }
    },
    null,
    2
  )}\n`;
}

function indexHtml(exported: WebProjectExport, romResolved: boolean): string {
  const title = escapeHtml(exported.title);
  const romFile = escapeHtml(exported.romFileName);
  const romNotice = romResolved
    ? ""
    : `      <p class="rom-warning">ROM ausente: substitua <code>roms/${romFile}</code> por um build real antes de publicar.</p>\n`;
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} - GBA Studio</title>
  <link rel="stylesheet" href="player/gbastudio-player.css">
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    html, body { width: 100%; height: 100%; min-height: 100%; overflow: hidden; }
    body {
      margin: 0;
      height: 100vh;
      display: grid;
      place-items: center;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #11131a;
      color: #f6f7fb;
    }
    main {
      width: min(100vw, 1280px);
      height: min(100vh, 820px);
      min-height: 0;
      padding: 24px;
      display: grid;
      grid-template-rows: auto 1fr auto;
      gap: 16px;
    }
    header, footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
    }
    h1 { margin: 0; font-size: 20px; letter-spacing: 0; }
    p { margin: 0; color: #abb2c2; }
    code { background: #232633; border-radius: 4px; padding: 2px 6px; color: #ffffff; }
    #game {
      width: 100%;
      height: min(72vh, 720px);
      min-height: 360px;
      max-height: 720px;
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 1px solid #2d3242;
      border-radius: 8px;
      overflow: hidden;
      background: #05060a;
    }
    #game iframe {
      width: 100% !important;
      height: 100% !important;
      display: block;
      border: 0;
    }
    .rom-warning {
      margin: 0;
      padding: 12px 14px;
      border-radius: 8px;
      border: 1px solid #7a4b12;
      background: #2a1d0d;
      color: #ffd9a1;
    }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>${title}</h1>
      <p>ROM esperada: <code>roms/${romFile}</code></p>
    </header>
${romNotice}    <div id="game"></div>
    <footer>
      <p>Exportado pelo GBA Studio para Web / itch.io.</p>
    </footer>
  </main>
  <script>
    window.GBAStudioPlayerConfig = {
      mount: "#game",
      core: "gba",
      title: "${title}",
      romUrl: "roms/${romFile}",
      runtimeRomUrl: "../roms/${romFile}",
      runtimeUrl: "player/runtime.html",
      color: "#6d2df4"
    };
  </script>
  <script src="player/gbastudio-player.js"></script>
</body>
</html>
`;
}

function readme(exported: WebProjectExport): string {
  return `# ${exported.title}

Pacote Web / itch.io exportado pelo GBA Studio.

- Projeto Engine Pack: \`engine-project/\`
- Manifesto Web: \`manifest.json\`
- Config itch.io: \`.itch.toml\`
- Player Web: \`player/\`
- ROM esperada apos build: \`roms/${exported.romFileName}\`

Para publicar no itch.io, gere a ROM real do Game Boy Advance a partir da pasta \`engine-project\`, coloque o arquivo final em \`roms/${exported.romFileName}\` e envie esta pasta como pacote HTML.

O pacote inclui o GBA Studio Player com core mGBA-WASM direto. Consulte \`licenses/mGBA-MPL-2.0.txt\` antes de distribuir publicamente.
`;
}

function itchToml(exported: WebProjectExport): string {
  const title = exported.title.replace(/"/g, "\\\"");
  return `title = "${title}"
kind = "html"

[html]
index_files = ["index.html"]
`;
}

function webPlayerCandidates(env: NodeJS.ProcessEnv = process.env): string[] {
  const electronResourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  return [
    env.GBA_STUDIO_WEB_PLAYER_ROOT,
    electronResourcesPath ? path.join(electronResourcesPath, "WebPlayer") : undefined,
    path.resolve(process.cwd(), webPlayerRelativePath),
    path.resolve(currentModuleDirectory, "..", "..", webPlayerRelativePath)
  ].filter((candidate): candidate is string => Boolean(candidate));
}

async function existingDirectory(candidates: string[]): Promise<string> {
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      continue;
    }
  }
  throw new Error("Runtime WebPlayer nao encontrado para exportacao Web.");
}

async function collectFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      return collectFiles(entryPath);
    }
    if (entry.isFile()) {
      return [entryPath];
    }
    return [];
  }));
  return files.flat().sort();
}

async function writeRomPlaceholder(destination: string, exported: WebProjectExport): Promise<string> {
  const romDirectory = path.join(destination, "roms");
  const placeholder = path.join(romDirectory, "README.md");
  await mkdir(romDirectory, { recursive: true });
  await writeFile(
    placeholder,
    `# ROM\n\nColoque a ROM Game Boy Advance gerada pelo build em \`${exported.romFileName}\` nesta pasta.\n`,
    "utf8"
  );
  return placeholder;
}

async function copyRomSource(destination: string, exported: WebProjectExport, romSourcePath: string): Promise<string> {
  const safeRomFileName = assertSafeRomFileName(exported.romFileName);
  const romDirectory = await resolvePluginPathWithinRoot(destination, "roms");
  if (!romDirectory) {
    throw new Error("Destino de ROM inseguro: a pasta roms precisa permanecer dentro do pacote Web.");
  }
  await mkdir(romDirectory, { recursive: true });
  const romDestination = await resolvePluginPathWithinRoot(romDirectory, safeRomFileName);
  if (!romDestination) {
    throw new Error("Destino de ROM inseguro: o arquivo precisa permanecer dentro da pasta roms.");
  }
  const destinationPath = path.join(destination, "roms", safeRomFileName);
  await cp(romSourcePath, destinationPath);
  return destinationPath;
}

async function copyWebPlayer(destination: string): Promise<string[]> {
  const source = await existingDirectory(webPlayerCandidates());
  const copiedFiles: string[] = [];
  const playerSource = path.join(source, "player");
  const playerDestination = path.join(destination, "player");
  await cp(playerSource, playerDestination, { recursive: true });
  copiedFiles.push(...await collectFiles(playerDestination));

  const licensesSource = path.join(source, "licenses");
  const licensesDestination = path.join(destination, "licenses");
  await cp(licensesSource, licensesDestination, { recursive: true });
  copiedFiles.push(...await collectFiles(licensesDestination));
  return copiedFiles.sort();
}

export function inspectWebProjectRuntime(
  destination: string,
  options: InspectWebProjectRuntimeOptions
): WebProjectRuntimeInspection {
  const safeRomFileName = assertSafeRomFileName(options.romFileName);
  const requiredRuntimeFiles = [...baseRequiredRuntimeFiles, path.posix.join("roms", safeRomFileName)];
  const missingRuntimeFiles = requiredRuntimeFiles.filter((relativeFile) => {
    const filePath = path.join(destination, ...relativeFile.split("/"));
    return !existsSync(filePath);
  });

  return {
    runtimeComplete: missingRuntimeFiles.length === 0,
    requiredRuntimeFiles,
    missingRuntimeFiles
  };
}

export function prepareWebProjectExport(data: GBAProjectData): PreparedWebProjectExport {
  try {
    const engineProject = generateEngineProjectExport(data);
    return {
      generated: {
        target: engineProject.target,
        title: projectTitle(data),
        romFileName: romFileName(data, engineProject.target),
        engineProject
      }
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

export function resolveSmokeWebExportRoot(env: NodeJS.ProcessEnv = process.env): string | null {
  const value = env.GBA_STUDIO_SMOKE_WEB_EXPORT_ROOT?.trim();
  return value ? value : null;
}

export function resolveWebExportRomSource(
  data: GBAProjectData,
  romFileName: string,
  projectPath?: string
): string | null {
  if (!isSafeRomFileName(romFileName)) return null;
  const projectDir = projectPath ? path.dirname(projectPath) : null;
  if (!projectDir) return null;

  const general = child(settings(data), "general");
  const exportFolder = stringField(general, "exportFolder", "build");
  const candidates = [
    path.join(projectDir, exportFolder, romFileName),
    path.join(projectDir, "build", romFileName),
    path.join(projectDir, romFileName)
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

export async function ensureWebExportRomSource(
  options: EnsureWebExportRomSourceOptions
): Promise<EnsureWebExportRomSourceResult> {
  const safeRomFileName = assertSafeRomFileName(options.romFileName);
  if (options.explicitRomSourcePath && existsSync(options.explicitRomSourcePath)) {
    return { romSourcePath: options.explicitRomSourcePath, source: "explicit" };
  }

  const discovered = options.projectPath
    ? resolveWebExportRomSource(options.data, safeRomFileName, options.projectPath)
    : null;
  if (discovered) {
    return { romSourcePath: discovered, source: "discovered" };
  }

  if (!options.buildRom) {
    return { romSourcePath: null, source: "none" };
  }

  try {
    const built = await options.buildRom();
    if (built && existsSync(built)) {
      return { romSourcePath: built, source: "built" };
    }
    return { romSourcePath: null, source: "none", buildError: "Build de ROM nao produziu arquivo jogavel." };
  } catch (error) {
    return {
      romSourcePath: null,
      source: "none",
      buildError: error instanceof Error ? error.message : String(error)
    };
  }
}

export async function writeWebProjectExport(options: WriteWebProjectExportOptions): Promise<WriteWebProjectExportResult> {
  const safeRomFileName = assertSafeRomFileName(options.generated.romFileName);
  await mkdir(options.destination, { recursive: true });

  const files = [
    path.join(options.destination, "index.html"),
    path.join(options.destination, "manifest.json"),
    path.join(options.destination, "README.md"),
    path.join(options.destination, ".itch.toml")
  ];
  const romResolution = options.projectData
    ? await ensureWebExportRomSource({
        data: options.projectData,
        romFileName: safeRomFileName,
        projectPath: options.projectPath,
        explicitRomSourcePath: options.romSourcePath,
        buildRom: options.buildRom
      })
    : {
        romSourcePath: options.romSourcePath && existsSync(options.romSourcePath) ? options.romSourcePath : null,
        source: options.romSourcePath && existsSync(options.romSourcePath) ? "explicit" as const : "none" as const
      };
  const romSourcePath = romResolution.romSourcePath;
  const romResolved = Boolean(romSourcePath);
  const romWarning = romSourcePath
    ? undefined
    : romResolution.buildError
      ? `ROM ausente: ${romResolution.buildError} Pacote Web inclui placeholder em roms/README.md.`
      : "ROM ausente: compile o jogo antes do export Web ou configure o Engine Pack com gbsbuild. Pacote inclui placeholder em roms/README.md.";
  // Pacote itch.io/Web so e completo com .gba jogavel. Placeholder exige opt-in explicito.
  const requireRom = options.requireRom !== false;
  if (requireRom && !romSourcePath) {
    throw new Error(romWarning ?? "ROM obrigatoria para export Web.");
  }
  await writeFile(files[0], indexHtml(options.generated, romResolved), "utf8");
  await writeFile(files[1], webManifest(options.generated, romResolved), "utf8");
  await writeFile(files[2], readme(options.generated), "utf8");
  await writeFile(files[3], itchToml(options.generated), "utf8");
  const romFile = romSourcePath
    ? await copyRomSource(options.destination, options.generated, romSourcePath)
    : await writeRomPlaceholder(options.destination, options.generated);
  const webPlayerFiles = await copyWebPlayer(options.destination);

  const engineDestination = path.join(options.destination, "engine-project");
  const engineWritten = await writeEngineProjectExport({
    destination: engineDestination,
    generated: options.generated.engineProject,
    projectPath: options.projectPath
  });

  return {
    destination: options.destination,
    files: [...files, romFile, ...webPlayerFiles, ...engineWritten.files],
    target: options.generated.target,
    romResolved,
    ...(romResolution.source !== "none" ? { romSource: romResolution.source } : {}),
    ...(romWarning ? { romWarning } : {})
  };
}
