import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { build } from 'esbuild';
const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [projectPath, destination, enginePackPath, scene = 'porto_lumen'] = process.argv.slice(2).map((arg, i) => i < 3 ? path.resolve(arg) : arg);
if (!enginePackPath) throw new Error('Uso: node build-ingame-menu-playtest.mjs <project> <export-dir> <pack> [scene]');
const engine = path.resolve(appRoot, '../../packages/GBAStudioEngine');
for (const [runtime, source] of [['world_map','templates/exported_world_map/main.cpp'], ['menu','templates/exported_menu/main.cpp'], ['topdown','examples/topdown_basic/src/main.cpp'], ['platformer','examples/platformer_basic/src/main.cpp'], ['isometric','examples/isometric_basic/src/main.cpp'], ['dungeon_crawler','templates/exported_dungeon_crawler/main.cpp']]) {
  if (!readFileSync(path.join(engine,source)).equals(readFileSync(path.join(enginePackPath,`templates/exported_mixed/${runtime}_runtime.inc`)))) throw new Error(`Pack desatualizado: ${runtime}`);
}
const bundle = await build({ stdin: { contents: 'export { prepareEngineProjectExport } from "./src/main/exportEngineProject.ts"; export { writeEngineSchemaExport } from "./src/main/engineProjectExport.ts";', resolveDir: appRoot }, bundle:true, platform:'node', format:'esm', write:false });
const {prepareEngineProjectExport,writeEngineSchemaExport} = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const project=JSON.parse(readFileSync(projectPath,'utf8'));
const prepared=prepareEngineProjectExport(project,{enginePackPath,developmentStartScene:{name:scene}});
if(prepared.error) throw new Error(prepared.error);
await writeEngineSchemaExport({destination,prepared:prepared.generated,assetcPath:path.join(enginePackPath,'tools/assetc'),projectPath,cacheEnabled:true});
const result=spawnSync(path.join(enginePackPath,'tools/gbsbuild'),['--engine-pack',enginePackPath,'--project-dir',destination,'--build-dir',path.join(destination,'build'),'--devkitpro','/opt/devkitpro','--devkitarm','/opt/devkitpro/devkitARM'],{stdio:'inherit'});
if(result.status!==0) process.exit(result.status??1);
console.log(path.join(destination,'build',`${prepared.generated.target}.gba`));
