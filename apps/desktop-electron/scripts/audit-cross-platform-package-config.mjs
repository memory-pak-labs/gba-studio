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

function createReport(packageJson, workflowText, mainProcessText) {
  const build = packageJson.build ?? {};
  const localPackageJob = workflowJobText(workflowText, "package-local");
  const localPackageUsesLegacySwift = /script\/package_app\.sh|dist\/GBAStudio-macOS|GBA_STUDIO_PREBUILT_BINARY/.test(localPackageJob);
  const macTargets = targetsOf(build.mac);
  const macDistributionScript = packageJson.scripts?.["dist:mac"] ?? "";
  const macUniversalPackageScript = packageJson.scripts?.["package:mac:universal"] ?? "";
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
        packageJson.homepage === "https://github.com/matmel0/GBA-Studio" &&
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
      "macos-universal",
      "Distribuicao macOS Universal",
      /prepare:embedded-runtime:universal/.test(macDistributionScript) &&
        /verify:macos-universal-runtime/.test(macDistributionScript) &&
        /electron-builder --mac --universal/.test(macDistributionScript) &&
        /electron-builder --dir --universal/.test(macUniversalPackageScript) &&
        /macos-devkitpro-toolchain:/.test(workflowText) &&
        /macos-15-intel/.test(workflowText) &&
        /devkitpro-macos-arm64/.test(workflowText) &&
        /devkitpro-macos-x86_64/.test(workflowText),
      "dist:mac e package:mac:universal exigem runtime fat; CI prepara devkitPro arm64 e x86_64.",
      "O pacote macOS ainda nao exige Electron, Engine Pack e toolchain Universal.",
      "Usar --universal, verificar o runtime e preparar os dois toolchains no CI."
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
      hasWorkflowText(workflowText, [
        /electron-desktop:/,
        /macos-14/,
        /windows-latest/,
        /ubuntu-24\.04/,
        /dist:mac/,
        /dist:win/,
        /dist:linux/,
        /actions\/upload-artifact@v4/
      ]),
      ".github/workflows/ci.yml contem matriz macOS, Windows e Linux com upload de artefatos.",
      "Workflow CI nao declara a matriz Electron esperada.",
      "Atualizar .github/workflows/ci.yml com job electron-desktop em macOS, Windows e Linux."
    ),
    check(
      "ci-cross-platform-audit",
      "Auditoria cross-platform no CI",
      hasScript(packageJson, "audit:cross-platform") &&
        fileExists("scripts/audit-cross-platform-package-config.mjs") &&
        hasWorkflowText(workflowJobText(workflowText, "electron-desktop"), [
          /Audit cross-platform package config/,
          /npm run audit:cross-platform -- --strict/
        ]),
      hasScript(packageJson, "audit:cross-platform")
        ? "CI roda audit:cross-platform --strict no job electron-desktop."
        : "Script audit:cross-platform ausente.",
      "O CI ainda nao valida a configuracao cross-platform antes do empacotamento.",
      "Rodar npm run audit:cross-platform -- --strict no job electron-desktop."
    ),
    check(
      "ci-artifact-validation",
      "Validacao de artefatos no CI",
      hasScript(packageJson, "smoke:ci-artifacts") &&
        fileExists("scripts/validate-ci-artifacts.mjs") &&
        hasWorkflowText(workflowJobText(workflowText, "electron-desktop"), [
          /Validate packaged artifacts/,
          /npm run smoke:ci-artifacts -- --platform \${{ matrix\.os }}/
        ]),
      hasScript(packageJson, "smoke:ci-artifacts")
        ? "CI valida os artefatos gerados antes do upload."
        : "Script smoke:ci-artifacts ausente.",
      "O CI ainda nao valida explicitamente os artefatos gerados antes do upload.",
      "Rodar smoke:ci-artifacts no job electron-desktop apos o empacotamento."
    ),
    check(
      "local-package-canonical",
      "Pacote local canonico Electron",
      Boolean(localPackageJob) &&
        hasWorkflowText(localPackageJob, [
          /working-directory: apps\/desktop-electron/,
          /npm run dist:mac/,
          /npm run smoke:ci-artifacts -- --platform macos/,
          /smoke-macos-app-bundle\.mjs/,
          /GBAStudio-Electron-macOS-local-distribution/
        ]) &&
        !localPackageUsesLegacySwift,
      localPackageJob
        ? `package-local usa ${localPackageUsesLegacySwift ? "empacotamento Swift legado" : "empacotamento Electron"}`
        : "job package-local ausente",
      "O job manual/tag de distribuicao local ainda nao aponta para o pacote Electron canonico.",
      "Trocar package-local para npm run dist:mac em apps/desktop-electron e publicar artefatos Electron."
    )
  ];

  const blockers = items.filter((item) => item.state === "blocked").map((item) => item.issue);
  return {
    status: blockers.length === 0 ? "ready" : "blocked",
    generatedAt: new Date().toISOString(),
    packageJsonPath,
    workflowPath,
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
    "- Para contar como validacao cross-platform final, ainda e necessario rodar o job `electron-desktop` no GitHub Actions e baixar/testar os artefatos Windows e Linux."
  );

  return `${lines.join("\n")}\n`;
}

async function main() {
  const packageJson = await readJson(packageJsonPath);
  const workflowText = await readFile(workflowPath, "utf8");
  const mainProcessText = await readFile(mainProcessPath, "utf8");
  const report = createReport(packageJson, workflowText, mainProcessText);

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
