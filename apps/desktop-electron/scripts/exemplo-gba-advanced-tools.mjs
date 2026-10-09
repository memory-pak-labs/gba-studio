export function promoteExemploGBAAdvancedTools(data) {
  const promoted = structuredClone(data);
  promoted.advancedTools = {
    inputReplays: [{
      schema: 1,
      id: "canonical-route",
      seed: 2026,
      initialSaveSlot: 0,
      initialVariables: {},
      initialInventory: {},
      runs: [
        { frame: { held: ["RIGHT"], pressed: ["RIGHT"] }, frames: 30 },
        { frame: { held: [], pressed: ["A"] }, frames: 1 }
      ],
      checkpoints: {},
      frameCount: 31
    }],
    autotileSets: [{
      id: "canonical-terrain",
      name: "Terreno canônico",
      baseTile: 0,
      topology: "four-neighbor"
    }],
    actorStateMachines: [{
      id: "canonical-enemy",
      name: "Inimigo canônico",
      initialState: "idle",
      states: [
        { id: "idle", onEnter: ["set_variable canonical.enemy.state 0"] },
        { id: "active", onEnter: ["set_variable canonical.enemy.state 1"] }
      ],
      transitions: [{ from: "idle", to: "active", condition: "if_variable canonical.enemy.activate 1" }]
    }],
    saveLabSnapshots: [{
      id: "canonical-start",
      name: "Início canônico",
      slot: 0,
      variables: { "canonical.progress": 0 },
      inventory: {},
      corruption: "none"
    }],
    particleEmitters: [{
      id: "canonical-dust",
      name: "Poeira canônica",
      preset: "dust",
      maxParticles: 12,
      maxPerScanline: 6,
      lifetimeFrames: 24
    }],
    cinematicTimelines: [{
      id: "canonical-intro",
      name: "Introdução canônica",
      durationFrames: 60,
      tracks: [{ kind: "camera", keyframes: [{ frame: 0, command: "camera_move 0 0" }] }]
    }],
    effectSequences: [{
      id: "canonical-fade",
      name: "Fade canônico",
      durationFrames: 30,
      tracks: [{ kind: "fade", keyframes: [{ frame: 0, value: 0 }, { frame: 30, value: 16 }] }]
    }],
    fontProjects: [{
      id: "canonical-font",
      name: "Fonte canônica",
      glyphWidth: 8,
      glyphHeight: 8,
      variableWidth: true,
      glyphs: [],
      kerning: [],
      fallbacks: { "pt-BR": "?" }
    }],
    localizationInterchanges: [{
      id: "canonical-localization",
      format: "csv",
      sourceLocale: "pt-BR",
      targetLocales: ["en", "es"],
      entries: []
    }],
    gameplayComponents: [{
      id: "canonical-components",
      installed: ["dialogue", "shop", "quest", "inventory", "checkpoint", "door", "enemy", "hud"]
    }]
  };
  return promoted;
}
