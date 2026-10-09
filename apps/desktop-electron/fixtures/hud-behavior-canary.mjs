import { buildMenuFlowCanaryManifest } from "./menu-flow-canary.mjs";

export function buildHudBehaviorCanaryManifest(templateDir) {
  const manifest = buildMenuFlowCanaryManifest(templateDir);
  manifest.build.target = "hud_behavior_canary";
  manifest.runtime_dispatch.initial_room = 2;
  manifest.menu_project.initial_screen = 2;
  const screen = manifest.menu_project.screens[2];
  screen.items = [{ label: "HUD TEST", line: 3, action: "select" }];
  screen.on_enter = [
    { op: "wait", frames: 150 }, { op: "set_variable", variable: 0, value: 1 },
    { op: "wait", frames: 150 }, { op: "set_variable", variable: 0, value: 2 },
    { op: "wait", frames: 150 }, { op: "set_variable", variable: 0, value: 0 }
  ];
  const ui = {
    hud_active_layout_id: "behavior",
    hud_presets: [{ id: "behavior" }],
    hud_scene_bindings: [{ scene_name: "menu", preset_id: "behavior" }],
    hud_layouts: [{ id: "behavior", mode: "advanced", components: [{
      id: "choice", kind: "text", label: "Choice", text: "NORMAL", asset: "",
      x: 16, y: 16, width: 120, height: 8, z_index: 0, visible: true,
      behavior: {
        states: {
          selected: { variable: 0, value: 0, text: "SELECTED" },
          disabled: { variable: 0, value: 1, text: "DISABLED" },
          hidden: { variable: 0, value: 2 }
        },
        events: [
          { trigger: "appear", actions: [{ op: "add_variable", variable: 1, value: 1 }] },
          { trigger: "focus", actions: [{ op: "add_variable", variable: 2, value: 1 }] },
          { trigger: "valueChanged", watch_variable: 0, actions: [{ op: "add_variable", variable: 3, value: 1 }] },
          { trigger: "confirm", actions: [{ op: "add_variable", variable: 4, value: 1 }] }
        ]
      }
    }] }]
  };
  manifest.menu_project.dialogue_ui = ui;
  manifest.topdown_project.dialogue_ui = ui;
  return manifest;
}
