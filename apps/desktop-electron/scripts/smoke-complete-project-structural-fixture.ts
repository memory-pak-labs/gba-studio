import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildEngineExportProjectContract } from "../src/main/exportEngineProject.js";
import { parseGBAProjectFile } from "../src/shared/projectFile.js";
import { bootPreviewRuntimeAtRoom } from "../src/shared/previewRuntime.js";
import {
  buildCompleteProjectFixture,
  validateCompleteProjectFixture
} from "../src/shared/completeProjectFixture.js";
import { validateGBAProjectMigrationContract } from "../../../packages/project-contract/src/index.js";

const appRoot = join(import.meta.dirname, "..");
const templatePath = join(appRoot, "default-assets", "templates", "exemplo-gba", "exemplo-gba.gba-project");
const source = parseGBAProjectFile(readFileSync(templatePath, "utf8")).data;
const fixture = buildCompleteProjectFixture(source);
const manifestErrors = validateCompleteProjectFixture(fixture.manifest);
const contractErrors = validateGBAProjectMigrationContract(fixture.data);

if (manifestErrors.length > 0) {
  throw new Error(`Manifesto da fixture estrutural inválido: ${manifestErrors.map((error) => `${error.path}: ${error.message}`).join(" | ")}`);
}
if (contractErrors.length > 0) {
  throw new Error(`Contrato do projeto fixture inválido: ${contractErrors.map((error) => `${error.validator}: ${error.message}`).join(" | ")}`);
}

const scenes = Array.isArray(fixture.data.scenas) ? fixture.data.scenas : [];
for (const scene of fixture.manifest.scenes) {
  const runtime = bootPreviewRuntimeAtRoom(fixture.data, scene.name);
  if (!runtime.ready || runtime.currentRoom?.name !== scene.name) {
    throw new Error(`Preview não inicializou a cena estrutural ${scene.name}.`);
  }
}

const exported = buildEngineExportProjectContract(fixture.data, { structuralFixture: fixture.manifest });
const exportedFixture = exported.structural_fixture;
if (!exportedFixture || exportedFixture.scene_count !== fixture.manifest.sceneCount || exportedFixture.production_ready !== false) {
  throw new Error("Export não carregou o manifesto da fixture estrutural com a marca não produtiva.");
}
if (fixture.data.assets?.length !== source.assets?.length) {
  throw new Error("A fixture estrutural não pode adicionar assets binários ao projeto.");
}
if (fixture.manifest.status !== "complete") {
  throw new Error(`A cobertura estrutural do template não está completa: ${fixture.manifest.status}.`);
}
if (fixture.manifest.scenes.some((scene) => scene.structuralStatus !== "complete")) {
  throw new Error("Uma ou mais cenas do template não foram cobertas estruturalmente.");
}

const placeholderCounts = Object.fromEntries(
  Array.from(new Set(fixture.manifest.scenes.flatMap((scene) => scene.placeholderRoles))).map((role) => [
    role,
    fixture.manifest.scenes.filter((scene) => scene.placeholderRoles.includes(role)).length
  ])
);

console.log(JSON.stringify({
  kind: "complete_structural_fixture",
  source: templatePath,
  scene_count: scenes.length,
  structural_status: fixture.manifest.status,
  production_ready: fixture.manifest.productionReady,
  assets_added: (fixture.data.assets?.length ?? 0) - (source.assets?.length ?? 0),
  preview_scenes_verified: fixture.manifest.scenes.length,
  export_scene_count: exportedFixture.scene_count,
  placeholder_scene_counts: placeholderCounts
}, null, 2));
