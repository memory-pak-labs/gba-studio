import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCompleteProjectFixture, validateCompleteProjectFixture } from "../src/shared/completeProjectFixture.js";
import { serializeGBAProjectFile, parseGBAProjectFile } from "../src/shared/projectFile.js";

const scriptDirectory = resolve(fileURLToPath(new URL(".", import.meta.url)));
const appRoot = resolve(scriptDirectory, "..");
const sourceDirectory = join(appRoot, "default-assets", "templates", "exemplo-gba");
const sourceProjectPath = join(sourceDirectory, "exemplo-gba.gba-project");

function outputArgument(): string | null {
  const inline = process.argv.find((argument) => argument.startsWith("--output="));
  if (inline) return inline.slice("--output=".length).trim() || null;
  const index = process.argv.indexOf("--output");
  return index >= 0 ? process.argv[index + 1]?.trim() || null : null;
}

const requestedOutput = outputArgument();
if (!requestedOutput) {
  throw new Error("Informe um diretório de saída vazio com --output=/caminho/da/fixture.");
}

const outputDirectory = resolve(requestedOutput);
if (outputDirectory === sourceDirectory || outputDirectory.startsWith(`${sourceDirectory}/`)) {
  throw new Error("O diretório de saída não pode ser o template canônico nem um diretório dentro dele.");
}
if (existsSync(outputDirectory) && readdirSync(outputDirectory).length > 0) {
  throw new Error(`O diretório de saída não está vazio: ${outputDirectory}`);
}

mkdirSync(outputDirectory, { recursive: true });
cpSync(sourceDirectory, outputDirectory, { recursive: true, force: false });

const source = parseGBAProjectFile(readFileSync(sourceProjectPath, "utf8")).data;
const fixture = buildCompleteProjectFixture(source);
const errors = validateCompleteProjectFixture(fixture.manifest);
if (errors.length > 0) {
  throw new Error(`Manifesto estrutural inválido: ${errors.map((error) => `${error.path}: ${error.message}`).join(" | ")}`);
}

const outputProjectPath = join(outputDirectory, "exemplo-gba.gba-project");
writeFileSync(outputProjectPath, serializeGBAProjectFile(parseGBAProjectFile(JSON.stringify(fixture.data))), "utf8");

console.log(JSON.stringify({
  kind: "complete_structural_fixture_materialized",
  source: sourceProjectPath,
  output: outputProjectPath,
  scene_count: fixture.manifest.sceneCount,
  production_ready: fixture.manifest.productionReady,
  assets_copied_without_new_project_assets: true
}, null, 2));
