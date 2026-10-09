import {
  validateGBAProjectMigrationContract,
  type GBAProjectData,
  type GBAProjectMigrationContractValidator
} from "../../../../packages/project-contract/src/index.js";

export interface ProjectContractDiagnostics {
  ok: boolean;
  issueCount: number;
  validatorLabels: GBAProjectMigrationContractValidator[];
  validatorCounts: Array<{ validator: GBAProjectMigrationContractValidator; count: number }>;
  summary: string;
  detail: string;
}

export function deriveProjectContractDiagnostics(data: GBAProjectData): ProjectContractDiagnostics {
  const issues = validateGBAProjectMigrationContract(data);
  const validatorLabels = Array.from(new Set(issues.map((issue) => issue.validator)));
  const validatorCounts = validatorLabels.map((validator) => ({
    validator,
    count: issues.filter((issue) => issue.validator === validator).length
  }));

  if (issues.length === 0) {
    return {
      ok: true,
      issueCount: 0,
      validatorLabels,
      validatorCounts,
      summary: "Contrato de migracao pronto para export.",
      detail: "Arquivos, Cenas, Sprites, Eventos, Áudio e Ajustes passaram no gate compartilhado."
    };
  }

  return {
    ok: false,
    issueCount: issues.length,
    validatorLabels,
    validatorCounts,
    summary: "Contrato de migracao com pendencias.",
    detail: `Pendencias por validador: ${validatorCounts.map((item) => `${item.validator} ${item.count}`).join(", ")}.`
  };
}
