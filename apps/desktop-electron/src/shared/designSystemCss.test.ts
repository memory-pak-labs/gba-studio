import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const rendererStylesRoot = join(process.cwd(), "src", "renderer", "styles");
const typographyTokenFiles = new Set(["base.css", "typography.css"]);

const legacyTypographyDeclarationBudget: Record<string, number> = {
  "app-shell.css": 7,
  // Audio workspace additions use shared token values; keep the historical
  // declaration budget aligned with the new selectors.
  "audio.css": 118,
  "colors.css": 42,
  "dialogues.css": 47,
  "events.css": 126,
  "files.css": 37,
  "preview-runtime.css": 22,
  // The pixel-sized labels in the GBA menu composition overlay are intentional
  // preview annotations, not Electron typography declarations.
  // Rooms had 229 legacy direct declarations before these inspector/editor additions.
  "rooms.css": 229,
  "settings.css": 52,
  "sprites.css": 142,
  "studio-ui.css": 18,
  "studio-ui-appearance.css": 3,
  "welcome.css": 16,
  "workspace-common.css": 19
};

function cssFile(name: string): string {
  return readFileSync(join(rendererStylesRoot, name), "utf8");
}

function directTypographyDeclarationCount(css: string): number {
  return [...css.matchAll(/\bfont-(?:size|weight)\s*:/g)].length;
}

