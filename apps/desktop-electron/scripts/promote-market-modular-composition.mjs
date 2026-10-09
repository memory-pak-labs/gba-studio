import { createHash } from 'node:crypto';
import { copyFile, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { applyMarketComposition } from './market-suspenso-composition.mjs';

const MARKET_ASSET_NAME = 'mercado-suspenso-modules-v5.png';
const SUPERSEDED_ASSET_NAMES = ['mercado-suspenso-tileset-v4-gba.png'];

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function promoteProject({ approvedSourceSha256, atlas, projectPath }) {
  const project = JSON.parse(await readFile(projectPath, 'utf8'));
  if (!project.assets?.some((asset) => asset?.name === MARKET_ASSET_NAME)) {
    throw new Error(
      `Composição modular aposentada: ${MARKET_ASSET_NAME} não está declarada no manifesto atual (${projectPath}).`
    );
  }
  const promoted = applyMarketComposition(project, {
    preparedSha256: sha256(atlas.bytes),
    reviewStatus: 'approved',
    sourceSha256: approvedSourceSha256,
    supersededAssetNames: SUPERSEDED_ASSET_NAMES
  });
  const assetPath = join(dirname(projectPath), 'Assets', 'backgrounds', MARKET_ASSET_NAME);
  await copyFile(atlas.sourcePath, assetPath);
  await writeFile(projectPath, `${JSON.stringify(promoted, null, 2)}\n`);
  return assetPath;
}

export async function promoteApprovedMarketModularComposition({
  approvedSourcePath,
  atlasSourcePath,
  fixtureProjectPath,
  templateProjectPath
}) {
  const [approvedSource, atlas] = await Promise.all([
    readFile(approvedSourcePath),
    readFile(atlasSourcePath)
  ]);
  const atlasWithSource = { bytes: atlas, sourcePath: atlasSourcePath };
  const approvedSourceSha256 = sha256(approvedSource);
  const projectPaths = [fixtureProjectPath, templateProjectPath];
  const projects = await Promise.all(projectPaths.map(async (projectPath) => ({
    project: JSON.parse(await readFile(projectPath, 'utf8')),
    projectPath
  })));
  const missingDeclaration = projects.find(({ project }) =>
    !project.assets?.some((asset) => asset?.name === MARKET_ASSET_NAME)
  );
  if (missingDeclaration) {
    throw new Error(
      `Composição modular aposentada: ${MARKET_ASSET_NAME} não está declarada no manifesto atual (${missingDeclaration.projectPath}).`
    );
  }
  const [fixtureAssetPath, templateAssetPath] = await Promise.all([
    promoteProject({ approvedSourceSha256, atlas: atlasWithSource, projectPath: fixtureProjectPath }),
    promoteProject({ approvedSourceSha256, atlas: atlasWithSource, projectPath: templateProjectPath })
  ]);
  return {
    approvedSourceSha256,
    fixtureAssetPath,
    preparedSha256: sha256(atlas),
    templateAssetPath
  };
}
