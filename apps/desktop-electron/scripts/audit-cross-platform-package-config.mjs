#!/usr/bin/env node
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const appRoot = path.resolve(path.dirname(scriptPath), "..");
const repoRoot = path.resolve(appRoot, "../..");
const packageJsonPath = path.join(appRoot, "package.json");
const workflowPath = path.join(repoRoot, ".github", "workflows", "ci.yml");
const desktopWorkflowPath = path.join(repoRoot, ".github", "workflows", "desktop-packages.yml");
const mainProcessPath = path.join(appRoot, "src", "main", "main.ts");
const outputDir = path.join(appRoot, "artifacts", "cross-platform-package", "latest");
const outputJsonPath = path.join(outputDir, "cross_platform_package_config.json");
const outputMarkdownPath = path.join(outputDir, "cross_platform_package_config.md");
const strictMode = process.argv.includes("--strict");

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function targetsOf(config) {
  if (Array.isArray(config?.target)) return config.target;
  if (typeof config?.target === "string") return [config.target];
  return [];
}

function includesAll(actual, expected) {
  return expected.every((entry) => actual.includes(entry));
}

function hasScript(packageJson, scriptName) {
  return typeof packageJson.scripts?.[scriptName] === "string";
}

function hasWorkflowText(workflowText, patterns) {
  return patterns.every((pattern) => pattern.test(workflowText));
}

export function workflowJobText(workflowText, jobName) {
  const normalizedWorkflowText = workflowText.replaceAll("\r\n", "\n");
  const match = normalizedWorkflowText.match(new RegExp(`\\n  ${jobName}:\\n[\\s\\S]*?(?=\\n  [a-zA-Z0-9_-]+:\\n|$)`));
  return match?.[0] ?? "";
}

function escapeMarkdown(value) {
  return String(value).replaceAll("|", "\\|").replaceAll("\n", " ");
}

function check(id, label, passed, evidence, issue, nextStep) {
  return {
    id,
    label,
    state: passed ? "passed" : "blocked",
    evidence,
    ...(passed ? {} : { issue }),
    ...(nextStep ? { nextStep } : {})
  };
}

function fileExists(relativePath) {
  return existsSync(path.join(appRoot, relativePath));
}

