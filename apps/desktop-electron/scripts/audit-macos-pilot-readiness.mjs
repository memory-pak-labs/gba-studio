#!/usr/bin/env node
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const appRoot = path.resolve(path.dirname(scriptPath), "..");
const artifactsRoot = path.join(appRoot, "artifacts");
const outputDir = path.join(artifactsRoot, "macos-pilot-readiness", "latest");
const outputJsonPath = path.join(outputDir, "macos_pilot_readiness.json");
const outputMarkdownPath = path.join(outputDir, "macos_pilot_readiness.md");
const manualApprovalsPath = path.resolve(
  process.env.GBA_STUDIO_MACOS_PILOT_APPROVALS_PATH ??
    path.join(outputDir, "manual_approvals.json")
);
const manualApprovalsTemplatePath = path.join(outputDir, "manual_approvals.template.json");
const visualReviewApprovalPath = path.resolve(
  process.env.GBA_STUDIO_VISUAL_REVIEW_APPROVAL_PATH ??
    path.join(artifactsRoot, "visual-review", "latest", "visual_review_approval.json")
);
const strictMode = process.argv.includes("--strict");

const requiredWorkspaceLabels = [
  ["Welcome", "Projeto runtime"],
  ["Editor"],
  ["Eventos"],
  ["Sprites"],
  ["Dialogos", "Diálogos"],
  ["Audio", "Áudio"],
  ["Arquivos"],
  ["Ajustes", "Settings"]
];

async function readJsonIfExists(filePath) {
  if (!existsSync(filePath)) return undefined;
  return JSON.parse(await readFile(filePath, "utf8"));
}

function manualApprovalTemplate() {
  return {
    manualMgbaPlaytestApproved: false,
    humanVisualReviewApproved: false,
    swiftCanonicalDecisionApproved: false,
    developerIdSigned: false,
    windowsLinuxCiGreen: false,
    approvedBy: "",
    approvedAt: "",
    notes: "Copie este arquivo para manual_approvals.json e altere somente campos realmente aprovados para true."
  };
}

function hasMacosBundleEvidence(bundle) {
  return Boolean(
    bundle?.ok &&
    bundle.appPath &&
    bundle.executablePath &&
    bundle.hasIcon &&
    bundle.hasProjectDocumentIcon &&
    bundle.hasAppAsar &&
    bundle.projectDocumentIconFile === "file-gbastudio.icns" &&
    bundle.documentExtensions?.includes("gba-project") &&
    bundle.documentExtensions?.includes("gbastudio")
  );
}

function hasAllProjectSamples(projectValidation) {
  const kinds = new Set(projectValidation?.samples?.map((sample) => sample.kind).filter(Boolean));
  return ["template", "fixture", "real"].every((kind) => kinds.has(kind));
}

function hasRequiredWorkspaceCaptures(visualManifest) {
  const labels = new Set(visualManifest?.captures?.map((capture) => capture.label).filter(Boolean));
  return requiredWorkspaceLabels.every((aliases) => aliases.some((label) => labels.has(label)));
}

function hasManualOpenRomEvidence(engineRom) {
  return Boolean(engineRom?.ok && engineRom.romPath && engineRom.mgbaMode === "manual-open");
}

function hasCrossPlatformConfigEvidence(crossPlatformPackage) {
  return crossPlatformPackage?.status === "ready" &&
    Array.isArray(crossPlatformPackage.items) &&
    crossPlatformPackage.items.every((item) => item.state === "passed");
}

function hasMacosSigningConfigEvidence(macosSigning) {
  return macosSigning?.status === "ready" &&
    Array.isArray(macosSigning.items) &&
    macosSigning.items.every((item) => item.state === "passed");
}

function approved(existing, manual) {
  return existing === true || manual === true ? true : existing;
}

function hasApprovedAllVisualReviewAreas(approval) {
  const requiredAreas = approval?.requiredAreas?.filter(Boolean) ?? [];
  if (requiredAreas.length === 0) {
    return false;
  }

  return requiredAreas.every((areaID) => approval?.areas?.[areaID]?.approved === true);
}

