import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { analyzeExampleAssetUsage, pruneUnusedExampleAssets } from './lib/example-asset-usage.mjs';
import { promoteExemploGBAVerticeCampaign } from './vertice-showcase-project.mjs';
import { deriveFilesWorkspacePresentation } from '../src/shared/filesWorkspace.js';
import { expandProjectTilemaps } from '../src/shared/projectResourceFormat.js';

const asset = name => ({ id: `asset-${name}`, name, metadata: { source: `Assets/sprites/${name}` } });
const fixture = () => ({
  assets: ['map.png', 'actor.png', 'parts.png', 'heart.png', 'empty.png', 'cue.wav', 'old.png', 'event.png'].map(asset),
  rooms: [{ name: 'port', backgroundAssetName: 'map.png', referenceImages: [{ id: 'previous', title: 'Arte anterior preservada', assetName: 'old.png', visible: false }] }],
  actors: [{ roomName: 'port', spriteSheet: 'actor.png', animationStateID: 'live-state' }],
  animationStates: [{ id: 'live-state', spriteSheet: 'actor.png', animationIDs: ['live'] }, { id: 'old-state', spriteSheet: 'old.png', animationIDs: ['orphan'] }],
  animations: [{ id: 'live', spriteSheet: 'actor.png', frames: [{ tiles: [{ sourceSheet: 'parts.png' }] }] }, { id: 'orphan', spriteSheet: 'old.png' }],
  settings: { hudPresets: [{ components: [{ asset: 'heart.png', gauge: { emptyAsset: 'empty.png' } }] }] },
  audioItems: [{ name: 'cue', sourceAssetID: 'asset-cue.wav' }],
  events: [{ steps: [{ command: 'set_sprite "event.png"' }, { command: 'print prefix-old.png' }] }],
  assetGroups: [{ id: 'group', assetIDs: ['asset-old.png', 'asset-actor.png'] }]
});

