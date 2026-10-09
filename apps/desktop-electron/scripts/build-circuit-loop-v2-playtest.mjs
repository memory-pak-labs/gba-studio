// Export the isolated Circuito Final V2 project through the production path.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { build } from "esbuild";
import { resolveEnginePackRoot } from "./resolve-engine-pack-root.mjs";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const projectPath = process.argv[2] ? path.resolve(process.argv[2]) : null;
const destination = process.argv[3] ? path.resolve(process.argv[3]) : null;
if (!projectPath || !destination) {
  throw new Error("Uso: node build-circuit-loop-v2-playtest.mjs <projeto.gba-project> <export-dir>");
}
const enginePackPath = resolveEnginePackRoot(appRoot);
const currentRacingTemplate = readFileSync(path.resolve(
  appRoot, "../../packages/GBAStudioEngine/templates/exported_racing/main.cpp"
));
const mixedRacingTemplate = readFileSync(path.join(
  enginePackPath, "templates/exported_mixed/racing_runtime.inc"
));
if (!currentRacingTemplate.equals(mixedRacingTemplate)) {
  throw new Error("O engine pack misto contém um racing_runtime.inc desatualizado");
}
const bundle = await build({
  stdin: {
    contents: 'export { prepareEngineProjectExport } from "./src/main/exportEngineProject.ts"; export { writeEngineSchemaExport } from "./src/main/engineProjectExport.ts";',
    resolveDir: appRoot
  },
  bundle: true,
  platform: "node",
  format: "esm",
  write: false
});
const { prepareEngineProjectExport, writeEngineSchemaExport } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`
);
const project = JSON.parse(readFileSync(projectPath, "utf8"));
const prepared = prepareEngineProjectExport(project, {
  enginePackPath,
  developmentStartScene: { name: "circuito_final" }
});
if (prepared.error) throw new Error(prepared.error);
await writeEngineSchemaExport({
  destination,
  prepared: prepared.generated,
  assetcPath: path.join(enginePackPath, "tools/assetc"),
  projectPath,
  cacheEnabled: false
});
const buildResult = spawnSync(path.join(enginePackPath, "tools/gbsbuild"), [
  "--engine-pack", enginePackPath,
  "--project-dir", destination,
  "--build-dir", path.join(destination, "build"),
  "--devkitpro", "/opt/devkitpro",
  "--devkitarm", "/opt/devkitpro/devkitARM"
], { stdio: "inherit" });
if (buildResult.status !== 0) process.exit(buildResult.status ?? 1);
console.log(path.join(destination, "build", `${prepared.generated.target}.gba`));