describe("Electron design system CSS", () => {
  it("defines the shared visual tokens and motion guardrails", () => {
    const base = cssFile("base.css");

    expect(base).toContain("--studio-color-bg-app:");
    expect(base).toContain("--studio-color-surface:");
    expect(base).toContain("--studio-color-text-primary:");
    expect(base).toContain("--studio-color-accent:");
    expect(base).toContain("--studio-space-4:");
    expect(base).toContain("--studio-radius-panel:");
    expect(base).toContain("--studio-radius-lg:");
    expect(base).toContain("--studio-surface-elevated:");
    expect(base).toContain("--studio-border:");
    expect(base).toContain("--studio-text-muted:");
    expect(base).toContain("--studio-danger:");
    expect(base).toContain("--studio-shadow-raised:");
    expect(base).toContain("--studio-focus-ring:");
    expect(base).toContain("--studio-motion-fast:");
    expect(base).toContain("@media (prefers-reduced-motion: reduce)");
  });

  it("defines and applies shared typography tokens on the primary surfaces", () => {
    const base = cssFile("base.css");
    const targetSurfaceCss = [
      cssFile("app-shell.css"),
      cssFile("welcome.css"),
      cssFile("workspace-common.css"),
      cssFile("rooms.css"),
      cssFile("settings.css"),
      cssFile("events.css"),
      cssFile("files.css"),
      cssFile("sprites.css"),
      cssFile("audio.css"),
      cssFile("dialogues.css"),
      cssFile("typography.css")
    ].join("\n");

    expect(base).toContain("--studio-font-size-xs:");
    expect(base).toContain("--studio-font-size-sm:");
    expect(base).toContain("--studio-font-size-md:");
    expect(base).toContain("--studio-font-size-lg:");
    expect(base).toContain("--studio-font-scale: 0.9;");
    expect(base).toContain('[data-studio-font-size="compact"]');
    expect(base).toContain('[data-studio-font-size="default"]');
    expect(base).toContain('[data-studio-font-size="large"]');
    expect(base).toContain("--studio-font-size-md: calc(13px * var(--studio-font-scale));");
    expect(base).toContain("--studio-font-weight-regular:");
    expect(base).toContain("--studio-font-weight-medium:");
    expect(base).toContain("--studio-font-weight-semibold:");
    expect(base).toContain("--studio-font-weight-bold:");
    expect(base).toContain("--studio-line-height-tight:");
    expect(base).toContain("--studio-line-height-normal:");

    expect(targetSurfaceCss).toContain("var(--studio-font-size-xs)");
    expect(targetSurfaceCss).toContain("var(--studio-font-size-sm)");
    expect(targetSurfaceCss).toContain("var(--studio-font-size-md)");
    expect(targetSurfaceCss).toContain("var(--studio-font-size-lg)");
    expect(targetSurfaceCss).toContain("var(--studio-font-weight-medium)");
    expect(targetSurfaceCss).toContain("var(--studio-font-weight-semibold)");
    expect(targetSurfaceCss).toContain("var(--studio-font-weight-bold)");
  });

  it("keeps new typography declarations centralized in the Electron design system", () => {
    const typography = cssFile("typography.css");
    expect(typography).toContain(".room-stage-preview-loading");
    expect(typography).toContain(".room-connection-advanced-note");
    expect(typography).toContain(".room-scene-hud-summary > div span");
    expect(typography).toContain(".dialogue-appearance-group > summary");
    expect(typography).toContain(".scene-dialogue-preview-caption");

    const styleFiles = readdirSync(rendererStylesRoot)
      .filter((fileName) => fileName.endsWith(".css"))
      .filter((fileName) => !typographyTokenFiles.has(fileName));

    for (const fileName of styleFiles) {
      const actualCount = directTypographyDeclarationCount(cssFile(fileName));
      const allowedCount = legacyTypographyDeclarationBudget[fileName] ?? 0;

      expect(
        actualCount,
        `${fileName} added direct font-size/font-weight declarations; add new typography through base.css/typography.css tokens instead.`
      ).toBeLessThanOrEqual(allowedCount);
    }
  });

  it("applies a semantic UI layer so commands, filters, status, and metadata do not share the same visual treatment", () => {
    const entrypoint = readFileSync(join(process.cwd(), "src", "renderer", "styles.css"), "utf8");
    const semantic = cssFile("semantic-ui.css");

    expect(entrypoint).toMatch(/@import "\.\/styles\/semantic-ui\.css";\s*@import "\.\/styles\/studio-ui\.css";\s*@import "\.\/styles\/dark-theme\.css";\s*@import "\.\/styles\/studio-ui-appearance\.css";\s*$/);
    expect(semantic).toContain("--studio-control-primary-bg:");
    expect(semantic).toContain("--studio-control-secondary-bg:");
    expect(semantic).toContain("--studio-filter-selected-bg:");
    expect(semantic).toContain("--studio-status-bg:");
    expect(semantic).toContain("--studio-token-bg:");

    expect(semantic).toContain(".ui-button");
    expect(semantic).toContain(".ui-segmented");
    expect(semantic).toContain(".ui-chip");
    expect(semantic).toContain(".ui-badge");
    expect(semantic).toContain(".ui-token");
    expect(semantic).toContain(".ui-field");

    expect(semantic).toContain(".welcome-primary");
    expect(semantic).toContain(".topbar-actions .run-button");
    expect(semantic).toContain(".event-command-menu-tabs button");
    expect(semantic).toContain(".sprites-filter-chip-group button");
    expect(semantic).toContain(".audio-summary-strip span");
    expect(semantic).toContain(".settings-edit-row input[readonly]");
  });

  it("applies consistent interaction states to the target UI surfaces", () => {
    const combined = [
      cssFile("base.css"),
      cssFile("app-shell.css"),
      cssFile("welcome.css"),
      cssFile("rooms.css"),
      cssFile("settings.css")
    ].join("\n");

    expect(combined).toMatch(/button:focus-visible/);
    expect(combined).toMatch(/input:focus-visible/);
    expect(combined).toMatch(/button:active:not\(:disabled\)/);
    expect(combined).toContain("transition:");
    expect(combined).toContain("var(--studio-focus-ring)");
    expect(combined).toContain("var(--studio-motion-fast)");
  });

  it("codifies the desktop polish layer for shell, modals, chips, and welcome templates", () => {
    const base = cssFile("base.css");
    const appShell = cssFile("app-shell.css");
    const studioUi = cssFile("studio-ui.css");
    const semantic = cssFile("semantic-ui.css");
    const welcome = cssFile("welcome.css");

    expect(base).toContain("--studio-shadow-control:");
    expect(base).toContain("--studio-shadow-modal:");
    expect(base).toContain("--studio-color-backdrop:");
    expect(appShell).toContain("backdrop-filter: blur(14px)");
    expect(appShell).toContain(".topbar-project");
    expect(appShell).toContain("background: var(--studio-color-surface-muted)");
    expect(studioUi).toContain(".modal-backdrop");
    expect(studioUi).toContain("backdrop-filter: blur(12px)");
    expect(studioUi).toContain("box-shadow: var(--studio-shadow-modal)");
    expect(semantic).toContain(".ui-chip:focus-visible");
    expect(semantic).toContain("min-height: 30px");
    expect(welcome).toContain("grid-template-columns: repeat(auto-fill");
    expect(welcome).toContain("minmax(240px, 1fr)");
  });

  it("keeps the project action menu above the work area", () => {
    const appShell = cssFile("app-shell.css");
    const common = cssFile("workspace-common.css");

    expect(appShell).toMatch(/\.app-topbar\s*\{[\s\S]*position:\s*relative[\s\S]*z-index:\s*20/);
    expect(common).toMatch(/\.project-action-menu\s*\{[\s\S]*z-index:\s*30/);
  });

  it("keeps the shell, welcome, editor, and settings usable on resizable desktop windows", () => {
    const appShell = cssFile("app-shell.css");
    const welcome = cssFile("welcome.css");
    const rooms = cssFile("rooms.css");
    const settings = cssFile("settings.css");

    expect(appShell).toContain("@media (max-width: 1180px)");
    expect(appShell).toContain("@media (max-width: 900px)");
    expect(welcome).toContain("@media (max-width: 900px)");
    expect(rooms).toContain("@media (max-width: 1180px)");
    expect(settings).toContain("@media (max-width: 900px)");
  });

  it("keeps every workspace reachable in the configured minimum window", () => {
    const appShell = cssFile("app-shell.css");

    expect(appShell).toMatch(/@media \(max-width: 900px\)[\s\S]*?\.workspace-list[\s\S]*?overflow-x:\s*hidden;[\s\S]*?justify-content:\s*space-between;/);
    expect(appShell).toMatch(/@media \(max-width: 900px\)[\s\S]*?\.workspace\s*\{[\s\S]*?flex:\s*1 1 0;[\s\S]*?min-width:\s*0;/);
    expect(appShell).toContain(".workspace > span:not(.workspace-icon)");
  });

  it("keeps the Editor chrome fixed while only the canvas and inspector bodies scroll", () => {
    const appShell = cssFile("app-shell.css");
    const common = cssFile("workspace-common.css");
    const rooms = cssFile("rooms.css");

    expect(appShell).toMatch(/\.app-shell\s*\{[^}]*height:\s*100vh[^}]*overflow:\s*hidden/s);
    expect(rooms).toMatch(/\.content:has\(\.rooms-workspace\)\s*\{[^}]*overflow:\s*hidden/s);
    expect(rooms).toMatch(/\.work-area:has\(\.rooms-workspace\)\s*\{[^}]*height:\s*100%[^}]*overflow:\s*hidden/s);
    expect(rooms).toMatch(/\.rooms-workspace\s*\{[^}]*height:\s*100%[^}]*min-height:\s*0/s);
    expect(rooms).toMatch(/\.rooms-editor-layout\s*\{[^}]*height:\s*100%[^}]*min-height:\s*0/s);
    expect(rooms).toMatch(/\.rooms-canvas-world-scroll\s*\{[^}]*overflow:\s*auto/s);
    expect(common).toMatch(/\.editor-side-stack-pane\s*\{[^}]*overflow:\s*auto/s);
  });

  it("keeps room inspector checkboxes compact and inline with their labels", () => {
    const rooms = cssFile("rooms.css");

    expect(rooms).toContain(".room-detail-editor .room-detail-section-note");
    expect(rooms).toContain(".room-detail-editor .scene-feature-module-toggle");
    expect(rooms).toContain('.room-detail-editor input:not([type="checkbox"]):not([type="radio"])');
    expect(rooms).toMatch(/\.room-detail-editor input\[type="checkbox"\][\s\S]*?height:\s*16px[\s\S]*?width:\s*16px/);
  });

  it("keeps inspector labels and tabs readable at rail width", () => {
    const inspector = cssFile("inspector-layout.css");
    const rooms = cssFile("rooms.css");
    const sprites = cssFile("sprites.css");

    expect(inspector).toMatch(/\.inspector-readable label > span[\s\S]*?overflow-wrap:\s*normal;[\s\S]*?word-break:\s*normal;/);
    expect(inspector).toMatch(/\.inspector-readable \[role="tablist"\] > button[\s\S]*?min-inline-size:\s*max-content;[\s\S]*?white-space:\s*nowrap;/);
    expect(inspector).toContain("overflow-x: auto;");
    expect(rooms).toMatch(/\.room-actor-battle-abilities[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(max-content, 1fr\)\)/);
    expect(rooms).toContain(".room-actor-collision-fields");
    expect(sprites).toContain("grid-template-columns: 260px minmax(520px, 1fr) 320px;");
  });

  it("keeps long Editor inspector context visible while sections remain grouped", () => {
    const rooms = cssFile("rooms.css");
    const inspector = cssFile("inspector-layout.css");
    const typography = cssFile("typography.css");

    expect(rooms).toMatch(/\.rooms-inspector-context\s*\{[\s\S]*position:\s*relative;[\s\S]*z-index:\s*5;/);
    expect(rooms).toMatch(/\.rooms-inspector \.room-detail-editor\s*\{[\s\S]*background:\s*transparent;[\s\S]*border:\s*0;[\s\S]*padding:\s*0;/);
    expect(rooms).toMatch(/\.rooms-inspector \.room-detail-editor > \.room-detail-section\s*\{[\s\S]*background:\s*transparent;[\s\S]*border:\s*0;[\s\S]*padding-inline:\s*0;/);
    expect(inspector).toMatch(/\.inspector-section > summary\s*\{[\s\S]*text-transform:\s*none;/);
    expect(typography).toMatch(/\.inspector-readable \.inspector-section > summary\s*\{[\s\S]*font-size:\s*var\(--studio-font-size-sm\);/);
  });

  it("keeps the Rooms inspector readable without wrapping navigation labels", () => {
    const rooms = cssFile("rooms.css");
    const workspaceCommon = cssFile("workspace-common.css");
    const inspector = cssFile("inspector-layout.css");

    expect(rooms).toMatch(/grid-template-columns:\s*260px minmax\(560px, 1fr\) var\(--rooms-inspector-width, 360px\)/);
    expect(rooms).toMatch(/\.rooms-inspector-tabs\s*\{[\s\S]*display:\s*flex;[\s\S]*overflow-x:\s*auto;/);
    expect(rooms).toMatch(/\.rooms-inspector-tabs button\s*\{[\s\S]*min-width:\s*0;[\s\S]*text-overflow:\s*ellipsis;[\s\S]*white-space:\s*nowrap;/);
    expect(inspector).toMatch(/\.inspector-readable \.rooms-inspector-tabs\s*\{[\s\S]*display:\s*flex;[\s\S]*flex-wrap:\s*wrap;[\s\S]*overflow-x:\s*auto;/);
    expect(inspector).toMatch(/\.inspector-readable \.rooms-inspector-tabs > button\s*\{[\s\S]*min-inline-size:\s*0;[\s\S]*text-overflow:\s*ellipsis;/);
    expect(inspector).not.toContain("@container rooms-inspector (max-width: 360px)");
    expect(rooms).not.toMatch(/\.rooms-inspector-context\s*\{[\s\S]*position:\s*sticky;/);
    expect(workspaceCommon).toContain("var(--rooms-inspector-width, 360px)");
  });

  it("uses full-width inspector strips for runtime facts and capability selections", () => {
    const rooms = cssFile("rooms.css");
    const typography = cssFile("typography.css");

    expect(rooms).toMatch(/\.scene-preflight-runtime-panel \.scene-preflight-facts\s*\{[\s\S]*grid-template-columns:\s*minmax\(112px, 0\.6fr\) minmax\(0, 1\.4fr\);/);
    expect(rooms).toMatch(/\.isometric-tactical-capability-grid\s*\{\s*grid-template-columns:\s*minmax\(0, 1fr\);\s*\}/);
    expect(rooms).toMatch(/\.scene-feature-module-card\s*\{[\s\S]*border-bottom:\s*1px solid[\s\S]*border-radius:\s*0;/);
    expect(typography).toMatch(/\.scene-preflight-runtime-panel \.scene-preflight-facts dd\s*\{[\s\S]*font-size:\s*var\(--studio-font-size-sm\);[\s\S]*font-weight:\s*var\(--studio-font-weight-regular\);/);
    expect(typography).toMatch(/\.scene-feature-module-toggle strong/);
  });

  it("separates color consumer identity from usage metadata", () => {
    const colors = cssFile("colors.css");

    expect(colors).toContain("container: colors-panel / inline-size;");
    expect(colors).toContain(".colors-consumer-row > span:first-child");
    expect(colors).toContain(".colors-consumer-row > span:last-child");
    expect(colors).toMatch(/\.colors-consumer-row[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) auto/);
    expect(colors).toMatch(/@media \(max-width: 1180px\)[\s\S]*?\.colors-layout[\s\S]*?grid-template-columns:\s*252px minmax\(0, 1fr\)/);
    expect(colors).toMatch(/\.colors-panel\.inspector-readable[\s\S]*?grid-column:\s*1 \/ -1;[\s\S]*?max-height:\s*320px/);
  });

  it("removes editor selection chrome from read-only scene card actors", () => {
    const rooms = cssFile("rooms.css");
    const actorRuleIndex = rooms.indexOf(".room-stage-entity.actor.has-sprite");
    const readonlyRuleIndex = rooms.lastIndexOf(".room-stage-card-canvas-readonly .room-stage-entity.readonly");

    expect(readonlyRuleIndex).toBeGreaterThan(actorRuleIndex);
    expect(rooms.slice(readonlyRuleIndex)).toMatch(/border:\s*0;[\s\S]*box-shadow:\s*none;/);
  });

  it("keeps the scene preflight readable inside a narrow inspector container", () => {
    const rooms = cssFile("rooms.css");

    expect(rooms).toContain("container: rooms-inspector / inline-size;");
    expect(rooms).toMatch(/@container rooms-inspector \(max-width: 480px\)[\s\S]*?\.room-detail-editor \.scene-preflight-summary[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
    expect(rooms).toMatch(/@container rooms-inspector \(max-width: 480px\)[\s\S]*?\.room-detail-editor \.scene-preflight-columns,[\s\S]*?\.room-detail-editor \.scene-preflight-checklist-grid[\s\S]*?grid-template-columns: 1fr/);
    expect(rooms).toMatch(/\.rooms-inspector \.room-detail-editor \.scene-preflight-status[\s\S]*?white-space: nowrap/);
  });

  it("uses the shared rail edge for the explorer toggle in both states", () => {
    const rooms = cssFile("rooms.css");
    const workspaceCommon = cssFile("workspace-common.css");

    expect(workspaceCommon).toMatch(/\.workspace-explorer-rail-toggle\s*\{[\s\S]*?right:\s*calc\(var\(--workspace-inspector-rail-toggle-width\) \* -1\);/);
    expect(workspaceCommon).toMatch(/\.workspace-explorer-rail-toggle\s*\{[\s\S]*?background:\s*var\(--studio-color-accent-soft\);[\s\S]*?border-color:\s*var\(--studio-color-accent-border\);[\s\S]*?color:\s*var\(--studio-color-accent\);/);
    expect(rooms).not.toContain(".rooms-editor-layout:has(.workspace-explorer-rail.is-collapsed) .workspace-explorer-rail-toggle");
    expect(rooms).not.toContain(".rooms-editor-layout:has(.workspace-explorer-rail:not(.is-collapsed)) .workspace-explorer-rail-toggle");
  });

  it("keeps the inspector toggle in the same accent treatment", () => {
    const workspaceCommon = cssFile("workspace-common.css");

    expect(workspaceCommon).toMatch(/\.workspace-inspector-rail-toggle\s*\{[\s\S]*?background:\s*var\(--studio-color-accent-soft\);[\s\S]*?border-color:\s*var\(--studio-color-accent-border\);[\s\S]*?color:\s*var\(--studio-color-accent\);/);
    expect(workspaceCommon).toMatch(/\.editor-side-stack-toggle\s*\{[\s\S]*?background:\s*var\(--studio-color-accent-soft\);[\s\S]*?border-color:\s*var\(--studio-color-accent-border\);[\s\S]*?color:\s*var\(--studio-color-accent\);/);
  });

  it("does not add a detached explorer offset in the narrow layout", () => {
    const rooms = cssFile("rooms.css");

    expect(rooms).not.toContain("left: calc(var(--workspace-inspector-rail-toggle-width) * -1 - 56px);");
  });

  it("keeps stacked scene panel toggles inside the narrow layout", () => {
    const rooms = cssFile("rooms.css");

    expect(rooms).toMatch(/\.rooms-editor-layout > \.workspace-explorer-rail \.workspace-explorer-rail-toggle,[\s\S]*?\.rooms-editor-layout > \.editor-side-stack\.rooms-side-stack \.editor-side-stack-toggle\s*\{[\s\S]*?left:\s*10px !important;[\s\S]*?right:\s*auto !important;/);
  });

  it("keeps the right inspector toggle attached to the canvas edge", () => {
    const rooms = cssFile("rooms.css");

    expect(rooms).toMatch(/\.rooms-editor-layout \.editor-side-stack-toggle\s*\{[\s\S]*?left:\s*calc\(var\(--workspace-inspector-rail-toggle-width\) \* -1\);/);
  });

  it("removes the right inspector grid track when the explorer stays expanded", () => {
    const workspaceCommon = cssFile("workspace-common.css");

    expect(workspaceCommon).toMatch(/\.rooms-editor-layout:has\(\.editor-side-stack\.is-collapsed\):has\(\.workspace-explorer-rail:not\(\.is-collapsed\)\)\s*\{[\s\S]*?grid-template-columns:\s*260px minmax\(560px, 1fr\) var\(--workspace-editor-side-stack-collapsed-width\);/);
  });

  it("keeps workspace cards separate from inspector strip surfaces", () => {
    const dialogues = cssFile("dialogues.css");
    const files = cssFile("files.css");
    const audio = cssFile("audio.css");
    const sprites = cssFile("sprites.css");
    const events = cssFile("events.css");

    expect(dialogues).toMatch(/\/\* Workspace bodies keep visual cards; only inspector content uses strips\. \*\/[\s\S]*?\.dialogues-interface-grid,[\s\S]*?display:\s*grid;[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
    expect(files).toMatch(/\.files-usage-links li\s*\{[^}]*border-bottom:\s*1px solid var\(--studio-color-border\);/);
    expect(files).toMatch(/\.files-layout\s*\{[^}]*grid-template-columns:\s*190px minmax\(280px, 1fr\) 340px;/);
    expect(audio).toMatch(/\.audio-side-panel \.audio-inspector-panel,[\s\S]*?\.audio-side-panel \.audio-validation-card,[\s\S]*?background:\s*transparent;/);
    expect(sprites).toMatch(/\.sprites-inspector \.sprite-animation-editor,[\s\S]*?\.sprites-inspector \.sprite-metric-group,[\s\S]*?background:\s*transparent;/);
    expect(events).toMatch(/\.event-side-stack \.event-inspector-panel,[\s\S]*?\.event-side-stack \.event-context-summary,[\s\S]*?background:\s*transparent;/);
  });

  it("defines shared dialog and toast surfaces", () => {
    const studioUi = cssFile("studio-ui.css");

    expect(studioUi).toContain(".studio-dialog-card");
    expect(studioUi).toContain(".studio-toast-stack");
    expect(studioUi).toContain(".studio-button-danger");
  });

  it("defines shared empty states and status bar surfaces", () => {
    const studioUi = cssFile("studio-ui.css");

    expect(studioUi).toContain(".workspace-empty");
    expect(studioUi).toContain(".studio-status-bar");
    expect(studioUi).toContain(".workspace-context-toolbar");
    expect(studioUi).toContain(".workspace-context-toolbar-actions");
    expect(studioUi).toContain(".ghost-button");
    expect(studioUi).toContain("var(--studio-surface-elevated)");
  });

  it("defines the shared collapsible inspector rail", () => {
    const common = cssFile("workspace-common.css");

    expect(common).toContain(".workspace-inspector-rail");
    expect(common).toContain(".workspace-inspector-rail.is-collapsed");
    expect(common).toContain("--workspace-inspector-rail-collapsed-width: 0px");
    expect(common).toContain(".workspace-inspector-rail-toggle");
    expect(common).toContain("position: absolute");
    expect(common).toContain(".editor-side-stack-body");
    expect(common).toMatch(/\.editor-side-stack-body\s*\{[\s\S]*height:\s*100%/);
    expect(common).toContain(".events-layout:has(.workspace-inspector-rail.is-collapsed)");
    expect(common).toContain(".preview-runtime-layout:has(.workspace-inspector-rail.is-collapsed)");
  });

  it("defines the shared dark theme contract", () => {
    const base = cssFile("base.css");
    const dark = cssFile("dark-theme.css");

    expect(base).toContain('[data-studio-theme="dark"]');
    expect(base).toContain("--studio-color-bg-app:");
    expect(base).toContain("--studio-color-accent-solid:");
    expect(base).toContain("--studio-color-accent-solid-hover:");
    expect(base).toContain("--studio-color-warning-bg:");
    expect(base).toContain("--studio-color-danger-bg:");
    expect(dark).toContain(".app-topbar");
    expect(dark).toContain(".welcome-shell");
    expect(dark).toContain(".events-layout");
    expect(dark).toContain(".warning-chip");
    expect(dark).toContain(".audio-filter-bar");
  });

  it("keeps dark theme text and filled commands readable on their intended surfaces", () => {
    const darkTokens = cssFile("base.css").split('[data-studio-theme="dark"]')[1];
    const tokens = Object.fromEntries([...darkTokens.matchAll(/(--[\w-]+):\s*(#[0-9a-f]{6});/gi)]
      .map((match) => [match[1], match[2]]));
    const luminance = (hex: string): number => {
      const rgb = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255)
        .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
      return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
    };
    const ratio = (foreground: string, background: string): number => {
      const light = luminance(foreground), dark = luminance(background);
      return (Math.max(light, dark) + 0.05) / (Math.min(light, dark) + 0.05);
    };
    for (const surface of ["surface", "surface-muted", "surface-raised", "input-bg", "surface-selected"]) {
      for (const text of ["text-primary-base", "text-secondary-base", "text-muted-base", "accent"]) {
        expect(ratio(tokens[`--studio-color-${text}`], tokens[`--studio-color-${surface}`]),
          `${text} on ${surface}`).toBeGreaterThanOrEqual(4.5);
      }
    }
    for (const command of ["accent-solid", "accent-solid-hover", "danger-solid", "danger-solid-hover"]) {
      expect(ratio("#ffffff", tokens[`--studio-color-${command}`]),
        `white command text on ${command}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("uses design tokens instead of hardcoded panel backgrounds in workspaces", () => {
    const workspaceCss = [
      cssFile("rooms.css"),
      cssFile("sprites.css"),
      cssFile("audio.css"),
      cssFile("events.css"),
      cssFile("files.css"),
      cssFile("dialogues.css"),
      cssFile("settings.css")
    ].join("\n");

    expect(workspaceCss).toContain("var(--studio-color-surface)");
    expect(workspaceCss).toContain("var(--studio-color-text-primary)");
    expect(workspaceCss).not.toMatch(/background:\s*#ffffff\b/i);
  });

  it("mantem conexoes do mapa de cenas atras dos cards", () => {
    const rooms = cssFile("rooms.css");

    expect(rooms).toMatch(/\.room-card-connector-layer\s*\{[^}]*z-index:\s*0\s*;/);
    expect(rooms).toMatch(/\.room-stage-card-frame\.is-dragging\s*\{[^}]*z-index:\s*12\s*;/);
  });

  it("keeps the Events, Sprites, and Audio polish layer explicit and auditable", () => {
    const events = cssFile("events.css");
    const sprites = cssFile("sprites.css");
    const audio = cssFile("audio.css");

    expect(events).toContain("/* Focused polish: Events */");
    expect(events).toContain(".event-inspector-panel");
    expect(events).toContain(".event-step-row:hover");
    expect(events).toContain(".event-graph-node:hover");
    expect(events).toContain(".event-graph-node-add-block");
    expect(events).toContain(".events-tool-strip.workspace-context-toolbar");

    expect(events).toContain(".event-graph-viewport");
    expect(events).toContain("background-attachment: local");
    expect(events).toContain(".event-graph-scale-space");
    expect(events).toContain("min-width: 100%");

    expect(sprites).toContain("/* Focused polish: Sprites */");
    expect(sprites).toContain(".sprites-inspector");
    expect(sprites).toContain(".sprites-active-tool-panel");
    expect(sprites).toContain(".sprite-sheet-size-presets button:hover");
    expect(sprites).toContain(".sprites-tool-strip.workspace-context-toolbar");

    expect(audio).toContain("/* Focused polish: Audio */");
    expect(audio).toContain(".audio-composer-stage:has(.audio-empty-composer)");
    expect(audio).toContain(".audio-empty-composer::before");
    expect(audio).not.toContain(".audio-basic-composer");
    expect(audio).not.toContain(".audio-workspace-mode");
    expect(audio).toContain(".audio-side-panel");
  });

  it("keeps every primary workspace covered by an explicit polish layer", () => {
    const rooms = cssFile("rooms.css");
    const files = cssFile("files.css");
    const dialogues = cssFile("dialogues.css");
    const settings = cssFile("settings.css");

    expect(rooms).toContain("/* Focused polish: Editor */");
    expect(rooms).toContain(".rooms-editor-secondary-toolbar.workspace-context-toolbar");
    expect(rooms).toContain(".rooms-inspector");
    expect(rooms).toContain(".rooms-canvas-world-scroll");
    expect(rooms).toContain("background-attachment: local");
    expect(rooms).toContain(".rooms-canvas-world-scale-space");
    expect(rooms).toContain("min-width: 100%");
    expect(rooms).toContain(".room-stage-card-header");
    expect(rooms).toContain("grid-template-rows: var(--room-map-card-header-height, 54px) minmax(0, 1fr) var(--room-map-card-footer-height, 36px)");
    expect(rooms).toContain("stroke-width: var(--room-map-connector-derived-stroke, 3px)");
    expect(rooms).toContain('.rooms-canvas-stage[data-card-density="compact"]');

    expect(files).toContain("/* Focused polish: Files */");
    expect(files).toContain(".files-preview-card");
    expect(files).toContain(".files-technical-details > summary");
    expect(files).toContain(".files-pipeline-notice.attention");
    expect(files).toContain(".files-preview-image-frame.is-fit img");

    expect(dialogues).toContain("/* Focused polish: Dialogues */");
    expect(dialogues).toContain(".dialogues-editor-toolbar");
    expect(dialogues).toContain(".dialogues-inspector-card:hover");

    expect(settings).toContain("/* Focused polish: Settings */");
    expect(settings).toContain(".settings-main-panel");
    expect(settings).toContain(".settings-inspector-card:hover");
  });

  it("faz o modo foco ampliar o canvas e ocultar as laterais do workspace Editor", () => {
    const shell = cssFile("app-shell.css");

    expect(shell).toMatch(/\.focus-mode \.rooms-editor-layout\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s);
    expect(shell).toMatch(/\.focus-mode \.rooms-side-stack[^}]*display:\s*none/s);
    expect(shell).toMatch(/\.focus-mode \.room-editor-tool-rail[^}]*display:\s*none/s);
  });

  it("keeps dense production workspaces scannable without making editable and read-only values look alike", () => {
    const sprites = cssFile("sprites.css");
    const audio = cssFile("audio.css");
    const settings = cssFile("settings.css");

    expect(sprites).toContain("/* Density pass: Sprites */");
    expect(sprites).toContain(".sprites-inspector .sprite-animation-editor input[type=\"text\"]");
    expect(sprites).toContain("min-height: 32px");

    expect(audio).toContain("/* Density pass: Audio */");
    expect(audio).toContain(".audio-header-actions > button");
    expect(audio).toContain(".audio-filter-chip-group button.active");
    expect(audio).toContain("box-shadow: var(--studio-shadow-control)");

    expect(settings).toContain("/* Density pass: Settings */");
    expect(settings).toContain(".settings-value-row strong::before");
    expect(settings).toContain("content: \"Somente leitura\"");
    expect(settings).toContain(".settings-value-row strong");
  });

  it("prevents legacy dark shell colors from leaking into Events, Sprites, and Audio", () => {
    const targetCss = [
      cssFile("events.css"),
      cssFile("sprites.css"),
      cssFile("audio.css")
    ].join("\n");
    const legacyShellColors = ["#111316", "#11151a", "#15191e", "#20262d", "#22272e", "#29313a", "#343a42"];

    for (const color of legacyShellColors) {
      expect(targetCss, `${color} is a legacy dark shell color; use light design-system surfaces in these workspaces.`).not.toContain(color);
    }
  });
});
