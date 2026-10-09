import { describe, expect, it } from "vitest";
import {
  applyAudioPatternPresetInProject,
  clearAudioPatternSequenceInProject,
  createAudioChannelInProject,
  createAudioPatternInProject,
  createAudioItemInProject,
  deriveAudioComposerContext,
  deriveAudioComposerTabSummary,
  deriveAudioChannelMixing,
  deriveAudioExportSummary,
  deriveAudioGbaBudget,
  deriveAudioNarrativePlacement,
  deriveAudioPreviewPlaybackPlan,
  deriveAudioPianoPitchRows,
  deriveAudioStepToolbarState,
  deriveAudioWorkspaceFilterChips,
  deriveAudioPreviewRows,
  deriveAudioWorkspaceModeSummary,
  deriveAudioWorkspacePresentation,
  duplicateAudioItemInProject,
  duplicateAudioPatternInProject,
  moveAudioChannelNoteInProject,
  moveAudioPatternOrderSlotInProject,
  filterAudioWorkspaceItems,
  nextAudioChannelTypePreset,
  normalizeAudioInProject,
  prepareAudioExport,
  removeAudioChannelFromProject,
  removeAudioItemFromProject,
  removeAudioPatternFromProject,
  renameAudioPatternInProject,
  renameAudioItemInProject,
  setActiveAudioPatternInProject,
  suggestAudioItemName,
  transposeAudioChannelInProject,
  transposeAudioChannelNoteInProject,
  updateAudioChannelFieldsInProject,
  updateAudioChannelNoteInProject,
  updateAudioPatternOrderSlotInProject,
  updateAudioItemFieldsInProject
} from "./audioWorkspace.js";
import { createBlankProjectData } from "./newProject.js";

type AudioNotesProject = {
  audioItems?: Array<{
    channels?: Array<{ notes?: string[] }>;
    patterns?: Array<{ channels?: Array<{ notes?: string[] }> }>;
  }>;
};

function firstPatternChannelNotes(project: unknown): string[] | undefined {
  return (project as AudioNotesProject).audioItems?.[0]?.patterns?.[0]?.channels?.[0]?.notes;
}

function patternChannelNotes(project: unknown, channelIndex: number): string[] | undefined {
  return (project as AudioNotesProject).audioItems?.[0]?.patterns?.[0]?.channels?.[channelIndex]?.notes;
}

function firstAudioItem(project: unknown): Record<string, unknown> | undefined {
  const items = (project as { audioItems?: Array<Record<string, unknown>> }).audioItems;
  return items?.[0];
}