function mergeVisualReviewApproval(evidence, approval) {
  if (!approval) return evidence;

  return {
    ...evidence,
    humanVisualReviewApproved: approved(
      evidence.humanVisualReviewApproved,
      hasApprovedAllVisualReviewAreas(approval)
    )
  };
}

function mergeManualApprovals(evidence, approvals) {
  if (!approvals) return evidence;

  const manualMgbaApproved = approvals.manualMgbaPlaytestApproved === true;
  return {
    ...evidence,
    engineRom: evidence.engineRom
      ? {
          ...evidence.engineRom,
          manualVisualPlaytestPassed:
            evidence.engineRom.manualVisualPlaytestPassed === true || manualMgbaApproved
        }
      : evidence.engineRom,
    humanVisualReviewApproved: approved(
      evidence.humanVisualReviewApproved,
      approvals.humanVisualReviewApproved
    ),
    swiftCanonicalDecisionApproved: approved(
      evidence.swiftCanonicalDecisionApproved,
      approvals.swiftCanonicalDecisionApproved
    ),
    developerIdSigned: approved(evidence.developerIdSigned, approvals.developerIdSigned),
    windowsLinuxCiGreen: approved(evidence.windowsLinuxCiGreen, approvals.windowsLinuxCiGreen)
  };
}

function item(id, label, state, evidence, issue, nextStep) {
  return {
    id,
    label,
    state,
    evidence,
    ...(state === "blocked" && issue ? { issue } : {}),
    ...(nextStep ? { nextStep } : {})
  };
}

