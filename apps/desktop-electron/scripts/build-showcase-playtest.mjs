// Build the whole canonical project. An optional council decision is an explicit ending-only QA fixture.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { build } from 'esbuild';
import { resolveEnginePackRoot } from './resolve-engine-pack-root.mjs';
const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = process.argv[2];
if (!root)
    throw new Error('Provide a new output directory');
const projectPath = path.join(app, 'default-assets/templates/exemplo-gba/exemplo-gba.gba-project');
const enginePackPath = resolveEnginePackRoot(app);
const bundle = await build({ stdin: { contents: 'export { prepareEngineProjectExport } from "./src/main/exportEngineProject.ts"; export { writeEngineSchemaExport } from "./src/main/engineProjectExport.ts";', resolveDir: app }, bundle: true, platform: 'node', format: 'esm', write: false,
    loader: { '.gba-project': 'text' }, banner: { js: `import {createRequire} from 'node:module'; const require=createRequire(${JSON.stringify(path.join(app, 'package.json'))});` } });
const { prepareEngineProjectExport, writeEngineSchemaExport } = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const project=JSON.parse(fs.readFileSync(projectPath,'utf8'));
const branch=process.argv.find(a=>a.startsWith('--council-path='))?.split('=')[1];
if(branch){if(!['1','2'].includes(branch))throw Error('Council path must be 1 or 2');project.variables.find(v=>v.name==='var_council_path').initialValue=Number(branch);const entry=project.events.find(e=>e.name===project.scenas.find(s=>s.name==='circuito_final').eventBindings.onInit);entry.steps.unshift({id:'ending-fixture-pact',command:'set_variable var_council_path '+branch,isEnabled:true});}
const result=prepareEngineProjectExport(project,{enginePackPath,developmentStartScene:{name:process.argv[3]??'titulo'}});
if (result.error)
    throw new Error(result.error);
await writeEngineSchemaExport({ destination: path.resolve(root), prepared: result.generated, assetcPath: path.join(enginePackPath, 'tools/assetc'), projectPath, cacheEnabled: false });
const built = spawnSync(path.join(enginePackPath, 'tools/gbsbuild'), ['--engine-pack', enginePackPath, '--project-dir', path.resolve(root), '--build-dir', path.resolve(root, 'build'), '--devkitpro', '/opt/devkitpro', '--devkitarm', '/opt/devkitpro/devkitARM'], { stdio: 'inherit' });
if (built.status !== 0)
    process.exit(built.status ?? 1);
console.log(path.resolve(root, 'build', result.generated.target + '.gba'));
