export const hardwareSoakCheckNames = [
  "boot",
  "sceneTransitions",
  "graphicsAndParallax",
  "audio",
  "input",
  "saves",
  "dmaAndScanlines",
  "oamStress",
  "linkCable"
] as const;

export type HardwareSoakCheckName = typeof hardwareSoakCheckNames[number];

export interface HardwareSoakEvidence {
  schema: 1;
  evidenceType: "hardware_real";
  status: "passed";
  checkedAt: string;
  romSha256: string;
  durationMinutes: number;
  device: string;
  cartridge: string;
  tester: string;
  checks: Record<HardwareSoakCheckName, true>;
  notes?: string;
}

export interface HardwareSoakEvidenceValidationOptions {
  expectedRomSha256: string;
  minimumDurationMinutes?: number;
}

export interface HardwareSoakEvidenceValidationResult {
  ok: boolean;
  issues: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export function validateHardwareSoakEvidence(
  value: unknown,
  options: HardwareSoakEvidenceValidationOptions
): HardwareSoakEvidenceValidationResult {
  const issues: string[] = [];
  if (!isRecord(value)) {
    return { ok: false, issues: ["A evidência de hardware precisa ser um objeto JSON."] };
  }
  if (value.schema !== 1) issues.push("schema precisa ser 1.");
  if (value.evidenceType !== "hardware_real") {
    issues.push("evidenceType precisa ser hardware_real; emulador não aprova hardware físico.");
  }
  if (value.status !== "passed") issues.push("status precisa ser passed.");
  if (!nonEmptyString(value.checkedAt) || Number.isNaN(Date.parse(String(value.checkedAt)))) {
    issues.push("checkedAt precisa ser uma data ISO válida.");
  }
  if (!nonEmptyString(value.romSha256) || !/^[a-f0-9]{64}$/i.test(String(value.romSha256))) {
    issues.push("romSha256 precisa conter um hash SHA-256 válido.");
  } else if (String(value.romSha256).toLowerCase() !== options.expectedRomSha256.toLowerCase()) {
    issues.push("O hash da ROM testada não corresponde à ROM gerada.");
  }
  const minimumDurationMinutes = options.minimumDurationMinutes ?? 20;
  if (
    typeof value.durationMinutes !== "number"
    || !Number.isFinite(value.durationMinutes)
    || value.durationMinutes < minimumDurationMinutes
  ) {
    issues.push(`O soak físico precisa durar pelo menos ${minimumDurationMinutes} minutos.`);
  }
  for (const field of ["device", "cartridge", "tester"] as const) {
    if (!nonEmptyString(value[field])) issues.push(`${field} precisa ser informado.`);
  }
  if (!isRecord(value.checks)) {
    issues.push("checks precisa ser um objeto com o checklist físico.");
  } else {
    for (const check of hardwareSoakCheckNames) {
      if (value.checks[check] !== true) {
        issues.push(`O check ${check} precisa estar aprovado.`);
      }
    }
  }
  return { ok: issues.length === 0, issues };
}