function createReport(evidence) {
  const items = [
    item(
      "macos-app",
      "macOS .app empacotado",
      hasMacosBundleEvidence(evidence.bundle) ? "passed" : "blocked",
      evidence.bundle?.appPath ?? "Evidencia de bundle ausente.",
      "Bundle macOS .app ainda nao tem evidencia completa.",
      "Rodar npm run smoke:package e validar bundle_evidence.json."
    ),
    item(
      "project-persistence",
      "Criar, abrir, salvar e reabrir projetos",
      evidence.projectValidation?.ok && hasAllProjectSamples(evidence.projectValidation) ? "passed" : "blocked",
      `${evidence.projectValidation?.samples?.length ?? 0} amostra(s) validadas.`,
      "Validacao de projetos ainda nao cobre o template completo, a fixture de contrato e um projeto real.",
      "Rodar npm run smoke:projects e garantir amostras template, fixture e real."
    ),
    item(
      "workspace-smoke",
      "Workspaces principais capturados",
      evidence.visualManifest?.ok && hasRequiredWorkspaceCaptures(evidence.visualManifest) ? "passed" : "blocked",
      `${evidence.visualManifest?.captures?.length ?? 0} captura(s) registradas.`,
      "Capturas dos workspaces principais ainda estao incompletas.",
      "Rodar npm run smoke:visual e revisar manifest.json."
    ),
    item(
      "engine-rom",
      "ROM exportada e aberta no mGBA",
      hasManualOpenRomEvidence(evidence.engineRom) ? "passed" : "blocked",
      evidence.engineRom?.romPath ?? "ROM ausente.",
      "ROM exportada ainda nao tem evidencia de abertura manual no mGBA.",
      "Rodar smoke:engine-rom com -- --open-mgba."
    ),
    item(
      "manual-mgba-playtest",
      "Playtest visual/manual mGBA aprovado",
      evidence.engineRom?.manualVisualPlaytestPassed ? "passed" : "blocked",
      evidence.engineRom?.manualVisualPlaytestPassed ? "Checklist aprovado." : "Checklist ainda nao aprovado.",
      "Playtest visual/manual do mGBA ainda nao foi aprovado.",
      "Aprovar manualmente artifacts/engine-rom/latest/manual_mgba_playtest.md."
    ),
    item(
      "visual-review",
      "Revisao visual humana dos screenshots",
      evidence.humanVisualReviewApproved ? "passed" : "blocked",
      evidence.humanVisualReviewApproved ? "Revisao visual aprovada." : "Revisao visual humana pendente.",
      "Revisao visual humana dos screenshots ainda nao foi aprovada.",
      "Comparar artifacts/visual-responsive/latest com as referencias historicas."
    ),
    item(
      "swift-canonical-decision",
      "Electron canonico confirmado",
      evidence.swiftCanonicalDecisionApproved ? "passed" : "blocked",
      evidence.swiftCanonicalDecisionApproved ? "Decisao aprovada." : "Aprovacao explicita pendente.",
      "Decisao sobre manter o Electron como app canonico ainda esta pendente.",
      "Confirmar que os gates Electron continuam verdes antes de distribuicao."
    ),
    item(
      "developer-id",
      "Developer ID e notarizacao",
      evidence.developerIdSigned ? "passed" : "warning",
      evidence.developerIdSigned
        ? "Assinatura Developer ID presente."
        : hasMacosSigningConfigEvidence(evidence.macosSigning)
          ? "Entitlements e hardened runtime preparados; falta credencial Developer ID/notarizacao real."
          : "Pacote local abre, mas assinatura publica ainda pendente.",
      undefined,
      hasMacosSigningConfigEvidence(evidence.macosSigning)
        ? "Executar signing/notarization com credenciais Apple antes de distribuicao publica."
        : "Configurar entitlements, Developer ID/notarization na etapa de distribuicao publica."
    ),
    item(
      "windows-linux",
      "Windows/Linux monitorados",
      evidence.windowsLinuxCiGreen ? "passed" : "warning",
      evidence.windowsLinuxCiGreen
        ? "CI remoto cross-platform verde."
        : hasCrossPlatformConfigEvidence(evidence.crossPlatformPackage)
          ? "Configuracao local cross-platform auditada; CI remoto Windows/Linux ainda pendente."
          : "CI remoto Windows/Linux ainda sem evidencia local.",
      undefined,
      hasCrossPlatformConfigEvidence(evidence.crossPlatformPackage)
        ? "Rodar workflow CI e validar os artefatos Windows/Linux quando o piloto macOS estiver aprovado."
        : "Rodar npm run audit:cross-platform e depois o workflow CI quando o piloto macOS estiver aprovado."
    )
  ];

  const blockers = items.filter((entry) => entry.state === "blocked").map((entry) => entry.issue ?? entry.label);
  const warnings = items.filter((entry) => entry.state === "warning").map((entry) => entry.nextStep ?? entry.label);

  return {
    status: blockers.length === 0 ? "ready" : "blocked",
    generatedAt: new Date().toISOString(),
    blockers,
    warnings,
    items
  };
}

function renderMarkdown(report) {
  const statusLabel = report.status === "ready" ? "Pronto para decisao" : "Bloqueado para conclusao";
  const lines = [
    "# MacOS pilot readiness",
    "",
    `- Gerado em: ${report.generatedAt}`,
    `- Status: ${statusLabel}`,
    "",
    "## Itens",
    "",
    "| Item | Estado | Evidencia | Proximo passo |",
    "| --- | --- | --- | --- |"
  ];

  for (const item of report.items) {
    const state = item.state === "passed" ? "OK" : item.state === "warning" ? "Aviso" : "Bloqueado";
    lines.push(`| ${item.label} | ${state} | ${item.evidence} | ${item.nextStep ?? ""} |`);
  }

  lines.push("", "## Bloqueios", "");
  if (report.blockers.length === 0) {
    lines.push("- Nenhum.");
  } else {
    lines.push(...report.blockers.map((blocker) => `- ${blocker}`));
  }

  lines.push("", "## Avisos", "");
  if (report.warnings.length === 0) {
    lines.push("- Nenhum.");
  } else {
    lines.push(...report.warnings.map((warning) => `- ${warning}`));
  }

  lines.push("", "## Aprovacoes manuais", "");
  lines.push(`- Arquivo esperado: ${report.manualApprovals.path}`);
  lines.push(`- Template gerado: ${report.manualApprovals.templatePath}`);
  lines.push(`- Status: ${report.manualApprovals.loaded ? "carregado" : "nao encontrado"}`);
  lines.push(
    `- Revisao visual granular: ${
      report.visualReviewApproval.loaded
        ? report.visualReviewApproval.path
        : `${report.visualReviewApproval.path} (nao encontrado)`
    }`
  );
  lines.push(`- Areas visuais aprovadas: ${report.visualReviewApproval.allRequiredAreasApproved ? "sim" : "nao"}`);
  lines.push("- Observacao: somente campos explicitamente `true` contam como aprovados.");

  return `${lines.join("\n")}\n`;
}

