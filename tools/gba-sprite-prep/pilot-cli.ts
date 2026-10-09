import path from "node:path";
import { runPilot } from "./pilot-runner.js";
import { resolvePilotRepositoryRoot } from "./pilot-cli-options.js";

function parseArgs(args: string[]): { destination: string; enginePackPath: string } {
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    console.log("Uso: gba-sprite-pilot <pasta-saida> [--engine-pack <pasta>]");
    process.exit(args.length === 0 ? 2 : 0);
  }
  const destination = args[0];
  const enginePackIndex = args.indexOf("--engine-pack");
  const enginePackPath = enginePackIndex >= 0
    ? args[enginePackIndex + 1]
    : path.resolve("packages/GBAStudioEngine/dist/GBAStudioEnginePack");
  if (!enginePackPath) throw new Error("--engine-pack exige uma pasta.");
  return { destination, enginePackPath };
}

const repositoryRoot = resolvePilotRepositoryRoot(process.env, import.meta.dirname);
const options = parseArgs(process.argv.slice(2));
const summary = await runPilot({ repositoryRoot, ...options });
console.log(`Piloto aprovado: ${summary.casesPassed}/${summary.casesTotal} casos.`);
console.log(path.join(path.resolve(options.destination), "pilot-summary.json"));
