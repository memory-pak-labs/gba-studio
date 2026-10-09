import { runEngineWorkflow } from "./engine-workflow.js";

interface CliOptions {
  projectPath: string;
  destination: string;
  enginePackPath: string;
  actorSelector: string;
}

function usage(): string {
  return [
    "Uso: engine-workflow --project <arquivo> --destination <pasta> --engine-pack <pasta> --actor <id-ou-nome>",
    "",
    "Exporta pelo contrato atual do GBA Studio, valida com gbsdoctor, gera a ROM",
    "e executa o smoke check-only do mGBA."
  ].join("\n");
}

function parseArgs(args: string[]): CliOptions {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (!flag?.startsWith("--") || !value) {
      throw new Error(usage());
    }
    values.set(flag, value);
  }
  const projectPath = values.get("--project");
  const destination = values.get("--destination");
  const enginePackPath = values.get("--engine-pack");
  const actorSelector = values.get("--actor");
  if (!projectPath || !destination || !enginePackPath || !actorSelector) {
    throw new Error(usage());
  }
  return { projectPath, destination, enginePackPath, actorSelector };
}

try {
  const evidence = await runEngineWorkflow(parseArgs(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`Erro: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 2;
}