export function createCrossPlatformPackageConfigReport({ packageJson, workflowText, desktopWorkflowText, mainProcessText }) {
  const build = packageJson.build ?? {};
  const editorJob = workflowJobText(workflowText, "editor");
  const desktopJob = workflowJobText(desktopWorkflowText, "desktop");
  const auditIndex = desktopJob.indexOf("npm run audit:cross-platform -- --strict");
  const packageIndex = desktopJob.indexOf("npm run ${{ matrix.script }}");
  const macTargets = targetsOf(build.mac);
  const macDistributionScript = packageJson.scripts?.["dist:mac"] ?? "";
  const macArchitectureScripts = ["arm64", "x64"].every(architecture =>
    packageJson.scripts?.[`dist:mac:${architecture}`] === `node scripts/package-macos.mjs --arch ${architecture}` &&
    packageJson.scripts?.[`package:mac:${architecture}`] === `node scripts/package-macos.mjs --arch ${architecture} --dir`);
  const winTargets = targetsOf(build.win);
  const linuxTargets = targetsOf(build.linux);
  const associationExts = new Set(
    (build.fileAssociations ?? []).map((association) => association.ext).filter(Boolean)
  );
  const associationIcons = new Set(
    (build.fileAssociations ?? []).map((association) => association.icon).filter(Boolean)
  );
  const hasDocumentAssociations = associationExts.has("gbastudio") &&
    associationExts.has("gba-project") &&
    associationIcons.has("build/file-gbastudio");
  const hasMacosOpenFileHandler = /app\.on\(["']open-file["']/.test(mainProcessText) &&
    /event\.preventDefault\(\)/.test(mainProcessText) &&
    /openExternalProject\(projectPath\)/.test(mainProcessText);
  const requiredIconFiles = [
    "build/icon.icns",
    "build/icon.ico",
    "build/icon.png",
    "build/file-gbastudio.icns",
    "build/file-gbastudio.ico",
    "build/file-gbastudio.png"
  ];

  const items = [
    check(
      "scripts",
      "Scripts de distribuicao por plataforma",
      ["dist:mac", "dist:win", "dist:linux"].every((scriptName) => hasScript(packageJson, scriptName)),
      `Scripts encontrados: ${Object.keys(packageJson.scripts ?? {}).filter((scriptName) => scriptName.startsWith("dist")).join(", ")}`,
      "Falta pelo menos um script dist:* para macOS, Windows ou Linux.",
      "Adicionar scripts npm que chamem electron-builder para cada plataforma."
    ),
    check(
      "build-identity",
      "Identidade e diretorios do pacote",
      build.appId === "br.com.gbastudio.desktop" &&
        build.productName === "GBA Studio" &&
        build.executableName === "gba-studio" &&
        packageJson.homepage === "https://github.com/memory-pak-labs/gba-studio" &&
        build.icon === "build/icon" &&
        build.directories?.buildResources === "build" &&
        build.directories?.output === "release" &&
        Array.isArray(build.files) &&
        build.files.includes("dist/**"),
      `appId=${build.appId ?? "ausente"}; productName=${build.productName ?? "ausente"}; executableName=${build.executableName ?? "ausente"}; homepage=${packageJson.homepage ?? "ausente"}; output=${build.directories?.output ?? "ausente"}`,
      "Configuracao base do electron-builder esta incompleta.",
      "Completar appId, productName, executableName, homepage, buildResources, output e files."
    ),
    check(
      "document-associations",
      "Associacoes .gbastudio e .gba-project",
      hasDocumentAssociations,
      `Extensoes declaradas: ${Array.from(associationExts).join(", ") || "nenhuma"}`,
      "Associacoes de arquivo do projeto nao cobrem todos os formatos esperados.",
      "Declarar fileAssociations para .gbastudio e .gba-project usando build/file-gbastudio."
    ),
    check(
      "macos-open-file-handler",
      "Abertura macOS por Finder",
      hasDocumentAssociations && hasMacosOpenFileHandler,
      hasMacosOpenFileHandler
        ? "main.ts escuta open-file, cancela o evento nativo e roteia para openExternalProject."
        : "Handler open-file ausente ou incompleto em main.ts.",
      "Arquivos associados podem nao abrir corretamente via Finder no macOS.",
      "Manter app.on(\"open-file\") encaminhando projectPath para openExternalProject."
    ),
    check(
      "icon-assets",
      "Icones gerados para app e documento",
      requiredIconFiles.every(fileExists),
      `Arquivos esperados: ${requiredIconFiles.join(", ")}`,
      "Algum icone gerado para app ou documento esta ausente.",
      "Rodar npm run icons e confirmar build/icon.* e build/file-gbastudio.*."
    ),
    check(
      "macos-targets",
      "Alvo macOS",
      build.mac?.icon === "build/icon.icns" &&
        build.mac?.category === "public.app-category.developer-tools" &&
        includesAll(macTargets, ["dmg", "zip"]),
      `Targets macOS: ${macTargets.join(", ") || "nenhum"}`,
      "Configuracao macOS nao cobre DMG/ZIP, icone ou categoria esperada.",
      "Ajustar build.mac em package.json."
    ),
    check(
      "macos-dmg-signing",
      "Assinatura do instalador DMG",
      build.dmg?.sign === true,
      "O contêiner DMG exige assinatura própria antes da notarização.",
      "O DMG nao exige assinatura, mesmo que o aplicativo esteja assinado.",
      "Definir build.dmg.sign=true e validar o Gatekeeper no DMG final."
    ),
    check(
      "macos-architectures",
      "Instaladores macOS separados",
      macDistributionScript === "node scripts/package-macos.mjs --arch all" && macArchitectureScripts &&
        fileExists("scripts/package-macos.mjs") && fileExists("scripts/verify-macos-universal-runtime.mjs"),
      "Apple Silicon (arm64) e Intel (x64) possuem pacotes, runtimes e verificações separados.",
      "O fluxo macOS não exige os dois instaladores por arquitetura.",
      "Manter dist:mac:arm64/dist:mac:x64 e validar o runtime correspondente antes de empacotar."
    ),
    check(
      "windows-targets",
      "Alvo Windows",
      build.win?.icon === "build/icon.ico" && includesAll(winTargets, ["nsis", "zip"]),
      `Targets Windows: ${winTargets.join(", ") || "nenhum"}`,
      "Configuracao Windows nao cobre NSIS/ZIP ou icone esperado.",
      "Ajustar build.win em package.json."
    ),
    check(
      "linux-targets",
      "Alvo Linux",
      build.linux?.icon === "build/icon.png" &&
        build.linux?.maintainer === "GBA Studio Team" &&
        build.linux?.artifactName === "GBA-Studio-${version}-linux-${arch}.${ext}" &&
        build.linux?.category === "Development" &&
        includesAll(linuxTargets, ["AppImage", "deb", "tar.gz"]),
      `Targets Linux: ${linuxTargets.join(", ") || "nenhum"}`,
      "Configuracao Linux nao cobre AppImage/DEB/TAR.GZ, icone, maintainer, artifactName ou categoria esperada.",
      "Ajustar build.linux em package.json, incluindo maintainer e artifactName seguros."
    ),
    check(
      "ci-matrix",
      "CI cross-platform declarado",
      hasWorkflowText(editorJob, [/ubuntu-24\.04/, /windows-2022/, /npm run test:all/, /npm run typecheck/, /npm run build/]) &&
      hasWorkflowText(desktopJob, [
        /platform: linux/,
        /platform: windows/,
        /runner: windows-2022/,
        /runner: ubuntu-24\.04/,
        /dist:win/,
        /dist:linux/,
        /actions\/upload-artifact@[a-f0-9]{40}/
      ]),
      "ci.yml valida o editor em Windows/Linux; desktop-packages.yml gera os instaladores nesses hosts. macOS e validado localmente.",
      "Workflows nao declaram os testes e pacotes Windows/Linux esperados.",
      "Manter testes/tipos/build no CI e empacotamento em hosts nativos no workflow Desktop packages."
    ),
    check(
      "ci-cross-platform-audit",
      "Auditoria cross-platform no CI",
      hasScript(packageJson, "audit:cross-platform") &&
        fileExists("scripts/audit-cross-platform-package-config.mjs") &&
        auditIndex >= 0 && packageIndex > auditIndex,
      hasScript(packageJson, "audit:cross-platform")
        ? "Desktop packages declara a auditoria estrita antes do empacotamento."
        : "Script audit:cross-platform ausente.",
      "O CI ainda nao valida a configuracao cross-platform antes do empacotamento.",
      "Rodar npm run audit:cross-platform -- --strict antes de npm run ${{ matrix.script }}."
    ),
    check(
      "ci-artifact-validation",
      "Validacao de artefatos no CI",
      hasScript(packageJson, "smoke:ci-artifacts") &&
        fileExists("scripts/validate-ci-artifacts.mjs") &&
        hasWorkflowText(desktopJob, [
          /npm run smoke:ci-artifacts -- --platform \${{ matrix\.platform }}/,
          /Smoke Linux packaged editor and complete project/,
          /Smoke Windows packaged editor and complete project/,
          /node scripts\/smoke-electron-exemplo-scenes\.mjs --packaged/,
          /dpkg -L/,
          /NSIS installation failed/,
          /GBA_STUDIO_RUNTIME_SOURCES_READY == '1'/
        ]),
      hasScript(packageJson, "smoke:ci-artifacts")
        ? "CI valida os artefatos gerados antes do upload."
        : "Script smoke:ci-artifacts ausente.",
      "O CI ainda nao valida explicitamente os artefatos gerados antes do upload.",
      "Validar artefatos, instalar e executar o exemplo offline antes do upload dos instaladores."
    ),
    check(
      "local-package-canonical",
      "Pacote local canonico Electron",
      macDistributionScript === "node scripts/package-macos.mjs --arch all" && macArchitectureScripts &&
        !/script\/package_app\.sh|GBA_STUDIO_PREBUILT_BINARY/.test(macDistributionScript) &&
        fileExists("scripts/smoke-macos-app-bundle.mjs"),
      "dist:mac usa o empacotador Electron canonico e impede publicacao automatica; smoke local do bundle disponivel.",
      "O pacote local macOS nao usa o fluxo Electron por arquitetura esperado.",
      "Manter o empacotamento arm64/x64 com --publish never e validar cada bundle final localmente."
    )
  ];

  const blockers = items.filter((item) => item.state === "blocked").map((item) => item.issue);
  return {
    status: blockers.length === 0 ? "ready" : "blocked",
    generatedAt: new Date().toISOString(),
    packageJsonPath,
    workflowPath,
    desktopWorkflowPath,
    mainProcessPath,
    note:
      "Esta auditoria valida a configuracao local de empacotamento cross-platform; ela nao substitui uma execucao real do CI em Windows e Linux.",
    blockers,
    items
  };
}

function renderMarkdown(report) {
  const lines = [
    "# Cross-platform package config audit",
    "",
    `- Gerado em: ${report.generatedAt}`,
    `- Status: ${report.status === "ready" ? "Configuracao pronta" : "Configuracao bloqueada"}`,
    `- package.json: ${report.packageJsonPath}`,
    `- workflow: ${report.workflowPath}`,
    `- Observacao: ${report.note}`,
    "",
    "## Itens",
    "",
    "| Item | Estado | Evidencia | Proximo passo |",
    "| --- | --- | --- | --- |"
  ];

  for (const item of report.items) {
    lines.push(
      `| ${escapeMarkdown(item.label)} | ${item.state === "passed" ? "OK" : "Bloqueado"} | ${escapeMarkdown(item.evidence)} | ${escapeMarkdown(item.nextStep ?? "")} |`
    );
  }

  lines.push("", "## Bloqueios", "");
  if (report.blockers.length === 0) {
    lines.push("- Nenhum bloqueio de configuracao local.");
  } else {
    lines.push(...report.blockers.map((blocker) => `- ${blocker}`));
  }

  lines.push(
    "",
    "## Limite da evidencia",
    "",
    "- Para validacao final, executar Desktop packages para Windows/Linux no commit da release e testar os pacotes macOS arm64 e x64 localmente. Configuracao aprovada nao comprova execucao desses testes."
  );

  return `${lines.join("\n")}\n`;
}

async function main() {
  const packageJson = await readJson(packageJsonPath);
  const workflowText = await readFile(workflowPath, "utf8");
  const desktopWorkflowText = await readFile(desktopWorkflowPath, "utf8");
  const mainProcessText = await readFile(mainProcessPath, "utf8");
  const report = createCrossPlatformPackageConfigReport({ packageJson, workflowText, desktopWorkflowText, mainProcessText });

  await mkdir(outputDir, { recursive: true });
  await writeFile(outputJsonPath, `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(outputMarkdownPath, renderMarkdown(report));

  console.log(`Cross-platform package config audit: ${report.status}`);
  console.log(`- ${outputMarkdownPath}`);
  if (strictMode && report.status !== "ready") {
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
