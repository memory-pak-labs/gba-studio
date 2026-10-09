#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { validateBackgroundEvidence } from "./background-validator.mjs";

function usage() {
  return `Uso:
  node tools/gba-sprite-prep/gba-background-validate.mjs [opcoes]

Opcoes:
  --preparation-report <json>  Relatorio --prepare-background-4bpp
  --tile-report <json>         Relatorio --background-tile-report do assetc
  --pack-report <json>         asset_pack_report.json do Engine Pack
  --asset-id <id>              Asset BG a conferir no pack
  --tile-budget <N>            Orcamento esperado para o asset
  --palette-banks <N>          Maximo de bancos de paleta esperados
  --max-mapping-error <N>      Erro aceito; padrao: 0
  --output <json>              Salva a evidencia consolidada
  --help                       Mostra esta ajuda`;
}

function parseArgs(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--help" || argument === "-h") {
      console.log(usage());
      process.exit(0);
    }
    if (!argument.startsWith("--")) throw new Error(`Opcao desconhecida: ${argument}`);
    const value = args[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${argument} exige um valor`);
    const key = argument.slice(2).replaceAll(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    if (["tileBudget", "paletteBanks", "maxMappingError"].includes(key)) {
      const parsed = Number(value);
      if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${argument} precisa ser um numero >= 0`);
      options[key] = parsed;
    } else {
      options[key] = value;
    }
    index += 1;
  }
  if (!options.preparationReport && !options.tileReport && !options.packReport) {
    throw new Error("informe pelo menos um relatorio de evidencia");
  }
  return options;
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    throw new Error(`falha ao ler JSON '${path}': ${error.message}`);
  }
}

function exitCode(status) {
  if (status === "pack-validated") return 0;
  if (status === "candidate" || status === "impossible") return 2;
  return 1;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const report = validateBackgroundEvidence({
    preparationReport: options.preparationReport ? await readJson(options.preparationReport) : undefined,
    tileReport: options.tileReport ? await readJson(options.tileReport) : undefined,
    packReport: options.packReport ? await readJson(options.packReport) : undefined,
    assetId: options.assetId,
    tileBudget: options.tileBudget,
    paletteBanks: options.paletteBanks,
    maxMappingError: options.maxMappingError ?? 0,
  });
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (options.output) await writeFile(options.output, serialized, "utf8");
  process.stdout.write(serialized);
  process.exitCode = exitCode(report.status);
}

main().catch((error) => {
  console.error(`Erro: ${error.message}`);
  console.error(usage());
  process.exitCode = 2;
});
