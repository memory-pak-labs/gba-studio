export type ReadinessState = "passed" | "warning" | "blocked";
export type ReadinessStatus = "ready" | "blocked";

export interface MacosPilotReadinessItem {
  id: string;
  label: string;
  state: ReadinessState;
  evidence: string;
  issue?: string;
  nextStep?: string;
}

export interface MacosPilotReadinessReport {
  status: ReadinessStatus;
  blockers: string[];
  warnings: string[];
  items: MacosPilotReadinessItem[];
}

interface BundleEvidence {
  ok?: boolean;
  appPath?: string;
  executablePath?: string;
  hasIcon?: boolean;
  hasProjectDocumentIcon?: boolean;
  hasAppAsar?: boolean;
  projectDocumentIconFile?: string;
  documentExtensions?: string[];
}

interface ProjectValidationEvidence {
  ok?: boolean;
  samples?: Array<{ kind?: string }>;
}

interface VisualManifestEvidence {
  ok?: boolean;
  captures?: Array<{ label?: string; path?: string; bytes?: number }>;
}

interface EngineRomEvidence {
  ok?: boolean;
  romPath?: string;
  mgbaMode?: string;
  manualVisualPlaytestPassed?: boolean;
}

interface AuditItemEvidence {
  state?: string;
}

interface AuditStatusEvidence {
  status?: string;
  items?: AuditItemEvidence[];
}

export interface MacosPilotReadinessEvidence {
  bundle?: BundleEvidence;
  projectValidation?: ProjectValidationEvidence;
  visualManifest?: VisualManifestEvidence;
  engineRom?: EngineRomEvidence;
  crossPlatformPackage?: AuditStatusEvidence;
  macosSigning?: AuditStatusEvidence;
  humanVisualReviewApproved?: boolean;
  swiftCanonicalDecisionApproved?: boolean;
  developerIdSigned?: boolean;
  windowsLinuxCiGreen?: boolean;
}

export interface MacosPilotManualApprovals {
  manualMgbaPlaytestApproved?: boolean;
  humanVisualReviewApproved?: boolean;
  swiftCanonicalDecisionApproved?: boolean;
  developerIdSigned?: boolean;
  windowsLinuxCiGreen?: boolean;
}

export interface MacosPilotVisualReviewApproval {
  requiredAreas?: string[];
  areas?: Record<string, { approved?: boolean }>;
}

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

function readinessItem(
  id: string,
  label: string,
  state: ReadinessState,
  evidence: string,
  issue: string | undefined,
  nextStep: string
): MacosPilotReadinessItem {
  return {
    id,
    label,
    state,
    evidence,
    ...(state === "blocked" && issue ? { issue } : {}),
    nextStep
  };
}

function hasAllProjectSamples(projectValidation?: ProjectValidationEvidence): boolean {
  const kinds = new Set(projectValidation?.samples?.map((sample) => sample.kind).filter(Boolean));
  return ["template", "fixture", "real"].every((kind) => kinds.has(kind));
}

function hasRequiredWorkspaceCaptures(visualManifest?: VisualManifestEvidence): boolean {
  const labels = new Set(visualManifest?.captures?.map((capture) => capture.label).filter(Boolean));
  return requiredWorkspaceLabels.every((aliases) => aliases.some((label) => labels.has(label)));
}