describe("Audio workspace presentation", () => {
  it("offers clickable piano pitches and preserves simultaneous notes in different GBA channels", () => {
    expect(deriveAudioPianoPitchRows("pulse1", ["C4", "E4"])).toEqual([
      "C5", "B4", "A#4", "A4", "G#4", "G4", "F#4", "F4", "E4", "D#4", "D4", "C#4", "C4"
    ]);
    expect(deriveAudioPianoPitchRows("wave", ["C3"])).toContain("C3");
    expect(deriveAudioPianoPitchRows("noise", ["K"])).toEqual(["H", "S", "K"]);

    const project = {
      audioItems: [{
        id: "audio-chord",
        patterns: [{
          id: "pattern-a",
          channels: [
            { id: "pulse-1", notes: ["---"] },
            { id: "pulse-2", notes: ["---"] }
          ]
        }]
      }]
    };
    const withFirstVoice = updateAudioChannelNoteInProject(project, "audio-chord", {
      channelID: "pulse-1",
      stepIndex: 0,
      note: "C4"
    });
    const withChord = updateAudioChannelNoteInProject(withFirstVoice, "audio-chord", {
      channelID: "pulse-2",
      stepIndex: 0,
      note: "E4"
    });

    expect(patternChannelNotes(withChord, 0)?.[0]).toBe("C4");
    expect(patternChannelNotes(withChord, 1)?.[0]).toBe("E4");
  });

  it("derives a live GBA channel and memory budget for the selected audio", () => {
    const project = createAudioItemInProject(createBlankProjectData({ name: "Orcamento de audio" }), {
      id: "audio-theme",
      name: "tema.mod",
      kind: "Musica"
    });
    const item = deriveAudioWorkspacePresentation(project).items[0];

    expect(deriveAudioGbaBudget(item)).toEqual({
      channelCount: 4,
      channelLimit: 4,
      channelPercent: 100,
      estimatedBytes: 464,
      memoryLabel: "464 B",
      status: "limit"
    });
  });

  it("describes where an audio item participates in the game narrative", () => {
    const presentation = deriveAudioWorkspacePresentation({
      scenas: [{ name: "Floresta", music: "tema.mod" }],
      events: [{ name: "Entrada da floresta", command: "play_music tema.mod" }],
      audioItems: [{ id: "audio-theme", name: "tema.mod", kind: "Musica", assignedScene: "Floresta" }]
    });

    expect(deriveAudioNarrativePlacement(presentation.items[0])).toEqual({
      summary: "Relacionado à cena Floresta",
      locations: ["Cena Floresta", "Evento Entrada da floresta"]
    });
  });

  it("contabiliza a trilha e os cues da apresentação tática", () => {
    const presentation = deriveAudioWorkspacePresentation({
      scenas: [{
        name: "Arena tática",
        runtime: {
          config: {
            tacticalPresentation: {
              audio: {
                music: "arena.mod",
                cues: {
                  cursor: "cursor.wav",
                  attack: "attack.wav"
                }
              }
            }
          }
        }
      }],
      audioItems: [
        { id: "audio-arena", name: "arena.mod", kind: "Musica" },
        { id: "audio-cursor", name: "cursor.wav", kind: "SFX" },
        { id: "audio-attack", name: "attack.wav", kind: "SFX" }
      ]
    });

    expect(presentation.items.map((item) => ({ name: item.name, usageLabels: item.usageLabels }))).toEqual([
      { name: "arena.mod", usageLabels: ["Cena: Arena tática (trilha tática)"] },
      { name: "attack.wav", usageLabels: ["Cena: Arena tática (cue attack)"] },
      { name: "cursor.wav", usageLabels: ["Cena: Arena tática (cue cursor)"] }
    ]);
    expect(presentation.items.every((item) => item.warnings.every((warning) => !warning.includes("sem uso")))).toBe(true);
  });

  it("derives an empty presentation for blank projects without audio items", () => {
    const blank = createBlankProjectData({ name: "Novo projeto" });
    const presentation = deriveAudioWorkspacePresentation(blank);

    expect(presentation.items).toEqual([]);
    expect(presentation.summary.audioCount).toBe(0);
    expect(presentation.exportDiagnostics).toEqual([]);
    expect(deriveAudioWorkspaceFilterChips(presentation).kind).toEqual([
      expect.objectContaining({ id: "kind-all", count: 0, isActive: true })
    ]);
    expect(suggestAudioItemName(blank, "Musica")).toBe("nova_musica.mod");
    expect(suggestAudioItemName(blank, "SFX")).toBe("novo_sfx.wav");
  });

  it("suggests unique audio names when defaults already exist", () => {
    const data = createAudioItemInProject(createBlankProjectData({ name: "Novo projeto" }), {
      id: "audio-1",
      name: "nova_musica.mod",
      kind: "Musica"
    });

    expect(suggestAudioItemName(data, "Musica")).toBe("nova_musica_2.mod");
  });

  it("cycles channel type presets through the GBA audio lanes", () => {
    expect(nextAudioChannelTypePreset("pulse1")).toBe("pulse2");
    expect(nextAudioChannelTypePreset("pulse2")).toBe("wave");
    expect(nextAudioChannelTypePreset("wave")).toBe("noise");
    expect(nextAudioChannelTypePreset("noise")).toBe("pulse1");
    expect(nextAudioChannelTypePreset("square2")).toBe("wave");
    expect(nextAudioChannelTypePreset("sfx")).toBe("pulse1");
    expect(nextAudioChannelTypePreset("custom")).toBe("pulse1");
  });

  it("derives tracker-style preview rows from channel notes", () => {
    expect(deriveAudioPreviewRows([
      { id: "pulse", name: "Pulse 1", type: "pulse1", notes: ["C4", "---", "", "E4"], muted: true },
      { id: "noise", name: "Noise", type: "noise", notes: ["K", "S"], solo: true }
    ], 2, 4)).toEqual([
      {
        id: "pulse",
        label: "Pulse 1",
        type: "pulse1",
        instrument: "Pulse Lead",
        envelope: "Soft ADSR",
        volume: 80,
        isMuted: true,
        isSolo: false,
        activeNoteCount: 2,
        cells: [
          { index: 0, note: "C4", isActive: true, octave: 4, pianoLane: 59, pitchClass: "C", isPercussion: false },
          { index: 1, note: null, isActive: false, octave: null, pianoLane: null, pitchClass: null, isPercussion: false },
          { index: 2, note: null, isActive: false, octave: null, pianoLane: null, pitchClass: null, isPercussion: false },
          { index: 3, note: "E4", isActive: true, octave: 4, pianoLane: 55, pitchClass: "E", isPercussion: false }
        ]
      },
      {
        id: "noise",
        label: "Noise",
        type: "noise",
        instrument: "Noise Kit",
        envelope: "Short Decay",
        volume: 80,
        isMuted: false,
        isSolo: true,
        activeNoteCount: 2,
        cells: [
          { index: 0, note: "K", isActive: true, octave: null, pianoLane: null, pitchClass: null, isPercussion: true },
          { index: 1, note: "S", isActive: true, octave: null, pianoLane: null, pitchClass: null, isPercussion: true },
          { index: 2, note: null, isActive: false, octave: null, pianoLane: null, pitchClass: null, isPercussion: false },
          { index: 3, note: null, isActive: false, octave: null, pianoLane: null, pitchClass: null, isPercussion: false }
        ]
      }
    ]);
  });

  it("derives audio library summaries, usage, origins and composer metrics", () => {
    const presentation = deriveAudioWorkspacePresentation({
      assets: [
        {
          id: "asset-theme",
          name: "theme.mod",
          kind: "Audio",
          metadata: { source: "Assets/music/theme.mod" }
        }
      ],
      scenas: [
        { name: "start", music: "theme.mod" },
        { name: "shop", music: "silent" }
      ],
      events: [
        { name: "boot", command: "play_music theme.mod" },
        {
          name: "confirm",
          steps: [
            { command: "play_sfx confirm.wav" },
            { command: "stop_music" }
          ]
        }
      ],
      audioItems: [
        {
          id: "audio-theme",
          name: "theme.mod",
          kind: "Musica",
          format: "MOD",
          assignedScene: "start",
          loops: true,
          bpm: 132,
          exportID: "theme",
          volume: 80,
          patterns: [
            {
              id: "pattern-a",
              name: "intro",
              steps: 16,
              channels: [
                { id: "ch-1", name: "Pulse 1", type: "pulse1", notes: ["C4", "---", "E4"], muted: false, solo: false },
                { id: "ch-2", name: "Wave", type: "wave", notes: ["---", "G3"], muted: true, solo: false }
              ]
            },
            {
              id: "pattern-b",
              name: "loop",
              steps: 16,
              channels: [{ id: "ch-3", name: "Noise", type: "noise", notes: ["K", "---", "S"], muted: false, solo: true }]
            }
          ],
          patternOrder: ["pattern-a", "pattern-b", "pattern-b"]
        },
        {
          id: "audio-confirm",
          name: "confirm.wav",
          kind: "SFX",
          format: "WAV",
          assignedScene: "Global",
          loops: false,
          bpm: 150,
          exportID: "confirm",
          volume: 90,
          channels: [{ id: "sfx-ch", name: "Noise", type: "noise", notes: ["K", "---", "S"], muted: false, solo: false }]
        },
        {
          id: "audio-unused",
          name: "unused.mod",
          kind: "Musica",
          format: "WAV",
          assignedScene: "",
          loops: true,
          bpm: 999,
          exportID: "unused",
          volume: 120
        }
      ]
    });

    expect(presentation.summary).toEqual({
      audioCount: 3,
      musicCount: 2,
      sfxCount: 1,
      loopingCount: 2,
      importedCount: 0,
      composedCount: 3,
      unknownOriginCount: 0,
      unusedCount: 1,
      attentionCount: 1,
      totalPatterns: 3,
      totalChannels: 3,
      totalNotes: 5
    });
    expect(presentation.summaryCards).toEqual([
      { id: "total", label: "Total", value: "3" },
      { id: "music", label: "Músicas", value: "2" },
      { id: "sfx", label: "SFX", value: "1" },
      { id: "imported", label: "Import.", value: "0" },
      { id: "composed", label: "Composto", value: "3" },
      { id: "attention", label: "Atenção", value: "1" }
    ]);
    expect(presentation.kindCounts).toEqual([
      { kind: "Musica", count: 2 },
      { kind: "SFX", count: 1 }
    ]);
    expect(presentation.formatCounts).toEqual([
      { format: "MOD", count: 1 },
      { format: "WAV", count: 2 }
    ]);
    expect(presentation.items[0]).toMatchObject({
      id: "audio-confirm",
      name: "confirm.wav",
      kind: "SFX",
      format: "WAV",
      assignedScene: "Global",
      loops: false,
      bpm: 150,
      exportID: "confirm",
      origin: "Composto",
      runtimeCommand: "play_sfx confirm.wav",
      usageCount: 1,
      usageLabels: ["Evento: confirm"],
      patternCount: 1,
      channelCount: 1,
      noteCount: 2,
      mutedChannelCount: 0,
      soloChannelCount: 0,
      status: "OK",
      warnings: []
    });
    expect(presentation.items[1]).toMatchObject({
      id: "audio-theme",
      name: "theme.mod",
      origin: "Composto",
      source: "Assets/music/theme.mod",
      runtimeCommand: "play_music theme.mod",
      usageCount: 2,
      usageLabels: ["Cena: start", "Evento: boot"],
      patternCount: 2,
      patternOrderCount: 3,
      channelCount: 2,
      noteCount: 3,
      mutedChannelCount: 1,
      soloChannelCount: 0,
      activePatternID: "pattern-a",
      activePatternName: "intro",
      stepCount: 16,
      status: "OK",
      warnings: []
    });
    expect(presentation.items[1].patterns).toEqual([
      { id: "pattern-a", name: "intro" },
      { id: "pattern-b", name: "loop" }
    ]);
    expect(presentation.items[1].patternSequence).toEqual([
      { index: 0, patternID: "pattern-a", label: "intro", isMissing: false },
      { index: 1, patternID: "pattern-b", label: "loop", isMissing: false },
      { index: 2, patternID: "pattern-b", label: "loop", isMissing: false }
    ]);
    expect(presentation.items[2]).toMatchObject({
      name: "unused.mod",
      kind: "Musica",
      format: "WAV",
      origin: "Composto",
      usageCount: 0,
      status: "Bloqueado",
      warnings: ["Áudio sem uso em cenas ou eventos.", "Formato incomum para Musica: WAV.", "BPM fora da faixa 40-240."]
    });
  });

  it("ignores legacy single room fields when deriving audio usage", () => {
    const presentation = deriveAudioWorkspacePresentation({
      scena: { name: "legacy_room", music: "theme.mod" },
      room: { name: "legacy_room_alias", music: "theme.mod" },
      audioItems: [{ id: "audio-theme", name: "theme.mod", kind: "Musica", format: "MOD" }]
    });

    expect(presentation.summary.unusedCount).toBe(1);
    expect(presentation.items[0]).toMatchObject({
      name: "theme.mod",
      usageCount: 0,
      usageLabels: []
    });
  });

  it("derives basic and complete audio workspace mode summaries", () => {
    const item = deriveAudioWorkspacePresentation({
      audioItems: [
        {
          id: "audio-theme",
          name: "theme.mod",
          kind: "Musica",
          format: "MOD",
          loops: true,
          bpm: 132,
          patterns: [
            {
              id: "pattern-a",
              name: "intro",
              channels: [{ id: "pulse", name: "Pulse", type: "pulse1", notes: ["C4", "E4"] }]
            }
          ],
          patternOrder: ["pattern-a", "pattern-a"]
        }
      ]
    }).items[0];

    expect(deriveAudioWorkspaceModeSummary("basic", item)).toEqual({
      mode: "basic",
      title: "Modo basico",
      tabs: [],
      centerLabel: "Use o transporte para ouvir theme.mod ou abra o modo completo para editar.",
      inspectorPanels: ["Dados do audio", "Canais e mixagem", "Uso no jogo"]
    });
    expect(deriveAudioWorkspaceModeSummary("complete", item)).toEqual({
      mode: "complete",
      title: "Modo completo",
      tabs: ["Piano Roll", "Tracker", "Sequência atual"],
      centerLabel: "Piano roll",
      inspectorPanels: ["Dados do audio", "Canais e mixagem", "Uso no jogo", "Biblioteca"]
    });
  });

  it("derives complete composer tab summaries for piano, tracker and sequence", () => {
    const item = deriveAudioWorkspacePresentation({
      audioItems: [
        {
          id: "audio-theme",
          name: "theme.mod",
          kind: "Musica",
          format: "MOD",
          loops: true,
          bpm: 120,
          patterns: [
            {
              id: "p1",
              name: "p1",
              channels: [
                { id: "pulse-1", name: "Pulse 1", type: "pulse1", notes: ["C4", "---", "E4", "---"] },
                { id: "noise", name: "Noise", type: "noise", notes: ["K", "---", "H", "---"] }
              ]
            }
          ],
          patternOrder: ["p1"]
        }
      ]
    }).items[0];

    expect(deriveAudioComposerTabSummary("piano", item)).toEqual({
      tab: "piano",
      title: "Piano Roll",
      description: "Componha canais por notas em uma grade visual.",
      centerLabel: "Piano roll",
      metrics: ["4 notas", "2 canal(is)", "Loop OK"]
    });
    expect(deriveAudioComposerTabSummary("tracker", item)).toEqual({
      tab: "tracker",
      title: "Tracker por passos",
      description: "Edite cada passo como uma tabela musical, sem sair do compositor visual.",
      centerLabel: "p1",
      metrics: ["64 passos", "2 canal(is)", "4 notas"]
    });
    expect(deriveAudioComposerTabSummary("sequence", item)).toEqual({
      tab: "sequence",
      title: "Sequência e padrões",
      description: "Monte a música repetindo, movendo e combinando patterns.",
      centerLabel: "p1",
      metrics: ["1 padrão(ões)", "1 ordem(ns)", "2 canal(is)"]
    });
  });

  it("derives tracker step toolbar state from the selected note", () => {
    const item = deriveAudioWorkspacePresentation({
      audioItems: [
        {
          id: "audio-theme",
          name: "theme.mod",
          kind: "Musica",
          format: "MOD",
          loops: true,
          bpm: 120,
          patterns: [
            {
              id: "p1",
              name: "p1",
              channels: [
                { id: "pulse-1", name: "Pulse 1", type: "pulse1", notes: ["C4", "---"] },
                { id: "noise", name: "Noise", type: "noise", notes: ["K", "---"] }
              ]
            }
          ],
          patternOrder: ["p1"]
        }
      ]
    }).items[0];

    expect(deriveAudioStepToolbarState(item, null)).toEqual({
      hasSelection: false,
      selectedChannelLabel: null,
      selectedNote: null,
      canClearStep: false,
      canMoveLeft: false,
      canMoveRight: false
    });
    expect(deriveAudioStepToolbarState(item, { audioID: "other", channelID: "pulse-1", stepIndex: 0 })).toEqual({
      hasSelection: false,
      selectedChannelLabel: null,
      selectedNote: null,
      canClearStep: false,
      canMoveLeft: false,
      canMoveRight: false
    });
    expect(deriveAudioStepToolbarState(item, { audioID: "audio-theme", channelID: "pulse-1", stepIndex: 0 })).toEqual({
      hasSelection: true,
      selectedChannelLabel: "Pulse 1",
      selectedNote: "C4",
      canClearStep: true,
      canMoveLeft: false,
      canMoveRight: true
    });
    expect(deriveAudioStepToolbarState(item, { audioID: "audio-theme", channelID: "pulse-1", stepIndex: 1 })).toEqual({
      hasSelection: true,
      selectedChannelLabel: "Pulse 1",
      selectedNote: null,
      canClearStep: false,
      canMoveLeft: false,
      canMoveRight: false
    });
  });

  it("moves an audio channel note atomically when the adjacent step is empty", () => {
    const project = {
      audioItems: [
        {
          id: "audio-theme",
          name: "theme.mod",
          kind: "Musica",
          patterns: [
            {
              id: "p1",
              name: "p1",
              channels: [
                { id: "pulse-1", name: "Pulse 1", type: "pulse1", notes: ["C4", "---", "E4"] }
              ]
            }
          ]
        }
      ]
    };

    const movedRight = moveAudioChannelNoteInProject(project, "audio-theme", {
      channelID: "pulse-1",
      stepIndex: 0,
      direction: 1
    });

    expect(movedRight).not.toBe(project);
    expect(firstPatternChannelNotes(movedRight)).toEqual(["---", "C4", "E4"]);
    expect(project.audioItems[0].patterns[0].channels[0].notes).toEqual(["C4", "---", "E4"]);

    const movedLeft = moveAudioChannelNoteInProject(movedRight, "audio-theme", {
      channelID: "pulse-1",
      stepIndex: 1,
      direction: -1
    });

    expect(firstPatternChannelNotes(movedLeft)).toEqual(["C4", "---", "E4"]);
  });

  it("does not move an audio channel note when the source is empty, blocked or out of bounds", () => {
    const project = {
      audioItems: [
        {
          id: "audio-theme",
          name: "theme.mod",
          kind: "Musica",
          channels: [
            { id: "pulse-1", name: "Pulse 1", type: "pulse1", notes: ["C4", "E4", "---"] }
          ]
        }
      ]
    };

    expect(moveAudioChannelNoteInProject(project, "audio-theme", {
      channelID: "pulse-1",
      stepIndex: 0,
      direction: -1
    })).toBe(project);
    expect(moveAudioChannelNoteInProject(project, "audio-theme", {
      channelID: "pulse-1",
      stepIndex: 0,
      direction: 1
    })).toBe(project);
    expect(moveAudioChannelNoteInProject(project, "audio-theme", {
      channelID: "pulse-1",
      stepIndex: 2,
      direction: -1
    })).toBe(project);
  });

  it("applies a pattern preset without overwriting existing notes", () => {
    const project = {
      audioItems: [
        {
          id: "audio-theme",
          name: "theme.mod",
          kind: "Musica",
          patternOrder: ["p1"],
          patterns: [
            {
              id: "p1",
              name: "p1",
              steps: 8,
              channels: [
                { id: "pulse-1", name: "Pulse 1", type: "pulse1", notes: ["C4", "---", "", "---"] },
                { id: "noise", name: "Noise", type: "noise", notes: [] }
              ]
            }
          ]
        }
      ]
    };

    const next = applyAudioPatternPresetInProject(project, "audio-theme");

    expect(next).not.toBe(project);
    expect(patternChannelNotes(next, 0)).toEqual(["C4", "---", "E4", "---", "G4", "---", "E4", "---"]);
    expect(patternChannelNotes(next, 1)).toEqual(["K", "---", "S", "---", "K", "---", "S", "---"]);
    expect(project.audioItems[0].patterns[0].channels[0].notes).toEqual(["C4", "---", "", "---"]);
  });

  it("does not apply a pattern preset when there are no editable channels", () => {
    const project = {
      audioItems: [
        {
          id: "audio-theme",
          name: "theme.mod",
          kind: "Musica",
          patterns: [{ id: "p1", name: "p1", channels: [] }]
        }
      ]
    };

    expect(applyAudioPatternPresetInProject(project, "audio-theme")).toBe(project);
  });

  it("filters audio items by query, kind and status without mutating the presentation", () => {
    const presentation = deriveAudioWorkspacePresentation({
      scenas: [{ name: "start", music: "theme.mod" }],
      events: [{ name: "confirm", steps: [{ command: "play_sfx confirm.wav" }] }],
      audioItems: [
        {
          id: "audio-theme",
          name: "theme.mod",
          kind: "Musica",
          format: "MOD",
          loops: true,
          bpm: 120,
          patterns: [{ id: "pattern-intro", name: "intro", channels: [{ id: "pulse", name: "Pulse", type: "pulse1", notes: ["C4"] }] }]
        },
        {
          id: "audio-confirm",
          name: "confirm.wav",
          kind: "SFX",
          format: "WAV",
          assignedScene: "Global",
          loops: false,
          bpm: 140,
          channels: [{ id: "noise", name: "Noise", type: "noise", notes: ["K"] }]
        },
        {
          id: "audio-unused",
          name: "unused.wav",
          kind: "Musica",
          format: "WAV",
          loops: true,
          bpm: 999
        }
      ]
    });

    expect(filterAudioWorkspaceItems(presentation.items, { query: "pulse" }).map((item) => item.name)).toEqual(["theme.mod"]);
    expect(filterAudioWorkspaceItems(presentation.items, { query: "evento: confirm" }).map((item) => item.name)).toEqual(["confirm.wav"]);
    expect(filterAudioWorkspaceItems(presentation.items, { status: "attention" }).map((item) => item.name)).toEqual(["unused.wav"]);
    expect(filterAudioWorkspaceItems(presentation.items, { kind: "SFX" }).map((item) => item.name)).toEqual(["confirm.wav"]);
    expect(filterAudioWorkspaceItems(presentation.items, { query: "unused", kind: "Musica", status: "unused" }).map((item) => item.name)).toEqual(["unused.wav"]);
    expect(presentation.items).toHaveLength(3);
  });

  it("derives library filter chips with counts and active state", () => {
    const presentation = deriveAudioWorkspacePresentation({
      scenas: [{ name: "start", music: "theme.mod" }],
      events: [{ name: "confirm", steps: [{ command: "play_sfx confirm.wav" }] }],
      audioItems: [
        { id: "audio-theme", name: "theme.mod", kind: "Musica", format: "MOD", loops: true, bpm: 120 },
        { id: "audio-confirm", name: "confirm.wav", kind: "SFX", format: "WAV", loops: false, bpm: 140 },
        { id: "audio-unused", name: "unused.wav", kind: "Musica", format: "WAV", loops: false, bpm: 999 }
      ]
    });

    expect(deriveAudioWorkspaceFilterChips(presentation, { kind: "SFX", status: "attention" })).toEqual({
      kind: [
        { id: "kind-all", label: "Todos", count: 3, value: "", isActive: false },
        { id: "kind-Musica", label: "Música", count: 2, value: "Musica", isActive: false },
        { id: "kind-SFX", label: "SFX", count: 1, value: "SFX", isActive: true }
      ],
      format: [
        { id: "format-all", label: "Todos", count: 3, value: "", isActive: true },
        { id: "format-MOD", label: "MOD", count: 1, value: "MOD", isActive: false },
        { id: "format-WAV", label: "WAV", count: 2, value: "WAV", isActive: false }
      ],
      origin: [
        { id: "origin-all", label: "Todas", count: 3, value: "", isActive: true },
        { id: "origin-imported", label: "Importado", count: 0, value: "Importado", isActive: false },
        { id: "origin-composed", label: "Composto", count: 3, value: "Composto", isActive: false },
        { id: "origin-unknown", label: "Sem fonte", count: 0, value: "Sem fonte", isActive: false }
      ],
      status: [
        { id: "status-all", label: "Todos", count: 3, value: "", isActive: false },
        { id: "status-attention", label: "Atenção", count: 3, value: "attention", isActive: true },
        { id: "status-unused", label: "Sem uso", count: 1, value: "unused", isActive: false }
      ]
    });
  });

  it("filters audio library by format, origin and sort order", () => {
    const presentation = deriveAudioWorkspacePresentation({
      assets: [{ name: "theme.mod", kind: "Audio", metadata: { source: "Assets/theme.mod" } }],
      scenas: [{ name: "start", music: "theme.mod" }],
      audioItems: [
        { id: "audio-theme", name: "theme.mod", kind: "Musica", format: "MOD", bpm: 120 },
        { id: "audio-confirm", name: "confirm.wav", kind: "SFX", format: "WAV", bpm: 140 },
        { id: "audio-unused", name: "unused.wav", kind: "Musica", format: "WAV", bpm: 999 }
      ]
    });

    expect(filterAudioWorkspaceItems(presentation.items, { format: "WAV" }).map((item) => item.name)).toEqual([
      "confirm.wav",
      "unused.wav"
    ]);
    expect(filterAudioWorkspaceItems(presentation.items, { origin: "Importado" }).map((item) => item.name)).toEqual(["theme.mod"]);
    expect(filterAudioWorkspaceItems(presentation.items, { sort: "bpm-desc" }).map((item) => item.name)).toEqual([
      "unused.wav",
      "confirm.wav",
      "theme.mod"
    ]);
    expect(filterAudioWorkspaceItems(presentation.items, { sort: "usage-desc" }).map((item) => item.usageCount)).toEqual([1, 0, 0]);
  });

  it("derives export summary for inspector accordion", () => {
    const presentation = deriveAudioWorkspacePresentation({
      scenas: [{ name: "start", music: "theme.mod" }],
      audioItems: [{ id: "audio-theme", name: "theme.mod", kind: "Musica", format: "MOD", exportID: "theme", bpm: 120 }]
    });

    expect(deriveAudioExportSummary(presentation.items[0])).toEqual({
      exportID: "theme",
      fileName: "theme.audio.json",
      runtimeCommand: "play_music theme.mod",
      origin: "Composto",
      format: "MOD",
      warningCount: 1,
      ready: false,
      usageCount: 1,
      playbackBadge: "Sem pack",
      playbackLabel: "Este item não gera áudio no pack da ROM."
    });
    expect(deriveAudioExportSummary(null)).toBeNull();
  });

  it("marks imported and composed export-ready audio with distinct playback badges", () => {
    const presentation = deriveAudioWorkspacePresentation({
      assets: [
        { id: "asset-theme", name: "theme.mod", kind: "Musica", metadata: { source: "Assets/music/theme.mod" } },
        { id: "asset-hit", name: "hit.wav", kind: "SFX", metadata: { source: "Assets/sounds/hit.wav" } }
      ],
      audioItems: [
        { id: "audio-theme", name: "theme.mod", kind: "Musica", format: "MOD", exportID: "theme", bpm: 120 },
        {
          id: "audio-composed",
          name: "jingle",
          kind: "Musica",
          format: "MOD",
          exportID: "jingle",
          bpm: 120,
          patterns: [{
            id: "pattern-main",
            name: "Main",
            steps: 4,
            channels: [{ id: "ch-1", name: "Pulse", type: "pulse", notes: ["C4", "", "", ""] }]
          }],
          patternOrder: ["pattern-main"]
        },
        { id: "audio-empty", name: "empty", kind: "Musica", format: "Unknown", exportID: "empty" }
      ]
    });

    const byName = new Map(presentation.items.map((item) => [item.name, item]));
    expect(deriveAudioExportSummary(byName.get("theme.mod") ?? null)).toMatchObject({
      playbackBadge: "Compatível",
      playbackLabel: "Formato aceito pelo assetc; a compilação verifica o arquivo."
    });
    expect(deriveAudioExportSummary(byName.get("jingle") ?? null)).toMatchObject({
      playbackBadge: "Compatível",
      playbackLabel: "Composição convertida para o pack de áudio ao exportar."
    });
    expect(deriveAudioExportSummary(byName.get("empty") ?? null)).toMatchObject({
      playbackBadge: "Sem pack",
      ready: false
    });
  });

  it("keeps presentation resilient for partial audio data", () => {
    const presentation = deriveAudioWorkspacePresentation({
      audioItems: [{ name: "", kind: "", format: "", bpm: 0, volume: -1 }]
    });

    expect(presentation.summary).toEqual({
      audioCount: 1,
      musicCount: 0,
      sfxCount: 0,
      loopingCount: 0,
      importedCount: 0,
      composedCount: 0,
      unknownOriginCount: 1,
      unusedCount: 1,
      attentionCount: 1,
      totalPatterns: 0,
      totalChannels: 0,
      totalNotes: 0
    });
    expect(presentation.items[0]).toMatchObject({
      id: "audio-1",
      name: "Audio sem nome",
      kind: "Audio",
      format: "Desconhecido",
      assignedScene: null,
      loops: false,
      bpm: null,
      exportID: "audio_sem_nome",
      origin: "Sem fonte",
      runtimeCommand: null,
      status: "Bloqueado",
      warnings: ["Áudio sem uso em cenas ou eventos."]
    });
  });

  it("reports missing pattern sequence slots as actionable audio warnings", () => {
    const presentation = deriveAudioWorkspacePresentation({
      scenas: [{ name: "start", music: "theme.mod" }],
      audioItems: [
        {
          id: "audio-theme",
          name: "theme.mod",
          kind: "Musica",
          format: "MOD",
          patterns: [{ id: "intro", name: "Intro" }],
          patternOrder: ["intro", "missing-loop"]
        }
      ]
    });

    expect(presentation.summary.attentionCount).toBe(1);
    expect(presentation.items[0]).toMatchObject({
      name: "theme.mod",
      status: "Bloqueado",
      warnings: ["Sequencia referencia padrao ausente no slot 2: missing-loop."]
    });
    expect(presentation.items[0].patternSequence).toEqual([
      { index: 0, patternID: "intro", label: "Intro", isMissing: false },
      { index: 1, patternID: "missing-loop", label: "Padrao ausente: missing-loop", isMissing: true }
    ]);
  });

  it("accepts composed music and SFX as exportable regardless of their source format label", () => {
    const presentation = deriveAudioWorkspacePresentation({
      events: [
        { name: "music", steps: [{ command: "play_music gba_theme" }] },
        { name: "sfx", steps: [{ command: "play_sfx gba_crash" }] }
      ],
      audioItems: [
        {
          id: "audio-theme",
          name: "gba_theme",
          kind: "Musica",
          format: "COMPOSED",
          patterns: [{ id: "main", channels: [{ type: "pulse1", notes: ["C4"] }] }]
        },
        {
          id: "audio-crash",
          name: "gba_crash",
          kind: "SFX",
          format: "COMPOSED",
          patterns: [{ id: "hit", channels: [{ type: "noise", notes: ["K"] }] }]
        }
      ]
    });

    expect(presentation.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "gba_theme", status: "OK", warnings: [] }),
      expect.objectContaining({ name: "gba_crash", status: "OK", warnings: [] })
    ]));
  });

  it("creates a musica item with a starter pattern, channels and preset notes", () => {
    const next = createAudioItemInProject(createBlankProjectData({ name: "Novo projeto" }), {
      id: "audio-theme",
      name: "nova_musica.mod",
      kind: "Musica"
    });
    const created = (next.audioItems as Record<string, unknown>[])[0];
    const patterns = created.patterns as Record<string, unknown>[];
    const pattern = patterns[0];
    const channels = pattern.channels as Record<string, unknown>[];

    expect(patterns).toHaveLength(1);
    expect(created.activePatternID).toBe("audio-theme-pattern-1");
    expect(created.patternOrder).toEqual(["audio-theme-pattern-1"]);
    expect(channels.map((channel) => channel.name)).toEqual(["Pulse 1", "Pulse 2", "Wave", "Noise"]);
    expect((channels[0]?.notes as string[])[0]).toBe("C4");

    const presentation = deriveAudioWorkspacePresentation(next);
    expect(presentation.items[0]?.channelCount).toBe(4);
    expect(presentation.items[0]?.noteCount).toBeGreaterThan(0);
    expect(presentation.items[0]?.previewRows).toHaveLength(4);
  });

  it("creates an audio item with safe defaults without discarding unrelated fields", () => {
    const project = {
      audioItems: [{ id: "audio-theme", name: "theme.mod", kind: "Musica", format: "MOD" }],
      editorState: { selectedWorkspace: "audio" }
    };

    const next = createAudioItemInProject(project, {
      id: "audio-confirm",
      name: "confirm.wav",
      kind: "SFX"
    });

    expect(next.audioItems).toEqual([
      { id: "audio-theme", name: "theme.mod", kind: "Musica", format: "MOD" },
      {
        id: "audio-confirm",
        name: "confirm.wav",
        kind: "SFX",
        format: "COMPOSED",
        assignedScene: "Global",
        loops: false,
        bpm: 120,
        exportID: "confirm",
        volume: 90,
        channels: [],
        activePatternID: "audio-confirm-pattern-1",
        patternOrder: ["audio-confirm-pattern-1"],
        patterns: [{ id: "audio-confirm-pattern-1", name: "Pattern 1", steps: 16, channels: [{ id: "audio-confirm-pattern-1-noise", name: "Noise", type: "noise", instrument: "Noise Kit", envelope: "Short Decay", notes: [] }] }]
      }
    ]);
    expect(next.editorState).toEqual({ selectedWorkspace: "audio" });
    expect(project.audioItems).toHaveLength(1);
  });

  it("renames an audio item and updates room music plus play commands", () => {
    const project = {
      scenas: [{ name: "start", music: "theme.mod" }],
      events: [
        { name: "boot", command: "play_music theme.mod" },
        { name: "confirm", steps: [{ command: "play_sfx theme.mod" }, { command: "noop" }] }
      ],
      audioItems: [{ id: "audio-theme", name: "theme.mod", kind: "Musica", format: "MOD", exportID: "theme" }]
    };

    const next = renameAudioItemInProject(project, "audio-theme", "intro.mod");

    expect(next.audioItems).toEqual([{ id: "audio-theme", name: "intro.mod", kind: "Musica", format: "MOD", exportID: "intro" }]);
    expect(next.scenas).toEqual([{ name: "start", music: "intro.mod" }]);
    expect(next.events).toEqual([
      { name: "boot", command: "play_music intro.mod" },
      { name: "confirm", steps: [{ command: "play_sfx intro.mod" }, { command: "noop" }] }
    ]);
  });

  it("duplicates an audio item with a new id, name and export id", () => {
    const project = {
      audioItems: [
        {
          id: "audio-theme",
          name: "theme.mod",
          kind: "Musica",
          format: "MOD",
          exportID: "theme",
          patterns: [{ id: "pattern-a", name: "intro" }]
        }
      ]
    };

    const next = duplicateAudioItemInProject(project, {
      sourceAudioID: "audio-theme",
      newAudioID: "audio-theme-copy",
      newName: "theme_copy.mod"
    });

    expect(next.audioItems).toEqual([
      {
        id: "audio-theme",
        name: "theme.mod",
        kind: "Musica",
        format: "MOD",
        exportID: "theme",
        patterns: [{ id: "pattern-a", name: "intro" }]
      },
      {
        id: "audio-theme-copy",
        name: "theme_copy.mod",
        kind: "Musica",
        format: "MOD",
        exportID: "theme_copy",
        patterns: [{ id: "pattern-a", name: "intro" }]
      }
    ]);
    expect(project.audioItems).toHaveLength(1);
  });

  it("prepares a stable selected-audio export file", () => {
    const project = {
      assets: [
        {
          id: "asset-theme",
          name: "theme.mod",
          kind: "Audio",
          metadata: { source: "Assets/music/theme.mod" }
        }
      ],
      scenas: [{ name: "room_1", music: "theme.mod" }],
      events: [{ name: "boot", command: "play_music theme.mod" }],
      audioItems: [
        {
          id: "audio-theme",
          name: "theme.mod",
          kind: "Musica",
          format: "MOD",
          assignedScene: "room_1",
          loops: true,
          bpm: 120,
          exportID: "theme_song",
          volume: 80,
          patterns: [
            {
              id: "pattern-a",
              name: "intro",
              channels: [{ id: "pulse", name: "Pulse 1", type: "pulse1", notes: ["C4", null, "E4"] }]
            }
          ],
          patternOrder: ["pattern-a"]
        }
      ]
    };

    const prepared = prepareAudioExport(project, "audio-theme");
    const parsed = JSON.parse(prepared?.contents ?? "{}") as {
      audio?: { previewRows?: Array<{ cells: unknown[] }> };
    };

    expect(prepared?.fileName).toBe("theme_song.audio.json");
    expect(parsed).toMatchObject({
      kind: "gbastudio.audio",
      version: 2,
      audio: {
        id: "audio-theme",
        name: "theme.mod",
        kind: "Musica",
        format: "MOD",
        assignedScene: "room_1",
        loops: true,
        bpm: 120,
        exportID: "theme_song",
        volume: 80,
        source: "Assets/music/theme.mod",
        origin: "Composto",
        runtimeCommand: "play_music theme.mod",
        usageLabels: ["Cena: room_1", "Evento: boot"],
        patterns: [{ id: "pattern-a", name: "intro" }],
        patternSequence: [{ index: 0, patternID: "pattern-a", label: "intro", isMissing: false }],
        previewRows: [
          {
            id: "pulse",
            label: "Pulse 1",
            type: "pulse1",
            isMuted: false,
            isSolo: false,
            activeNoteCount: 2
          }
        ],
        warnings: []
      }
    });
    expect(parsed.audio?.previewRows?.[0]?.cells.slice(0, 3)).toEqual([
      { index: 0, note: "C4", isActive: true, pitchClass: "C", octave: 4, pianoLane: 59, isPercussion: false },
      { index: 1, note: null, isActive: false, pitchClass: null, octave: null, pianoLane: null, isPercussion: false },
      { index: 2, note: "E4", isActive: true, pitchClass: "E", octave: 4, pianoLane: 55, isPercussion: false }
    ]);
    expect(parsed.audio?.previewRows?.[0]?.cells).toHaveLength(64);
    expect(prepareAudioExport(project, "missing")).toBeNull();
  });

  it("removes an audio item and clears room music plus direct play commands", () => {
    const project = {
      scenas: [
        { name: "start", music: "theme.mod" },
        { name: "shop", music: "shop.mod" }
      ],
      events: [
        { name: "boot", command: "play_music theme.mod" },
        { name: "confirm", steps: [{ command: "play_sfx theme.mod" }, { command: "play_music shop.mod" }] }
      ],
      audioItems: [
        { id: "audio-theme", name: "theme.mod", kind: "Musica", format: "MOD" },
        { id: "audio-shop", name: "shop.mod", kind: "Musica", format: "MOD" }
      ]
    };

    const next = removeAudioItemFromProject(project, "audio-theme");

    expect(next.audioItems).toEqual([{ id: "audio-shop", name: "shop.mod", kind: "Musica", format: "MOD" }]);
    expect(next.scenas).toEqual([{ name: "start" }, { name: "shop", music: "shop.mod" }]);
    expect(next.events).toEqual([
      { name: "boot", command: "noop" },
      { name: "confirm", steps: [{ command: "noop" }, { command: "play_music shop.mod" }] }
    ]);
  });

  it("updates editable audio fields without dropping composer data", () => {
    const project = {
      audioItems: [
        {
          id: "audio-theme",
          name: "theme.mod",
          kind: "Musica",
          format: "MOD",
          assignedScene: "start",
          loops: true,
          bpm: 132,
          exportID: "theme",
          volume: 80,
          patterns: [{ id: "pattern-a", name: "intro" }],
          channels: [{ id: "ch-1", notes: ["C4"] }]
        }
      ]
    };

    const next = updateAudioItemFieldsInProject(project, "audio-theme", {
      kind: "SFX",
      format: "wav",
      assignedScene: "Global",
      loops: false,
      bpm: 96,
      volume: 64
    });

    expect(next.audioItems).toEqual([
      {
        id: "audio-theme",
        name: "theme.mod",
        kind: "SFX",
        format: "WAV",
        assignedScene: "Global",
        loops: false,
        bpm: 96,
        exportID: "theme",
        volume: 64,
        patterns: [{ id: "pattern-a", name: "intro" }],
        channels: [{ id: "ch-1", notes: ["C4"] }]
      }
    ]);
    expect(project.audioItems[0].kind).toBe("Musica");
  });

  it("updates tracker notes inside pattern channels and direct channels", () => {
    const project = {
      audioItems: [
        {
          id: "audio-theme",
          name: "theme.mod",
          kind: "Musica",
          patterns: [
            {
              id: "pattern-a",
              channels: [
                { id: "pulse", name: "Pulse", notes: ["C4", "---"] }
              ]
            }
          ],
          channels: [{ id: "direct", name: "Direct", notes: ["A3"] }]
        },
        {
          id: "audio-confirm",
          name: "confirm.wav",
          kind: "SFX",
          channels: [{ id: "noise", name: "Noise", notes: ["K"] }]
        }
      ]
    };

    const withPatternNote = updateAudioChannelNoteInProject(project, "audio-theme", {
      channelID: "pulse",
      stepIndex: 2,
      note: "E4"
    });
    const withClearedDirectNote = updateAudioChannelNoteInProject(withPatternNote, "audio-confirm", {
      channelID: "noise",
      stepIndex: 0,
      note: ""
    });

    expect(withClearedDirectNote.audioItems).toEqual([
      {
        id: "audio-theme",
        name: "theme.mod",
        kind: "Musica",
        patterns: [
          {
            id: "pattern-a",
            channels: [
              { id: "pulse", name: "Pulse", notes: ["C4", "---", "E4"] }
            ]
          }
        ],
        channels: [{ id: "direct", name: "Direct", notes: ["A3"] }]
      },
      {
        id: "audio-confirm",
        name: "confirm.wav",
        kind: "SFX",
        channels: [{ id: "noise", name: "Noise", notes: ["---"] }]
      }
    ]);
    expect(project.audioItems).toEqual([
      {
        id: "audio-theme",
        name: "theme.mod",
        kind: "Musica",
        patterns: [
          {
            id: "pattern-a",
            channels: [
              { id: "pulse", name: "Pulse", notes: ["C4", "---"] }
            ]
          }
        ],
        channels: [{ id: "direct", name: "Direct", notes: ["A3"] }]
      },
      {
        id: "audio-confirm",
        name: "confirm.wav",
        kind: "SFX",
        channels: [{ id: "noise", name: "Noise", notes: ["K"] }]
      }
    ]);
    expect(updateAudioChannelNoteInProject(project, "missing", { channelID: "pulse", stepIndex: 0, note: "D4" })).toBe(project);
    expect(updateAudioChannelNoteInProject(project, "audio-theme", { channelID: "missing", stepIndex: 0, note: "D4" })).toBe(project);
    expect(updateAudioChannelNoteInProject(project, "audio-theme", { channelID: "pulse", stepIndex: -1, note: "D4" })).toBe(project);
  });

  it("transposes pitched tracker notes by semitone without changing percussion or empty cells", () => {
    const project = {
      audioItems: [
        {
          id: "audio-theme",
          name: "theme.mod",
          kind: "Musica",
          patterns: [
            {
              id: "pattern-a",
              channels: [
                { id: "pulse", name: "Pulse", notes: ["C4", "B4", "K", "---"] }
              ]
            }
          ],
          channels: [{ id: "direct", name: "Direct", notes: ["A3"] }]
        }
      ]
    };

    const withRaisedPatternNote = transposeAudioChannelNoteInProject(project, "audio-theme", {
      channelID: "pulse",
      deltaSemitones: 1,
      stepIndex: 0
    });
    const withLoweredDirectNote = transposeAudioChannelNoteInProject(withRaisedPatternNote, "audio-theme", {
      channelID: "direct",
      deltaSemitones: -2,
      stepIndex: 0
    });

    expect(withLoweredDirectNote.audioItems).toEqual([
      {
        id: "audio-theme",
        name: "theme.mod",
        kind: "Musica",
        patterns: [
          {
            id: "pattern-a",
            channels: [
              { id: "pulse", name: "Pulse", notes: ["C#4", "B4", "K", "---"] }
            ]
          }
        ],
        channels: [{ id: "direct", name: "Direct", notes: ["G3"] }]
      }
    ]);
    expect(project.audioItems[0].patterns[0].channels[0].notes).toEqual(["C4", "B4", "K", "---"]);
    expect(transposeAudioChannelNoteInProject(project, "audio-theme", { channelID: "pulse", deltaSemitones: 1, stepIndex: 2 })).toBe(project);
    expect(transposeAudioChannelNoteInProject(project, "audio-theme", { channelID: "pulse", deltaSemitones: 1, stepIndex: 3 })).toBe(project);
    expect(transposeAudioChannelNoteInProject(project, "audio-theme", { channelID: "pulse", deltaSemitones: 0, stepIndex: 0 })).toBe(project);
    expect(transposeAudioChannelNoteInProject(project, "audio-theme", { channelID: "missing", deltaSemitones: 1, stepIndex: 0 })).toBe(project);
  });

  it("transposes every pitched note in a channel while preserving percussion and empty cells", () => {
    const project = {
      audioItems: [
        {
          id: "audio-theme",
          name: "theme.mod",
          kind: "Musica",
          patterns: [
            {
              id: "pattern-a",
              channels: [
                { id: "pulse", name: "Pulse", notes: ["C4", "D#4", "K", "---", "B4"] }
              ]
            }
          ],
          channels: [{ id: "direct", name: "Direct", notes: ["A3", "S", "C0"] }]
        }
      ]
    };

    const withRaisedPatternChannel = transposeAudioChannelInProject(project, "audio-theme", {
      channelID: "pulse",
      deltaSemitones: 2
    });
    const withLoweredDirectChannel = transposeAudioChannelInProject(withRaisedPatternChannel, "audio-theme", {
      channelID: "direct",
      deltaSemitones: -2
    });

    expect(withLoweredDirectChannel.audioItems).toEqual([
      {
        id: "audio-theme",
        name: "theme.mod",
        kind: "Musica",
        patterns: [
          {
            id: "pattern-a",
            channels: [
              { id: "pulse", name: "Pulse", notes: ["D4", "F4", "K", "---", "C#5"] }
            ]
          }
        ],
        channels: [{ id: "direct", name: "Direct", notes: ["G3", "S", "C0"] }]
      }
    ]);
    expect(project.audioItems[0].patterns[0].channels[0].notes).toEqual(["C4", "D#4", "K", "---", "B4"]);
    expect(transposeAudioChannelInProject(project, "audio-theme", { channelID: "pulse", deltaSemitones: 0 })).toBe(project);
    expect(transposeAudioChannelInProject(project, "audio-theme", { channelID: "missing", deltaSemitones: 1 })).toBe(project);
    expect(transposeAudioChannelInProject(project, "missing", { channelID: "pulse", deltaSemitones: 1 })).toBe(project);
  });

  it("updates mixer flags inside pattern channels and direct channels", () => {
    const project = {
      audioItems: [
        {
          id: "audio-theme",
          name: "theme.mod",
          kind: "Musica",
          patterns: [
            {
              id: "pattern-a",
              channels: [
                { id: "pulse", name: "Pulse", muted: false, solo: false }
              ]
            }
          ]
        },
        {
          id: "audio-confirm",
          name: "confirm.wav",
          kind: "SFX",
          channels: [{ id: "noise", name: "Noise", muted: false, solo: true }]
        }
      ]
    };

    const withMutedPatternChannel = updateAudioChannelFieldsInProject(project, "audio-theme", {
      channelID: "pulse",
      muted: true,
      solo: true
    });
    const withDirectSoloCleared = updateAudioChannelFieldsInProject(withMutedPatternChannel, "audio-confirm", {
      channelID: "noise",
      solo: false
    });

    expect(withDirectSoloCleared.audioItems).toEqual([
      {
        id: "audio-theme",
        name: "theme.mod",
        kind: "Musica",
        patterns: [
          {
            id: "pattern-a",
            channels: [
              { id: "pulse", name: "Pulse", muted: true, solo: true }
            ]
          }
        ]
      },
      {
        id: "audio-confirm",
        name: "confirm.wav",
        kind: "SFX",
        channels: [{ id: "noise", name: "Noise", muted: false, solo: false }]
      }
    ]);
    expect(project.audioItems).toEqual([
      {
        id: "audio-theme",
        name: "theme.mod",
        kind: "Musica",
        patterns: [
          {
            id: "pattern-a",
            channels: [
              { id: "pulse", name: "Pulse", muted: false, solo: false }
            ]
          }
        ]
      },
      {
        id: "audio-confirm",
        name: "confirm.wav",
        kind: "SFX",
        channels: [{ id: "noise", name: "Noise", muted: false, solo: true }]
      }
    ]);
    expect(updateAudioChannelFieldsInProject(project, "missing", { channelID: "pulse", muted: true })).toBe(project);
    expect(updateAudioChannelFieldsInProject(project, "audio-theme", { channelID: "missing", muted: true })).toBe(project);
    expect(updateAudioChannelFieldsInProject(project, "audio-theme", { channelID: "", muted: true })).toBe(project);
  });

  it("updates editable channel metadata without changing notes", () => {
    const project = {
      audioItems: [
        {
          id: "audio-theme",
          name: "theme.mod",
          kind: "Musica",
          patterns: [
            {
              id: "pattern-a",
              channels: [
                { id: "pulse", name: "Pulse", type: "pulse1", notes: ["C4"] }
              ]
            }
          ]
        },
        {
          id: "audio-confirm",
          name: "confirm.wav",
          kind: "SFX",
          channels: [{ id: "noise", name: "Noise", type: "noise", notes: ["K"] }]
        }
      ]
    };

    const withPatternChannelRenamed = updateAudioChannelFieldsInProject(project, "audio-theme", {
      channelID: "pulse",
      name: "Lead",
      type: "wave"
    });
    const withDirectChannelRenamed = updateAudioChannelFieldsInProject(withPatternChannelRenamed, "audio-confirm", {
      channelID: "noise",
      name: "Kick",
      type: "sfx"
    });

    expect(withDirectChannelRenamed.audioItems).toEqual([
      {
        id: "audio-theme",
        name: "theme.mod",
        kind: "Musica",
        patterns: [
          {
            id: "pattern-a",
            channels: [
              { id: "pulse", name: "Lead", type: "wave", notes: ["C4"] }
            ]
          }
        ]
      },
      {
        id: "audio-confirm",
        name: "confirm.wav",
        kind: "SFX",
        channels: [{ id: "noise", name: "Kick", type: "sfx", notes: ["K"] }]
      }
    ]);
    expect(project.audioItems).toEqual([
      {
        id: "audio-theme",
        name: "theme.mod",
        kind: "Musica",
        patterns: [
          {
            id: "pattern-a",
            channels: [
              { id: "pulse", name: "Pulse", type: "pulse1", notes: ["C4"] }
            ]
          }
        ]
      },
      {
        id: "audio-confirm",
        name: "confirm.wav",
        kind: "SFX",
        channels: [{ id: "noise", name: "Noise", type: "noise", notes: ["K"] }]
      }
    ]);
    expect(updateAudioChannelFieldsInProject(project, "audio-theme", { channelID: "pulse", name: "" })).toBe(project);
    expect(updateAudioChannelFieldsInProject(project, "audio-theme", { channelID: "pulse", type: "  " })).toBe(project);
  });

  it("creates channels in a selected pattern or direct audio channel list", () => {
    const project = {
      audioItems: [
        {
          id: "audio-theme",
          name: "theme.mod",
          kind: "Musica",
          patterns: [
            {
              id: "pattern-a",
              channels: [{ id: "pulse", name: "Pulse", type: "pulse1", notes: ["C4"] }]
            }
          ]
        },
        {
          id: "audio-confirm",
          name: "confirm.wav",
          kind: "SFX",
          channels: [{ id: "noise", name: "Noise", type: "noise", notes: ["K"] }]
        }
      ]
    };

    const withPatternChannel = createAudioChannelInProject(project, "audio-theme", {
      id: "wave",
      name: "Wave",
      type: "wave",
      patternID: "pattern-a"
    });
    const withDirectChannel = createAudioChannelInProject(withPatternChannel, "audio-confirm", {
      id: "hit",
      name: "Hit",
      type: "sfx"
    });

    expect(withDirectChannel.audioItems).toEqual([
      {
        id: "audio-theme",
        name: "theme.mod",
        kind: "Musica",
        patterns: [
          {
            id: "pattern-a",
            channels: [
              { id: "pulse", name: "Pulse", type: "pulse1", notes: ["C4"] },
              { id: "wave", name: "Wave", type: "wave", notes: [], muted: false, solo: false }
            ]
          }
        ]
      },
      {
        id: "audio-confirm",
        name: "confirm.wav",
        kind: "SFX",
        channels: [
          { id: "noise", name: "Noise", type: "noise", notes: ["K"] }
        ]
      }
    ]);
    expect(project.audioItems).toEqual([
      {
        id: "audio-theme",
        name: "theme.mod",
        kind: "Musica",
        patterns: [
          {
            id: "pattern-a",
            channels: [{ id: "pulse", name: "Pulse", type: "pulse1", notes: ["C4"] }]
          }
        ]
      },
      {
        id: "audio-confirm",
        name: "confirm.wav",
        kind: "SFX",
        channels: [{ id: "noise", name: "Noise", type: "noise", notes: ["K"] }]
      }
    ]);
    expect(createAudioChannelInProject(project, "audio-theme", { id: "wave", name: "Wave", type: "wave" })).toBe(project);
    expect(createAudioChannelInProject(project, "audio-theme", { id: "pulse", name: "Wave", type: "wave", patternID: "pattern-a" })).toBe(project);
    expect(createAudioChannelInProject(project, "audio-theme", { id: "wave", name: "", type: "wave", patternID: "pattern-a" })).toBe(project);
    expect(createAudioChannelInProject(project, "audio-theme", { id: "wave", name: "Wave", type: "", patternID: "pattern-a" })).toBe(project);
    expect(createAudioChannelInProject(project, "missing", { id: "wave", name: "Wave", type: "wave" })).toBe(project);
  });

  it("removes pattern and direct channels without changing other channels", () => {
    const project = {
      audioItems: [
        {
          id: "audio-theme",
          name: "theme.mod",
          kind: "Musica",
          patterns: [
            {
              id: "pattern-a",
              channels: [
                { id: "pulse", name: "Pulse", type: "pulse1", notes: ["C4"] },
                { id: "wave", name: "Wave", type: "wave", notes: ["E4"] }
              ]
            }
          ]
        },
        {
          id: "audio-confirm",
          name: "confirm.wav",
          kind: "SFX",
          channels: [
            { id: "noise", name: "Noise", type: "noise", notes: ["K"] },
            { id: "hit", name: "Hit", type: "sfx", notes: ["S"] }
          ]
        }
      ]
    };

    const withoutPatternChannel = removeAudioChannelFromProject(project, "audio-theme", "wave");
    const withoutDirectChannel = removeAudioChannelFromProject(withoutPatternChannel, "audio-confirm", "hit");

    expect(withoutDirectChannel.audioItems).toEqual([
      {
        id: "audio-theme",
        name: "theme.mod",
        kind: "Musica",
        patterns: [
          {
            id: "pattern-a",
            channels: [{ id: "pulse", name: "Pulse", type: "pulse1", notes: ["C4"] }]
          }
        ]
      },
      {
        id: "audio-confirm",
        name: "confirm.wav",
        kind: "SFX",
        channels: [{ id: "noise", name: "Noise", type: "noise", notes: ["K"] }]
      }
    ]);
    expect(project.audioItems).toEqual([
      {
        id: "audio-theme",
        name: "theme.mod",
        kind: "Musica",
        patterns: [
          {
            id: "pattern-a",
            channels: [
              { id: "pulse", name: "Pulse", type: "pulse1", notes: ["C4"] },
              { id: "wave", name: "Wave", type: "wave", notes: ["E4"] }
            ]
          }
        ]
      },
      {
        id: "audio-confirm",
        name: "confirm.wav",
        kind: "SFX",
        channels: [
          { id: "noise", name: "Noise", type: "noise", notes: ["K"] },
          { id: "hit", name: "Hit", type: "sfx", notes: ["S"] }
        ]
      }
    ]);
    expect(removeAudioChannelFromProject(project, "missing", "wave")).toBe(project);
    expect(removeAudioChannelFromProject(project, "audio-theme", "missing")).toBe(project);
    expect(removeAudioChannelFromProject(project, "audio-theme", "")).toBe(project);
  });

  it("updates pattern sequence slots only with patterns from the same audio item", () => {
    const project = {
      audioItems: [
        {
          id: "audio-theme",
          name: "theme.mod",
          kind: "Musica",
          patterns: [
            { id: "intro", name: "Intro" },
            { id: "loop", name: "Loop" }
          ],
          patternOrder: ["intro"]
        },
        {
          id: "audio-confirm",
          name: "confirm.wav",
          kind: "SFX",
          patterns: [{ id: "foreign", name: "Foreign" }]
        }
      ]
    };

    const withInsertedSlot = updateAudioPatternOrderSlotInProject(project, "audio-theme", 1, "loop");
    const withRemovedSlot = updateAudioPatternOrderSlotInProject(withInsertedSlot, "audio-theme", 0, "");

    expect(withRemovedSlot.audioItems).toEqual([
      {
        id: "audio-theme",
        name: "theme.mod",
        kind: "Musica",
        patterns: [
          { id: "intro", name: "Intro" },
          { id: "loop", name: "Loop" }
        ],
        patternOrder: ["loop"]
      },
      {
        id: "audio-confirm",
        name: "confirm.wav",
        kind: "SFX",
        patterns: [{ id: "foreign", name: "Foreign" }]
      }
    ]);
    expect(project.audioItems[0].patternOrder).toEqual(["intro"]);
    expect(updateAudioPatternOrderSlotInProject(project, "audio-theme", 0, "foreign")).toBe(project);
    expect(updateAudioPatternOrderSlotInProject(project, "missing", 0, "intro")).toBe(project);
    expect(updateAudioPatternOrderSlotInProject(project, "audio-theme", -1, "intro")).toBe(project);
  });

  it("creates an editable tracker pattern with default Game Boy channels and appends it to the sequence", () => {
    const project = {
      audioItems: [
        {
          id: "audio-theme",
          name: "theme.mod",
          kind: "Musica",
          patterns: [{ id: "intro", name: "Intro" }],
          patternOrder: ["intro"]
        }
      ]
    };

    const next = createAudioPatternInProject(project, "audio-theme", {
      id: "loop",
      name: "Loop"
    });

    expect(next.audioItems).toEqual([
      {
        id: "audio-theme",
        name: "theme.mod",
        kind: "Musica",
        patterns: [
          { id: "intro", name: "Intro" },
          {
            id: "loop",
            name: "Loop",
            steps: 64,
            channels: [
              { id: "loop-pulse1", name: "Pulse 1", type: "pulse1", instrument: "Pulse Lead", envelope: "Soft ADSR", notes: [] },
              { id: "loop-pulse2", name: "Pulse 2", type: "pulse2", instrument: "Pulse Lead", envelope: "Soft ADSR", notes: [] },
              { id: "loop-wave", name: "Wave", type: "wave", instrument: "Wave Bass", envelope: "Soft ADSR", notes: [] },
              { id: "loop-noise", name: "Noise", type: "noise", instrument: "Noise Kit", envelope: "Short Decay", notes: [] }
            ]
          }
        ],
        patternOrder: ["intro", "loop"]
      }
    ]);
    expect(project.audioItems).toEqual([
      {
        id: "audio-theme",
        name: "theme.mod",
        kind: "Musica",
        patterns: [{ id: "intro", name: "Intro" }],
        patternOrder: ["intro"]
      }
    ]);
    expect(createAudioPatternInProject(project, "missing", { id: "loop", name: "Loop" })).toBe(project);
    expect(createAudioPatternInProject(project, "audio-theme", { id: "intro", name: "Loop" })).toBe(project);
    expect(createAudioPatternInProject(project, "audio-theme", { id: "loop", name: "" })).toBe(project);
  });

  it("renames and removes tracker patterns while keeping pattern order consistent", () => {
    const project = {
      audioItems: [
        {
          id: "audio-theme",
          name: "theme.mod",
          kind: "Musica",
          patterns: [
            { id: "intro", name: "Intro" },
            { id: "loop", name: "Loop" }
          ],
          patternOrder: ["intro", "loop", "loop"]
        }
      ]
    };

    const renamed = renameAudioPatternInProject(project, "audio-theme", "loop", "Loop principal");
    const removed = removeAudioPatternFromProject(renamed, "audio-theme", "loop");

    expect(renamed.audioItems).toEqual([
      {
        id: "audio-theme",
        name: "theme.mod",
        kind: "Musica",
        patterns: [
          { id: "intro", name: "Intro" },
          { id: "loop", name: "Loop principal" }
        ],
        patternOrder: ["intro", "loop", "loop"]
      }
    ]);
    expect(removed.audioItems).toEqual([
      {
        id: "audio-theme",
        name: "theme.mod",
        kind: "Musica",
        patterns: [{ id: "intro", name: "Intro" }],
        patternOrder: ["intro"]
      }
    ]);
    expect(project.audioItems).toEqual([
      {
        id: "audio-theme",
        name: "theme.mod",
        kind: "Musica",
        patterns: [
          { id: "intro", name: "Intro" },
          { id: "loop", name: "Loop" }
        ],
        patternOrder: ["intro", "loop", "loop"]
      }
    ]);
    expect(renameAudioPatternInProject(project, "missing", "loop", "Loop principal")).toBe(project);
    expect(renameAudioPatternInProject(project, "audio-theme", "missing", "Loop principal")).toBe(project);
    expect(renameAudioPatternInProject(project, "audio-theme", "loop", "")).toBe(project);
    expect(removeAudioPatternFromProject(project, "missing", "loop")).toBe(project);
    expect(removeAudioPatternFromProject(project, "audio-theme", "missing")).toBe(project);
  });

  it("applies safe defaults when changing an audio item kind", () => {
    const project = {
      audioItems: [{ id: "audio-confirm", name: "confirm.wav", kind: "SFX", format: "WAV", loops: false, volume: 90 }]
    };

    const next = updateAudioItemFieldsInProject(project, "audio-confirm", { kind: "Musica" });

    expect(next.audioItems).toEqual([
      {
        id: "audio-confirm",
        name: "confirm.wav",
        kind: "Musica",
        format: "MOD",
        loops: true,
        volume: 80
      }
    ]);
  });

  it("derives composer context and active pattern preview rows from the selected pattern", () => {
    const presentation = deriveAudioWorkspacePresentation({
      audioItems: [{
        id: "audio-theme",
        name: "musica_1.mod",
        kind: "Musica",
        bpm: 120,
        activePatternID: "loop",
        patterns: [
          {
            id: "intro",
            name: "p1",
            steps: 16,
            channels: [{ id: "intro-pulse1", name: "Pulse 1", type: "pulse1", notes: ["C4"] }]
          },
          {
            id: "loop",
            name: "p2",
            steps: 64,
            channels: [
              { id: "loop-pulse1", name: "Pulse 1", type: "pulse1", notes: ["E4"] },
              { id: "loop-noise", name: "Noise", type: "noise", notes: ["K"] }
            ]
          }
        ],
        patternOrder: ["intro", "loop"]
      }]
    });

    const item = presentation.items[0];
    expect(item.activePatternID).toBe("loop");
    expect(item.activePatternName).toBe("p2");
    expect(item.stepCount).toBe(64);
    expect(item.previewRows).toHaveLength(2);
    expect(item.previewRows[0]?.cells).toHaveLength(64);
    expect(deriveAudioComposerContext("complete", item)).toEqual({
      modeLabel: "Modo completo",
      audioName: "musica_1.mod",
      bpm: 120,
      patternName: "p2",
      stepCount: 64,
      channelCount: 2
    });
    expect(deriveAudioChannelMixing(item, "loop-pulse1")).toMatchObject({
      channelLabel: "Pulse 1",
      instrument: "Pulse Lead",
      envelope: "Soft ADSR",
      stepCount: 64
    });
  });

  it("supports active pattern selection, duplication, reordering and normalization", () => {
    const project = {
      audioItems: [{
        id: "audio-theme",
        name: "theme.mod",
        kind: "Musica",
        bpm: 300,
        volume: 200,
        loopStart: 99,
        patterns: [
          { id: "intro", name: "Intro", steps: 16, channels: [{ id: "intro-pulse1", name: "Pulse 1", type: "pulse1", notes: [] }] },
          { id: "loop", name: "Loop", steps: 32, channels: [{ id: "loop-pulse1", name: "Pulse 1", type: "pulse1", notes: ["C4"] }] }
        ],
        patternOrder: ["intro", "loop"]
      }]
    };

    const withActive = setActiveAudioPatternInProject(project, "audio-theme", "loop");
    expect(firstAudioItem(withActive)).toMatchObject({ activePatternID: "loop" });

    const duplicated = duplicateAudioPatternInProject(withActive, "audio-theme", {
      sourcePatternID: "loop",
      newPatternID: "loop-copy",
      newName: "Loop copy"
    });
    expect(firstAudioItem(duplicated)?.patternOrder).toEqual(["intro", "loop", "loop-copy"]);
    expect(firstAudioItem(duplicated)?.activePatternID).toBe("loop-copy");

    const reordered = moveAudioPatternOrderSlotInProject(duplicated, "audio-theme", 2, -1);
    expect(firstAudioItem(reordered)?.patternOrder).toEqual(["intro", "loop-copy", "loop"]);

    const cleared = clearAudioPatternSequenceInProject(reordered, "audio-theme");
    expect(firstAudioItem(cleared)?.patternOrder).toEqual([]);

    const normalized = normalizeAudioInProject(project, "audio-theme");
    expect(firstAudioItem(normalized)).toMatchObject({ bpm: 240, volume: 100, loopStart: 63 });
  });

  it("derives preview playback plan with loop metadata and per-step notes", () => {
    const presentation = deriveAudioWorkspacePresentation({
      audioItems: [{
        id: "audio-theme",
        name: "theme",
        kind: "Musica",
        format: "MOD",
        bpm: 120,
        loops: true,
        loopStart: 4,
        patterns: [{
          id: "pattern-main",
          name: "Main",
          steps: 8,
          channels: [{
            id: "pattern-main-pulse1",
            name: "Pulse 1",
            type: "pulse1",
            instrument: "Pulse Lead",
            envelope: "Soft ADSR",
            notes: ["C4", "", "E4", "", "G4", "", "E4", ""]
          }]
        }]
      }]
    });

    const item = presentation.items[0];
    const plan = deriveAudioPreviewPlaybackPlan(item);
    expect(plan.loops).toBe(true);
    expect(plan.loopStart).toBe(0);
    expect(plan.steps[0]?.notes[0]).toMatchObject({ note: "C4", channelType: "pulse1" });
    expect(presentation.exportDiagnostics.length).toBeGreaterThan(0);
  });

  it("derives preview from the compiled pattern order with exported timbre and exact timing", () => {
    const presentation = deriveAudioWorkspacePresentation({
      audioItems: [{
        id: "audio-theme",
        name: "theme",
        kind: "Musica",
        format: "COMPOSED",
        bpm: 120,
        loops: true,
        volume: 80,
        patterns: [
          {
            id: "intro",
            name: "Intro",
            steps: 2,
            channels: [{
              id: "intro-pulse",
              name: "Pulse",
              type: "pulse1",
              instrument: "Pulse Warm",
              envelope: "Soft ADSR",
              volume: 40,
              notes: ["C4", ""]
            }]
          },
          {
            id: "loop",
            name: "Loop",
            steps: 2,
            channels: [{
              id: "loop-wave",
              name: "Wave",
              type: "wave",
              instrument: "Wave Bass",
              envelope: "Short Decay",
              volume: 100,
              notes: ["C3", "G3"]
            }]
          }
        ],
        patternOrder: ["intro", "loop", "loop"]
      }]
    });

    const item = presentation.items[0];
    const plan = deriveAudioPreviewPlaybackPlan(item);
    expect(plan.stepCount).toBe(6);
    expect(plan.totalDurationMs).toBe(1500);
    expect(plan.steps.map((step) => step.startOffsetMs)).toEqual([0, 250, 500, 750, 1000, 1250]);
    expect(plan.steps[0]?.notes[0]).toMatchObject({
      channel: 1,
      oscillator: "square",
      duty: 1,
      volume: 5,
      attackFrames: 2,
      releaseFrames: 4
    });
    expect(plan.steps[2]?.notes[0]).toMatchObject({
      channel: 3,
      oscillator: "triangle",
      waveform: 1,
      volume: 12
    });
  });

  it("stores and presents volume per audio channel", () => {
    const project = {
      audioItems: [{
        id: "audio-theme",
        name: "theme",
        kind: "Musica",
        volume: 80,
        patterns: [{
          id: "main",
          steps: 1,
          channels: [{ id: "pulse", name: "Pulse", type: "pulse1", volume: 25, notes: ["C4"] }]
        }]
      }]
    };

    const updated = updateAudioChannelFieldsInProject(project, "audio-theme", { channelID: "pulse", volume: 73 });
    const item = deriveAudioWorkspacePresentation(updated).items[0];
    expect(firstAudioItem(updated)?.patterns).toEqual([
      expect.objectContaining({
        channels: [expect.objectContaining({ id: "pulse", volume: 73 })]
      })
    ]);
    expect(deriveAudioChannelMixing(item, "pulse").volume).toBe(73);
  });
});
