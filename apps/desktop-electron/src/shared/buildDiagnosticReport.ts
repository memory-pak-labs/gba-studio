import type { EnginePackBuildResult, EnginePackDoctorSummary } from "./ipc.js";

export interface BuildEnvironmentSnapshot {
  capturedAt: string;
  editorVersion: string | null;
  engineVersion: string | null;
  compilerVersion: string | null;
  platform: string;
  arch: string;
  kind: string;
  makeTarget: string;
  incrementalCache: boolean;
  customCompilerFlags: boolean;
}

const knownKinds = ["topdown", "platformer", "isometric", "mixed", "dungeon_crawler", "racing", "battle_rpg", "luta", "menu", "cutscene", "visual_novel", "point_click", "shmup", "world_map"];
const version = (value: unknown): string | null => typeof value === "string" && /^\d+\.\d+(?:\.\d+)?(?:-[a-zA-Z0-9.-]+)?$/.test(value) ? value : null;
const count = (value: unknown): number | null => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
const choice = (value: unknown, allowed: string[]): string => typeof value === "string" && allowed.includes(value) ? value : "unknown";

function probableBuildCause(result: EnginePackBuildResult) {
  const evidence = `${result.error ?? ""}\n${result.stderr ?? ""}\n${result.stdout ?? ""}`;
  const causes: [string, RegExp, string, string][] = [
    ["EWRAM_OVERFLOW", /(?:ewram[^\n]*(?:overflow|will not fit)|region[^\n]*ewram[^\n]*(?:overflow|will not fit))/i, "A ROM excede a EWRAM.", "Reduza buffers ou dados residentes e confira o relatório de memória."],
    ["IWRAM_OVERFLOW", /(?:iwram[^\n]*(?:overflow|will not fit)|region[^\n]*iwram[^\n]*(?:overflow|will not fit))/i, "A ROM excede a IWRAM.", "Confira código e dados residentes na IWRAM."],
    ["ROM_OVERFLOW", /(?:rom[^\n]*(?:overflow|will not fit)|region[^\n]*rom[^\n]*(?:overflow|will not fit))/i, "A ROM excede a região de ROM.", "Revise os assets e o orçamento de ROM."],
    ["INPUTS_CHANGED", /(?:mudaram durante|inputs changed|sources changed)/i, "As fontes mudaram durante a compilação.", "Execute a compilação novamente com o projeto salvo."],
    ["TOOLCHAIN_MISSING", /(?:devkitARM.*(?:nao encontrado|não encontrado|missing)|arm-none-eabi[^\n]*(?:not found|ENOENT)|toolchain[^\n]*(?:missing|nao|não))/i, "A toolchain não está disponível.", "Execute Verificar caminhos e o diagnóstico do Engine Pack."],
    ["ENGINE_PACK_MISSING", /(?:nenhum GBAStudioEnginePack|Engine Pack[^\n]*nao possui|engine pack[^\n]*missing)/i, "O Engine Pack está ausente ou incompleto.", "Confira o Engine Pack selecionado nos ajustes de compilação."],
    ["ASSET_BUDGET", /(?:tile|palette|oam|paleta)[^\n]*(?:exceed|limit|limite|excede)/i, "Um recurso gráfico excede o orçamento.", "Consulte Saúde do projeto e a análise de assets da cena."],
    ["MISSING_HEADER", /fatal error:[^\n]*(?:No such file|file not found)/i, "A compilação não encontrou um arquivo incluído.", "Confira os arquivos gerados pelo assetc e a integridade do Engine Pack."],
    ["LINK_ERROR", /(?:undefined reference|undefined symbols|ld: error|multiple definition)/i, "O linker não conseguiu resolver os símbolos da ROM.", "Confira a versão do Engine Pack e os módulos exportados."],
    ["COMPILE_ERROR", /(?:fatal error:|\berror:)/i, "O compilador rejeitou o código gerado.", "Consulte o log local para identificar o arquivo e a linha."],
  ];
  if (result.ran && result.exitCode === 0 && !result.error) return { code: "NONE", message: "Compilação concluída.", nextStep: "" };
  const match = causes.find(([, pattern]) => pattern.test(evidence));
  return match ? { code: match[0], message: match[2], nextStep: match[3] }
    : { code: "UNKNOWN", message: "A evidência disponível não permite identificar a causa.", nextStep: "Execute o diagnóstico do Engine Pack e consulte o log local." };
}

/** Explicit allowlist: raw logs, commands, paths, titles and messages never enter shared output. */
export function buildDiagnosticReport(result: EnginePackBuildResult, doctor?: EnginePackDoctorSummary | null) {
  const environment = result.environment;
  return {
    schema: 1,
    status: !result.ran ? "not-started" : result.exitCode === 0 && !result.error ? "success" : "failed",
    exitCode: typeof result.exitCode === "number" && Number.isSafeInteger(result.exitCode) ? result.exitCode : null,
    capturedAt: environment?.capturedAt && /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(environment.capturedAt) ? environment.capturedAt : null,
    versions: { editor: version(environment?.editorVersion), enginePack: version(environment?.engineVersion ?? doctor?.engineVersion), compiler: version(environment?.compilerVersion) },
    configuration: {
      platform: choice(environment?.platform, ["darwin", "linux", "win32"]),
      arch: choice(environment?.arch, ["arm64", "x64", "ia32"]),
      kind: choice(environment?.kind, knownKinds),
      makeTarget: choice(environment?.makeTarget, ["all", "debug", "release", "custom"]),
      incrementalCache: typeof environment?.incrementalCache === "boolean" ? environment.incrementalCache : null,
      customCompilerFlags: typeof environment?.customCompilerFlags === "boolean" ? environment.customCompilerFlags : null
    },
    romBytes: count(result.summary?.romBytes),
    reusedVerifiedRom: /ROM reutilizada \((?:variante, )?conteudo e dependencias verificados\)/.test(result.stdout ?? ""),
    probableCause: probableBuildCause(result),
    doctor: doctor ? { ok: doctor.ok === true, checksPassed: count(doctor.checksPassed), checksTotal: count(doctor.checksTotal), codes: doctor.blockers.map(blocker => blocker.id).filter(id => /^GBS_DOCTOR_[A-Z0-9_]+$/.test(id)) } : null,
    rawLogsIncluded: false
  };
}
