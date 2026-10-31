import { readFileSync } from 'node:fs';

export const startupFadeManifest = JSON.parse(readFileSync(new URL('../fixtures/asset-provenance/startup-fade-a-manifest.json', import.meta.url), 'utf8'));

/** Apply only the approved startup timeline; leave campaign content untouched. */
export function promoteApprovedStartupFade(source) {
  if (!startupFadeManifest.approved || startupFadeManifest.assets.some(asset => !asset.approved))
    throw new Error('Startup fade requires visual approval.');
  const project = structuredClone(source);
  const assets = startupFadeManifest.assets.map(asset => ({
    id: asset.id, kind: 'Background', name: asset.file,
    metadata: {
      source: asset.source, width: 240, height: 160, colorMode: '4bpp',
      role: 'startup-logo-bg', sceneRoles: ['startup-logo-bg', 'logo-bg'],
      generatedBy: 'approved-startup-fade-a', reviewStatus: 'approved', visualStatus: 'approved',
      license: startupFadeManifest.origin.license,
      provenance: 'Fade clássico A aprovado; pixels nativos preservados da prévia de canvas.',
      sourceSha256: startupFadeManifest.origin.sourceSha256, preparedSha256: asset.sha256,
      backgroundPaletteBankBudget: 1, backgroundPaletteReferencePlan: asset.palettePlan,
      palettePreparationVisuallyApproved: true,
      backgroundTileOptimizer: { enabled: true, tileBudget: 600, maxSourcePixelErrorRatio: 0, maxFramebufferMismatchRatio: 0 }
    }
  }));
  const ids = new Set(assets.map(asset => asset.id));
  const firstStartup = project.assets.findIndex(asset => ids.has(asset.id) || asset.metadata?.role === 'startup-logo-bg');
  const insertion = project.assets.slice(0, Math.max(0, firstStartup)).filter(asset => !ids.has(asset.id)).length;
  const retained = project.assets.filter(asset => !ids.has(asset.id));
  retained.splice(insertion, 0, ...assets);
  project.assets = retained;
  const nextIndex = project.scenas.filter(scene => scene.runtime?.type === 'cutscene').findIndex(scene => scene.name === 'abertura');
  if (nextIndex < 0) throw new Error('Startup fade requires the opening cutscene.');
  const update = scene => {
    if (scene?.name !== 'logo') return scene;
    return {
      ...scene, backgroundAssetName: startupFadeManifest.posterAsset,
      backgroundRenderMode: 'tilemap',
      runtime: { ...scene.runtime, type: 'cutscene', config: {
        ...scene.runtime?.config, stepDurationFrames: startupFadeManifest.frameCount,
        autoAdvance: true, nextSceneIndex: -1, backgroundIndex: -1,
        steps: startupFadeManifest.timeline.map((step, index) => ({
          id: step.id, durationFrames: step.durationFrames, backgroundAssetName: step.file,
          autoAdvance: true, skippable: true, onSkipEventName: 'logo_concluir',
          targetSceneIndex: index === startupFadeManifest.timeline.length - 1 ? nextIndex : -1
        }))
      }}
    };
  };
  for (const collection of ['rooms', 'scenas']) project[collection] = project[collection].map(update);
  if (project.scena?.name === 'logo') project.scena = update(project.scena);
  const completion = {
    id: 'event-logo-fade-complete', name: 'logo_concluir', roomName: 'logo', category: 'Cena',
    detail: 'Pula a vinheta aprovada e continua na abertura.', command: 'noop',
    steps: [{ id: 'event-logo-fade-complete-step-1', command: 'change_scene abertura 0 0 down', isEnabled: true }]
  };
  const existing = project.events.findIndex(event => event.name === completion.name);
  if (existing >= 0) project.events[existing] = completion; else project.events.push(completion);
  return project;
}
