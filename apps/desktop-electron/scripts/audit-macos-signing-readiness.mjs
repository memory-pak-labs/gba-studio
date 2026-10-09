#!/usr/bin/env node
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const appRoot = path.resolve(path.dirname(scriptPath), "..");
const packageJsonPath = path.join(appRoot, "package.json");
const outputDir = path.join(appRoot, "artifacts", "macos-signing", "latest");
const outputJsonPath = path.join(outputDir, "macos_signing_readiness.json");
const outputMarkdownPath = path.join(outputDir, "macos_signing_readiness.md");
const strictMode = process.argv.includes("--strict");

const expectedEntitlements = {
  "com.apple.security.cs.allow-jit": true,
  "com.apple.security.cs.allow-unsigned-executable-memory": true
};

const forbiddenEntitlements = ["com.apple.security.cs.disable-library-validation"];

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

function escapeMarkdown(value) {
  return String(value).replaceAll("|", "\\|").replaceAll("\n", " ");
}

async function readFileIfExists(filePath) {
  if (!existsSync(filePath)) return "";
  return readFile(filePath, "utf8");
}

function plistHasBoolean(plistText, key, expectedValue) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const valueTag = expectedValue ? "true" : "false";
  return new RegExp(`<key>\\s*${escapedKey}\\s*<\\/key>\\s*<${valueTag}\\s*\\/>`).test(plistText);
}

function hasExpectedEntitlements(plistText) {
  return Object.entries(expectedEntitlements).every(([key, value]) => plistHasBoolean(plistText, key, value));
}

function hasForbiddenEntitlements(plistText) {
  return forbiddenEntitlements.some((key) => plistHasBoolean(plistText, key, true));
}

function normalizeEntitlementsPath(value) {
  return typeof value === "string" ? value.replaceAll("\\", "/") : "";
}

export async function auditMacosSigningReadiness(options = {}) {
  const root = path.resolve(options.appRoot ?? appRoot);
  const packagePath = path.resolve(options.packageJsonPath ?? path.join(root, "package.json"));
  const packageJson = JSON.parse(await readFile(packagePath, "utf8"));
  const build = packageJson.build ?? {};
  const mac = build.mac ?? {};
  const entitlementsPath = normalizeEntitlementsPath(mac.entitlements);
  const entitlementsInheritPath = normalizeEntitlementsPath(mac.entitlementsInherit);
  const expectedMainPath = "build/entitlements.mac.plist";
  const expectedInheritPath = "build/entitlements.mac.inherit.plist";
  const expectedLocalPath = "build/entitlements.mac.local.plist";
  const mainFullPath = path.join(root, expectedMainPath);
  const inheritFullPath = path.join(root, expectedInheritPath);
  const localFullPath = path.join(root, expectedLocalPath);
  const mainPlist = await readFileIfExists(mainFullPath);
  const inheritPlist = await readFileIfExists(inheritFullPath);
  const localPlist = await readFileIfExists(localFullPath);

  const items = [
    check(
      "mac-entitlement-paths",
      "Entitlements declarados no electron-builder",
      entitlementsPath === expectedMainPath && entitlementsInheritPath === expectedInheritPath,
      `entitlements=${entitlementsPath || "ausente"}; entitlementsInherit=${entitlementsInheritPath || "ausente"}`,
      "build.mac ainda nao aponta para os arquivos de entitlements esperados.",
      "Declarar build.mac.entitlements e build.mac.entitlementsInherit em package.json."
    ),
    check(
      "mac-entitlement-files",
      "Arquivos de entitlements presentes",
      existsSync(mainFullPath) && existsSync(inheritFullPath),
      `${expectedMainPath}; ${expectedInheritPath}`,
      "Algum arquivo .plist de entitlements macOS esta ausente.",
      "Adicionar os plists em apps/desktop-electron/build/."
    ),
    check(
      "mac-electron-runtime-entitlements",
      "Entitlements compativeis com runtime Electron",
      hasExpectedEntitlements(mainPlist) && hasExpectedEntitlements(inheritPlist),
      "allow-jit e allow-unsigned-executable-memory presentes nos dois plists.",
      "Os entitlements minimos do Electron nao foram encontrados nos plists.",
      "Adicionar somente allow-jit e allow-unsigned-executable-memory."
    ),
    check(
      "mac-library-validation",
      "Library validation preservada na distribuicao",
      !hasForbiddenEntitlements(mainPlist) && !hasForbiddenEntitlements(inheritPlist),
      "disable-library-validation ausente nos dois plists.",
      "Library validation foi desativada sem necessidade declarada.",
      "Remover com.apple.security.cs.disable-library-validation dos entitlements."
    ),
    check(
      "mac-local-adhoc-entitlements",
      "Excecao ad-hoc isolada do pacote publico",
      existsSync(localFullPath) && hasExpectedEntitlements(localPlist) && hasForbiddenEntitlements(localPlist),
      `${expectedLocalPath} reservado ao fallback local sem TeamIdentifier.`,
      "O fallback ad-hoc local nao possui seus entitlements isolados.",
      "Manter disable-library-validation apenas em build/entitlements.mac.local.plist."
    ),
    check(
      "mac-hardened-runtime",
      "Hardened runtime preservado",
      mac.hardenedRuntime === true,
      `hardenedRuntime=${String(mac.hardenedRuntime)}`,
      "hardenedRuntime nao esta explicitamente habilitado no build macOS.",
      "Definir build.mac.hardenedRuntime=true."
    ),
    check(
      "mac-info-plist-hardening",
      "Info.plist saneado antes da assinatura",
      build.afterPack === "./scripts/after-pack-macos.mjs",
      `afterPack=${String(build.afterPack ?? "ausente")}`,
      "O hook de hardening do Info.plist nao esta configurado antes da assinatura.",
      "Definir build.afterPack=./scripts/after-pack-macos.mjs."
    )
  ];

  const blockers = items.filter((item) => item.state === "blocked").map((item) => item.issue);

  return {
    status: blockers.length === 0 ? "ready" : "blocked",
    generatedAt: new Date().toISOString(),
    packageJsonPath: packagePath,
    note:
      "Esta auditoria prepara o pacote para assinatura Developer ID/notarizacao, mas nao substitui credenciais reais nem execucao de notarizacao.",
    blockers,
    items
  };
}

function renderMarkdown(report) {
  const lines = [
    "# MacOS signing readiness",
    "",
    `- Gerado em: ${report.generatedAt}`,
    `- Status: ${report.status === "ready" ? "Configuracao pronta" : "Configuracao bloqueada"}`,
    `- package.json: ${report.packageJsonPath}`,
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
    "- Developer ID, Apple ID/API key do notarytool e validacao Gatekeeper continuam sendo gates externos de distribuicao publica."
  );

  return `${lines.join("\n")}\n`;
}

async function main() {
  const report = await auditMacosSigningReadiness();

  await mkdir(outputDir, { recursive: true });
  await writeFile(outputJsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(outputMarkdownPath, renderMarkdown(report), "utf8");

  console.log(`MacOS signing readiness: ${report.status}`);
  console.log(`- ${outputMarkdownPath}`);
  if (strictMode && report.status !== "ready") {
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