function hasMacosBundleEvidence(bundle?: BundleEvidence): boolean {
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

function hasManualOpenRomEvidence(engineRom?: EngineRomEvidence): boolean {
  return Boolean(engineRom?.ok && engineRom.romPath && engineRom.mgbaMode === "manual-open");
}

function hasAuditReadyEvidence(evidence?: AuditStatusEvidence): boolean {
  return evidence?.status === "ready" &&
    Array.isArray(evidence.items) &&
    evidence.items.every((item) => item.state === "passed");
}

function approved(existing: boolean | undefined, manual: boolean | undefined): boolean | undefined {
  return existing === true || manual === true ? true : existing;
}

function hasApprovedAllVisualReviewAreas(approval?: MacosPilotVisualReviewApproval): boolean {
  const requiredAreas = approval?.requiredAreas?.filter(Boolean) ?? [];
  if (requiredAreas.length === 0) {
    return false;
  }

  return requiredAreas.every((areaID) => approval?.areas?.[areaID]?.approved === true);
}

export function mergeMacosPilotManualApprovals(
  evidence: MacosPilotReadinessEvidence,
  approvals?: MacosPilotManualApprovals
): MacosPilotReadinessEvidence {
  if (!approvals) {
    return evidence;
  }

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

export function mergeMacosPilotVisualReviewApproval(
  evidence: MacosPilotReadinessEvidence,
  approval?: MacosPilotVisualReviewApproval
): MacosPilotReadinessEvidence {
  if (!approval) {
    return evidence;
  }

  return {
    ...evidence,
    humanVisualReviewApproved: approved(
      evidence.humanVisualReviewApproved,
      hasApprovedAllVisualReviewAreas(approval)
    )
  };
}

export function createMacosPilotReadinessReport(evidence: MacosPilotReadinessEvidence): MacosPilotReadinessReport {
  const items: MacosPilotReadinessItem[] = [
    readinessItem(
      "macos-app",
      "macOS .app empacotado",
      hasMacosBundleEvidence(evidence.bundle) ? "passed" : "blocked",
      evidence.bundle?.appPath ?? "Evidencia de bundle ausente.",
      "Bundle macOS .app ainda nao tem evidencia completa.",
      "Rodar npm run smoke:package e validar bundle_evidence.json."
    ),
    readinessItem(
      "project-persistence",
      "Criar, abrir, salvar e reabrir projetos",
      evidence.projectValidation?.ok && hasAllProjectSamples(evidence.projectValidation) ? "passed" : "blocked",
      `${evidence.projectValidation?.samples?.length ?? 0} amostra(s) validadas.`,
      "Validacao de projetos ainda nao cobre o template completo, a fixture de contrato e um projeto real.",
      "Rodar npm run smoke:projects e garantir amostras template, fixture e real."
    ),
    readinessItem(
      "workspace-smoke",
      "Workspaces principais capturados",
      evidence.visualManifest?.ok && hasRequiredWorkspaceCaptures(evidence.visualManifest) ? "passed" : "blocked",
      `${evidence.visualManifest?.captures?.length ?? 0} captura(s) registradas.`,
      "Capturas dos workspaces principais ainda estao incompletas.",
      "Rodar npm run smoke:visual e revisar manifest.json."
    ),
    readinessItem(
      "engine-rom",
      "ROM exportada e aberta no mGBA",
      hasManualOpenRomEvidence(evidence.engineRom) ? "passed" : "blocked",
      evidence.engineRom?.romPath ?? "ROM ausente.",
      "ROM exportada ainda nao tem evidencia de abertura manual no mGBA.",
      "Rodar smoke:engine-rom com -- --open-mgba."
    ),
    readinessItem(
      "manual-mgba-playtest",
      "Playtest visual/manual mGBA aprovado",
      evidence.engineRom?.manualVisualPlaytestPassed ? "passed" : "blocked",
      evidence.engineRom?.manualVisualPlaytestPassed ? "Checklist aprovado." : "Checklist ainda nao aprovado.",
      "Playtest visual/manual do mGBA ainda nao foi aprovado.",
      "Aprovar manualmente artifacts/engine-rom/latest/manual_mgba_playtest.md."
    ),
    readinessItem(
      "visual-review",
      "Revisao visual humana dos screenshots",
      evidence.humanVisualReviewApproved ? "passed" : "blocked",
      evidence.humanVisualReviewApproved ? "Revisao visual aprovada." : "Revisao visual humana pendente.",
      "Revisao visual humana dos screenshots ainda nao foi aprovada.",
      "Comparar artifacts/visual-responsive/latest com as referencias historicas."
    ),
    readinessItem(
      "swift-canonical-decision",
      "Electron canonico confirmado",
      evidence.swiftCanonicalDecisionApproved ? "passed" : "blocked",
      evidence.swiftCanonicalDecisionApproved ? "Decisao aprovada." : "Aprovacao explicita pendente.",
      "Decisao sobre manter o Electron como app canonico ainda esta pendente.",
      "Confirmar que os gates Electron continuam verdes antes de distribuicao."
    ),
    {
      id: "developer-id",
      label: "Developer ID e notarizacao",
      state: evidence.developerIdSigned ? "passed" : "warning",
      evidence: evidence.developerIdSigned
        ? "Assinatura Developer ID presente."
        : hasAuditReadyEvidence(evidence.macosSigning)
          ? "Entitlements e hardened runtime preparados; falta credencial Developer ID/notarizacao real."
          : "Pacote local abre, mas assinatura publica ainda pendente.",
      nextStep: hasAuditReadyEvidence(evidence.macosSigning)
        ? "Executar signing/notarization com credenciais Apple antes de distribuicao publica."
        : "Configurar entitlements, Developer ID/notarization na etapa de distribuicao publica."
    },
    {
      id: "windows-linux",
      label: "Windows/Linux monitorados",
      state: evidence.windowsLinuxCiGreen ? "passed" : "warning",
      evidence: evidence.windowsLinuxCiGreen
        ? "CI remoto cross-platform verde."
        : hasAuditReadyEvidence(evidence.crossPlatformPackage)
          ? "Configuracao local cross-platform auditada; CI remoto Windows/Linux ainda pendente."
          : "CI remoto Windows/Linux ainda sem evidencia local.",
      nextStep: hasAuditReadyEvidence(evidence.crossPlatformPackage)
        ? "Rodar workflow CI e validar os artefatos Windows/Linux quando o piloto macOS estiver aprovado."
        : "Rodar workflow CI quando o piloto macOS estiver aprovado."
    }
  ];

  const blockers = items
    .filter((item) => item.state === "blocked")
    .map((item) => item.issue ?? item.label);
  const warnings = items
    .filter((item) => item.state === "warning")
    .map((item) => item.nextStep ?? item.label);

  return {
    status: blockers.length === 0 ? "ready" : "blocked",
    blockers,
    warnings,
    items
  };
}
