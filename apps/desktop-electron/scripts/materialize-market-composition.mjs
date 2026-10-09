import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyMarketComposition } from './market-suspenso-composition.mjs';

const app = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = process.argv[2];
if (!output) throw new Error('Pass a new output directory for the full candidate project');
const target = resolve(output);
const template = join(app, 'default-assets/templates/exemplo-gba');
const templateProject = JSON.parse(await readFile(join(template, 'exemplo-gba.gba-project'), 'utf8'));
if (!templateProject.assets?.some((asset) => asset?.name === 'mercado-suspenso-modules-v5.png')) {
  throw new Error('Composição modular aposentada: o manifesto atual do Exemplo GBA não declara mercado-suspenso-modules-v5.png.');
}
await mkdir(target); // refuse to overwrite a previous project
await cp(join(template, 'Assets'), join(target, 'Assets'), { recursive: true });
const atlas = resolve(app, '../../tools/gba-sprite-prep/production/mercado-suspenso-isometrica-v1-approved/prepared/background/mercado-modules-atlas-256x256-8bpp-220-color-candidate.png');
await cp(atlas, join(target, 'Assets/backgrounds/mercado-suspenso-modules-v5.png'));
const project = applyMarketComposition(templateProject);
project.settings.build.enginePackPath = resolve(app, '../../packages/GBAStudioEngine/dist/GBAStudioEnginePack');
const path = join(target, 'exemplo-gba.gba-project');
await writeFile(path, JSON.stringify(project, null, 2) + '\n');
console.log(path);
