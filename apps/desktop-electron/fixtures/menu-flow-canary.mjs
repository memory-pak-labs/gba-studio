export function buildMenuFlowCanaryManifest(templateDir) {
  const roomWidth = 40;
  const visualTiles = Array.from({ length: roomWidth * 20 }, (_, index) => {
    const x = index % roomWidth;
    const y = Math.floor(index / roomWidth);
    return x === 0 || x === roomWidth - 1 || y === 0 || y === 19 ? 2 : ((x + y) % 7 === 0 ? 1 : 0);
  });
  const foregroundTiles = visualTiles.map((_tile, index) => [250, 251, 290, 291].includes(index) ? 3 : -1);

  return {
    schema: 1,
    backend: "gbastudio_engine",
    kind: "mixed",
    runtime_profile: "mixed",
    template_dir: templateDir,
    entry: "main.cpp",
    project_data: "mixed_project_data.hpp",
    generated_assets: [],
    build: {
      target: "menu_flow_canary",
      make_target: "all",
      sources: ["main.cpp", "menu_runtime.cpp", "topdown_runtime.cpp"]
    },
    runtime_dispatch: {
      initial_runtime: "menu",
      initial_room: 0,
      runtimes: ["menu", "topdown"],
      save: { enabled: false, autosave: false, signature: "GBMF", slot_capacity: 1024, slot_count: 1, offset: 0, version: 1 }
    },
    menu_project: {
      initial_screen: 0,
      dialogue_lines: ["GBA STUDIO", "PRESS START", "MAIN MENU", "NEW GAME", "OPTIONS"],
      screens: [
        {
          name: "logo",
          screen_type: "logo",
          title: "GBA Studio",
          title_line: 0,
          auto_advance_frames: 240,
          allow_skip: true,
          next_screen: 1,
          items: []
        },
        {
          name: "title",
          screen_type: "title",
          title: "Runtime Canary",
          title_line: 1,
          items: [{
            label: "PRESS START",
            line: 1,
            action: "open_screen",
            target_screen: 2,
            click_box: { x: 72, y: 104, width: 96, height: 24 }
          }]
        },
        {
          name: "menu",
          screen_type: "menu",
          title: "Main Menu",
          title_line: 2,
          items: [
            {
              label: "NEW GAME",
              line: 3,
              on_select: [{ op: "warp_runtime", runtime: "topdown", room: 0, x: 24, y: 40 }],
              click_box: { x: 40, y: 72, width: 72, height: 24 }
            },
            {
              label: "OPTIONS",
              line: 4,
              click_box: { x: 128, y: 104, width: 72, height: 24 }
            }
          ]
        }
      ]
    },
    topdown_project: {
      initial_room: 0,
      rooms: [{
        name: "gameplay",
        width_tiles: roomWidth,
        height_tiles: 20,
        visual_tiles: visualTiles,
        foreground_tiles: foregroundTiles,
        collision_flags: visualTiles.map((tile) => tile === 2 ? 1 : 0),
        collision_slopes: visualTiles.map(() => 0),
        actors: [{ position: { x: 112, y: 72 }, size: { x: 16, y: 16 }, visible: true, direction: 2 }],
        triggers: []
      }],
      player: { position: { x: 24, y: 40 }, size: { x: 16, y: 16 }, speed: 1 },
      camera: { position: { x: 0, y: 0 }, follow_player: true },
      dialogue_lines: [],
      scripts: []
    }
  };
}