async function main() {
  const manualApprovals = await readJsonIfExists(manualApprovalsPath);
  const visualReviewApproval = await readJsonIfExists(visualReviewApprovalPath);
  const evidence = mergeManualApprovals(mergeVisualReviewApproval({
    bundle: await readJsonIfExists(path.join(artifactsRoot, "macos-app", "latest", "bundle_evidence.json")),
    projectValidation: await readJsonIfExists(path.join(artifactsRoot, "project-validation", "latest", "project_validation_evidence.json")),
    visualManifest: await readJsonIfExists(path.join(artifactsRoot, "visual-responsive", "latest", "manifest.json")),
    engineRom: await readJsonIfExists(path.join(artifactsRoot, "engine-rom", "latest", "engine_rom_smoke_evidence.json")),
    crossPlatformPackage: await readJsonIfExists(path.join(artifactsRoot, "cross-platform-package", "latest", "cross_platform_package_config.json")),
    macosSigning: await readJsonIfExists(path.join(artifactsRoot, "macos-signing", "latest", "macos_signing_readiness.json")),
    humanVisualReviewApproved: process.env.GBA_STUDIO_VISUAL_REVIEW_APPROVED === "1",
    swiftCanonicalDecisionApproved: process.env.GBA_STUDIO_SWIFT_CANONICAL_DECISION_APPROVED === "1",
    developerIdSigned: process.env.GBA_STUDIO_DEVELOPER_ID_SIGNED === "1",
    windowsLinuxCiGreen: process.env.GBA_STUDIO_WINDOWS_LINUX_CI_GREEN === "1"
  }, visualReviewApproval), manualApprovals);
  const report = {
    ...createReport(evidence),
    manualApprovals: {
      path: manualApprovalsPath,
      templatePath: manualApprovalsTemplatePath,
      loaded: Boolean(manualApprovals)
    },
    visualReviewApproval: {
      path: visualReviewApprovalPath,
      loaded: Boolean(visualReviewApproval),
      allRequiredAreasApproved: hasApprovedAllVisualReviewAreas(visualReviewApproval)
    }
  };

  await mkdir(outputDir, { recursive: true });
  await writeFile(
    manualApprovalsTemplatePath,
    `${JSON.stringify(manualApprovalTemplate(), null, 2)}\n`,
    "utf8"
  );
  await writeFile(outputJsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(outputMarkdownPath, renderMarkdown(report), "utf8");

  console.log(`MacOS pilot readiness: ${report.status}`);
  console.log(`Relatorio JSON: ${outputJsonPath}`);
  console.log(`Relatorio Markdown: ${outputMarkdownPath}`);
  console.log(`Aprovacoes manuais: ${manualApprovals ? manualApprovalsPath : `${manualApprovalsPath} (nao encontrado)`}`);
  if (report.blockers.length > 0) {
    console.log("Bloqueios:");
    for (const blocker of report.blockers) {
      console.log(`- ${blocker}`);
    }
  }

  if (strictMode && report.blockers.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
