import { describe, expect, it } from 'vitest';
import { buildEngineExportProjectContract } from './exportEngineProject.js';

describe('procedures in bound event scripts', () => {
  it('expands a menu action procedure before compiling its native commands', () => {
    const contract = buildEngineExportProjectContract({
      name: 'Bound procedures', assets: [], assetGroups: [], actors: [], audioItems: [], dialogues: [], animations: [], animationStates: [], spriteReferenceImages: [],
      scenas: [{ name: 'start', sceneType: 'menu', width: 30, height: 20,
        runtime: { type: 'menu', config: { role: 'mission_board', screenType: 'menu', title: 'Objectives', items: [{ id: 'objective', label: 'Objective', action: 'select', targetScreenID: '', enabled: true, eventName: 'show_objective' }] } } },
        { name: 'world', sceneType: 'topdown', width: 30, height: 20 }],
      variables: [{ name: 'score', initialValue: 0 }],
      events: [
        { id: 'caller', name: 'show_objective', category: 'Cena', detail: 'Menu action', command: 'noop', steps: [{ command: 'call_procedure award' }] },
        { id: 'procedure', name: 'award', category: 'Cena', detail: 'Reusable award', command: 'noop', eventKind: 'procedure', procedure: { parameters: [], locals: [] }, steps: [{ command: 'set_variable score 7' }] }
      ], settings: {
        general: { gameTitle: 'Export', startScene: 'start', startSceneType: 'menu', exportFolder: 'build' },
        build: { romFileName: 'export.gba', exportFormat: 'gba_rom', engineBackend: 'gbastudio_engine', enginePackPath: '/opt/GBAStudioEnginePack' },
        preview: { defaultMode: 'quick_preview', scale: 3, runAfterBuild: false },
        audio: { audioEngine: 'gbastudio_engine_audio', audioMode: 'chiptune_pcm', masterVolume: 100 },
        save: { saveType: 'sram', slots: 3, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false }
      }
    });
    expect(contract.menu_project?.screens[0]?.items[0]?.on_select).toContainEqual({ op: 'set_variable', variable: 0, value: 7 });
  });
});