describe('example library cleanup', () => {
  it('keeps explicit runtime sidecars, including cycles, without retaining provenance-only assets',()=>{
    const p=fixture();p.assets.find(a=>a.name==='map.png').metadata.runtimeDependencies=['cache.bin'];
    p.assets.push({...asset('cache.bin'),kind:'Data',metadata:{source:'Assets/cache.bin',runtimeDependencies:['map.png'],sourceReview:'old.png'}});
    const clean=pruneUnusedExampleAssets(p);
    expect(clean.assets.some(a=>a.name==='cache.bin')).toBe(true);
    expect(clean.assets.some(a=>a.name==='old.png')).toBe(false);
    expect(deriveFilesWorkspacePresentation(p).assets.find(a=>a.name==='cache.bin')?.isUsed).toBe(true);
  });
  it('retains scene, state, frame tile, HUD empty gauge, sample ID and command dependencies', () => {
    const usage = analyzeExampleAssetUsage(fixture());
    expect([...usage.usedNames].sort()).toEqual(['actor.png', 'cue.wav', 'empty.png', 'event.png', 'heart.png', 'map.png', 'parts.png']);
    expect(usage.unusedAssets.map(a => a.name)).toEqual(['old.png']);
  });

  it('removes orphan animations/states and archived references without touching live scene data', () => {
    const source = fixture(), before = structuredClone(source), clean = pruneUnusedExampleAssets(source);
    expect(source).toEqual(before);
    expect(clean.animations.map(a => a.id)).toEqual(['live']);
    expect(clean.animationStates.map(a => a.id)).toEqual(['live-state']);
    expect(clean.rooms[0]).toEqual({ ...source.rooms[0], referenceImages: [] });
    expect(clean.actors).toEqual(source.actors);
    expect(clean.assetGroups[0].assetIDs).toEqual(['asset-actor.png']);
    expect(pruneUnusedExampleAssets(clean)).toEqual(clean);
  });

  it('keeps intentional authoring references, including hidden references without a history label', () => {
    const source = fixture();
    source.rooms[0].referenceImages[0].title = 'Guia de composição';
    expect(analyzeExampleAssetUsage(source).usedNames.has('old.png')).toBe(true);
  });

  it('does not mistake names embedded in another filename or provenance metadata for use', () => {
    const source = fixture();
    source.assets[0].metadata.previousAsset = 'old.png';
    expect(analyzeExampleAssetUsage(source).usedNames.has('old.png')).toBe(false);
  });

  it('keeps indirect tactical and cutscene references without relying on redundant asset bindings', () => {
    const source = fixture();
    source.rooms[0].runtime = { config: { steps: [{ backgroundAssetName: 'old.png' }], tacticalPresentation: { compactHud: { font: 'event.png' } } } };
    expect(analyzeExampleAssetUsage(source).unusedAssets).toEqual([]);
  });

  it('refreshes a stale selected-scene snapshot from the actual scene instead of retaining its old background', () => {
    const source = fixture();
    source.scena = { name: 'port', backgroundAssetName: 'old.png' };
    const clean = pruneUnusedExampleAssets(source);
    expect(clean.scena).toEqual(clean.rooms[0]);
    expect(clean.assets.some(a => a.name === 'old.png')).toBe(false);
  });

  it('keeps the canonical example free of dormant library resources after reconstruction', () => {
    const source = JSON.parse(readFileSync(new URL('../default-assets/templates/exemplo-gba/exemplo-gba.gba-project', import.meta.url)));
    expect(analyzeExampleAssetUsage(source).unusedAssets.map(a => a.name)).toEqual([]);
    const rebuilt = promoteExemploGBAVerticeCampaign(source);
    expect(analyzeExampleAssetUsage(rebuilt).unusedAssets.map(a => a.name)).toEqual([]);
    expect(rebuilt.assets.map(a => a.name).sort()).toEqual(source.assets.map(a => a.name).sort());
    expect(deriveFilesWorkspacePresentation(expandProjectTilemaps(source)).assets.filter(a => !a.isUsed).map(a => a.name)).toEqual([]);
  });

  it('removes retired files while preserving the five sources shared with blank projects', () => {
    const root = new URL('../default-assets/templates/exemplo-gba/', import.meta.url);
    const source = JSON.parse(readFileSync(new URL('exemplo-gba.gba-project', root)));
    const record = JSON.parse(readFileSync(new URL('../fixtures/asset-provenance/example-library-cleanup.json', import.meta.url)));
    expect(record.approval.approved).toBe(true);
    const platformer = JSON.parse(readFileSync(new URL('../fixtures/asset-provenance/platformer-approved-manifest.json', import.meta.url)));
    const racing=JSON.parse(readFileSync(new URL('../fixtures/asset-provenance/racing-approved-manifest.json',import.meta.url)));
    const storm=JSON.parse(readFileSync(new URL('../fixtures/asset-provenance/tempestade-approved-manifest.json',import.meta.url)));
    const relay=JSON.parse(readFileSync(new URL('../fixtures/asset-provenance/relay-approved-manifest.json',import.meta.url)));
    const dungeon=JSON.parse(readFileSync(new URL('../fixtures/asset-provenance/dungeon-approved-manifest.json',import.meta.url)));
    const startup=JSON.parse(readFileSync(new URL('../fixtures/asset-provenance/startup-fade-a-manifest.json',import.meta.url)));
    const worldMap = JSON.parse(readFileSync(new URL('../fixtures/asset-provenance/world-map-lumen-manifest.json', import.meta.url)));
    const market = JSON.parse(readFileSync(new URL('../fixtures/asset-provenance/market-approved-manifest.json', import.meta.url)));
    const council = JSON.parse(readFileSync(new URL('../fixtures/asset-provenance/council-v13-approved-manifest.json', import.meta.url)));
    const replacedWorldMapSources = ['Assets/backgrounds/route-map-paged-v2.png', 'Assets/sprites/route-airship-v2.png'];
    const farolRelay = JSON.parse(readFileSync(new URL('../fixtures/asset-provenance/farol-relay-v2.json', import.meta.url)));
    expect(farolRelay.approval.approved).toBe(true);
    expect(source.assets.some(asset => asset.name === farolRelay.sheet)).toBe(true);
    const coast=JSON.parse(readFileSync(new URL("../fixtures/asset-provenance/coastal-depth-approved.json",import.meta.url)));
    const evolutions=JSON.parse(readFileSync(new URL("../fixtures/asset-provenance/campaign-evolutions-approved.json",import.meta.url)));
    const encore=JSON.parse(readFileSync(new URL("../fixtures/asset-provenance/encore-approved.json",import.meta.url)));
    const menuAudio = JSON.parse(readFileSync(new URL("../fixtures/asset-provenance/initial-menu-audio-approved.json", import.meta.url)));
    expect(menuAudio.approval.auditory).toBe(true);
    const tide=JSON.parse(readFileSync(new URL("../fixtures/asset-provenance/tide-annex-approved.json",import.meta.url)));
    const approvedMenus=JSON.parse(readFileSync(new URL("../fixtures/asset-provenance/approved-menu-scenes-v21.json",import.meta.url)));
    // The relay and the approved campaign extensions retain all existing sources.
    expect(source.assets).toHaveLength(record.after.assets - dungeon.replacedAssetNames.length + dungeon.assets.length - dungeon.unusedPreparedAssetNames.length - platformer.replacedAssetNames.length + platformer.assets.length - racing.replacedAssetNames.length + racing.assets.length - storm.replacedAssetNames.length + storm.assets.length - relay.replacedAssetNames.length + relay.assets.length - startup.retainedOriginals.length + startup.assets.length - replacedWorldMapSources.length + Object.keys(worldMap.assets).length - market.replacedAssetNames.length + market.assets.length - council.replacedAssetNames.length + council.assets.length + 1 + evolutions.assets.length + coast.assets.length - coast.retainedAliases.length + encore.assets.length + menuAudio.assets.length + tide.assets.length + approvedMenus.assets.length + 1 - 2);
    for (const original of market.retainedOriginals) {
      expect(source.assets.some(asset => asset.name === original.source.split('/').at(-1))).toBe(false);
      expect(existsSync(new URL(original.source, root))).toBe(true);
    }
    for (const previousSource of replacedWorldMapSources) {
      expect(source.assets.some(asset => asset.name === previousSource.split('/').at(-1))).toBe(false);
      expect(existsSync(new URL(previousSource, root))).toBe(true);
    }
    for (const original of startup.retainedOriginals) {
      expect(source.assets.some(asset => asset.name === original.source.split('/').at(-1))).toBe(false);
      expect(existsSync(new URL(original.source, root))).toBe(true);
    }
    for(const name of racing.replacedAssetNames) expect(source.assets.some(a=>a.name===name)).toBe(false);
    for (const name of platformer.replacedAssetNames) expect(source.assets.some(a => a.name === name)).toBe(false);
    expect(record.retiredAssets).toHaveLength(record.before.assets - record.after.assets);
    expect(record.sharedDefaults).toHaveLength(5);
    for (const asset of record.retiredAssets) {
      expect(source.assets.some(a => a.name === asset.name), asset.name).toBe(false);
      expect(existsSync(new URL(asset.source, root)), asset.source).toBe(record.sharedDefaults.includes(asset.source));
    }
  });
});
