export type MenuScreenType = "logo" | "title" | "menu";
export type MenuSceneRole =
  | "logo"
  | "opening"
  | "title"
  | "initial"
  | "new_game"
  | "gender_select"
  | "name_input"
  | "load_game"
  | "menu"
  | "start"
  | "mission_board"
  | "inventory"
  | "map"
  | "profile"
  | "save"
  | "language"
  | "settings"
  | "credits";

/** Ciclo de vida do menu. O runtime nativo continua compartilhado entre os perfis. */
export type MenuSceneProfile = "initial" | "in_game";
export type MenuSceneEntryPolicy = "title" | "gameplay";
export type MenuSceneReturnPolicy = "title" | "resume";
/** Define se o menu é aberto como cena nativa, HUD legado ou ambos. */
export type MenuScenePresentationMode = "scene" | "hud" | "both";

export type MenuSceneItemBindingSource = "variable" | "inventory" | "stat" | "equipped";
export type MenuSceneItemBindingFormat = "number" | "count" | "percent" | "on_off";

export interface MenuSceneItemBinding {
  source: MenuSceneItemBindingSource;
  index: number;
  format: MenuSceneItemBindingFormat;
}

export type MenuSceneItemAction =
  | "select"
  | "open_screen"
  | "push_screen"
  | "pop_screen"
  | "toggle_variable"
  | "adjust_variable";

export interface MenuClickBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MenuSceneItem {
  id: string;
  label: string;
  dialogueKey?: string;
  action: MenuSceneItemAction;
  targetScreenID: string;
  targetItemID?: string;
  eventName: string;
  enabled: boolean;
  variableIndex: number;
  minValue: number;
  maxValue: number;
  step: number;
  checkedValue: number;
  binding?: MenuSceneItemBinding;
  audioChannel?: "music" | "sfx" | "pcm_music" | "pcm_sfx" | "all";
  requiresSave?: boolean;
  saveSlot?: number;
  valueLabels?: string[];
  detailLines?: string[];
  clickBox: MenuClickBox;
}

export interface MenuTextInputConfig {
  variableName: string;
  maxLength: number;
  x: number;
  y: number;
  width: number;
  keyboard?: MenuTextInputKeyboardConfig;
}

export type MenuTextInputKeyboardLayout = "hidden" | "grid";

export interface MenuTextInputKeyboardConfig {
  layout: MenuTextInputKeyboardLayout;
  x: number;
  y: number;
  width: number;
  height: number;
  allowLowercase: boolean;
  surface?: "runtime" | "background";
  controlLayout?: "bottom" | "side" | "bottom_grid";
  controlsX?: number;
  controlsY?: number;
  controlsWidth?: number;
  controlsHeight?: number;
}

export interface MenuBackgroundAnimationConfig {
  frameAssetNames: string[];
  frameDuration: number;
  loop: boolean;
}

export type MenuHudMode = "none";

export interface MenuEmbeddedScreenConfig {
  id: string;
  screenType: MenuScreenType;
  title: string;
  titleOverlayAssetName: string;
  hudMode?: MenuHudMode;
  hudPresetId?: string;
  hudListRows?: number;
  hudTextColor?: number;
  hudTransparentText?: boolean;
  titleTextVariableName?: string;
  backgroundAnimation?: MenuBackgroundAnimationConfig;
  titleFadeFrames: number;
  autoAdvanceFrames: number;
  allowSkip: boolean;
  nextScreenID: string;
  items: MenuSceneItem[];
  carousel?: boolean;
  onEnterEventName: string;
  onBackEventName?: string;
  menuProfile?: MenuSceneProfile;
  entryPolicy?: MenuSceneEntryPolicy;
  returnPolicy?: MenuSceneReturnPolicy;
  suspendsGameplay?: boolean;
  presentationMode?: MenuScenePresentationMode;
}

export interface MenuSceneConfig {
  screenType: MenuScreenType;
  role: MenuSceneRole;
  title: string;
  titleOverlayAssetName: string;
  hudMode?: MenuHudMode;
  hudPresetId?: string;
  hudListRows?: number;
  hudTextColor?: number;
  hudTransparentText?: boolean;
  titleTextVariableName?: string;
  backgroundAnimation?: MenuBackgroundAnimationConfig;
  titleFadeFrames: number;
  autoAdvanceFrames: number;
  allowSkip: boolean;
  nextScreenID: string;
  items: MenuSceneItem[];
  carousel?: boolean;
  textInput?: MenuTextInputConfig;
  screens?: MenuEmbeddedScreenConfig[];
  onBackEventName?: string;
  menuProfile: MenuSceneProfile;
  entryPolicy: MenuSceneEntryPolicy;
  returnPolicy: MenuSceneReturnPolicy;
  suspendsGameplay: boolean;
  presentationMode: MenuScenePresentationMode;
}

export interface MenuSceneEditorPreviewItem extends MenuSceneItem {
  selected: boolean;
}

export type MenuSceneEditorPreviewKeyboardControlID = "backspace" | "case" | "done";

export interface MenuSceneEditorPreviewKeyboardControl {
  id: MenuSceneEditorPreviewKeyboardControlID;
  label: "BACK" | "UPPR" | "DONE" | "DEL" | "Aa" | "OK";
  enabled: boolean;
}

export interface MenuSceneEditorPreviewKeyboard {
  x: number;
  y: number;
  width: number;
  height: number;
  letterRows: string[][];
  controls: MenuSceneEditorPreviewKeyboardControl[];
  controlLayout?: "bottom" | "side" | "bottom_grid";
  controlsX?: number;
  controlsY?: number;
  controlsWidth?: number;
  controlsHeight?: number;
}

export interface MenuSceneEditorPreviewTextInput {
  variableName: string;
  maxLength: number;
  x: number;
  y: number;
  width: number;
  surface: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  slots: string[];
  cursorIndex: number;
  keyboard: MenuSceneEditorPreviewKeyboard | null;
}

export interface MenuSceneEditorPreview {
  screenType: MenuScreenType;
  role: MenuSceneRole;
  menuProfile: MenuSceneProfile;
  title: string;
  selectedItemID: string | null;
  items: MenuSceneEditorPreviewItem[];
  textInput: MenuSceneEditorPreviewTextInput | null;
}

const MENU_SCREEN_WIDTH = 240;
const MENU_SCREEN_HEIGHT = 160;
const MENU_TILE_COLUMNS = MENU_SCREEN_WIDTH / 8;
const MENU_TILE_ROWS = MENU_SCREEN_HEIGHT / 8;
const NAME_INPUT_KEYBOARD_DEFAULT: MenuTextInputKeyboardConfig = {
  layout: "grid",
  x: 4,
  y: 8,
  width: 22,
  height: 6,
  allowLowercase: true
};

export const MENU_TEXT_INPUT_KEYBOARD_GRID: readonly (readonly number[])[] = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [10, 11, 12, 13, 14, 15, 16, 17, 18, 19],
  [20, 21, 22, 23, 24, 25, -1, -1, -1, -1],
  [26, -1, -1, -1, 27, -1, -1, 28, -1, -1]
];

export const MENU_TEXT_INPUT_SIDE_KEYBOARD_GRID: readonly (readonly number[])[] = [
  [0, 1, 2, 3, 4, 5, 6, 7],
  [8, 9, 10, 11, 12, 13, 14, 15],
  [16, 17, 18, 19, 20, 21, 22, 23],
  [24, 25, -1, -1, -1, -1, -1, -1]
];

export const MENU_TEXT_INPUT_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const MENU_ACTIONS = new Set<MenuSceneItemAction>([
  "select",
  "open_screen",
  "push_screen",
  "pop_screen",
  "toggle_variable",
  "adjust_variable"
]);

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function integer(value: unknown, fallback: number, minimum: number, maximum: number): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.round(number)));
}

function screenType(value: unknown): MenuScreenType {
  return value === "logo" || value === "menu" ? value : "title";
}

function defaultMenuSceneRole(kind: MenuScreenType): MenuSceneRole {
  return kind;
}

function defaultMenuSceneProfile(role: MenuSceneRole): MenuSceneProfile {
  return role === "start" || role === "mission_board" || role === "inventory" || role === "map"
    || role === "profile" || role === "save"
    ? "in_game"
    : "initial";
}

function menuSceneProfile(value: unknown, fallback: MenuSceneProfile): MenuSceneProfile {
  return value === "in_game" ? "in_game" : value === "initial" ? "initial" : fallback;
}

function lifecycleForMenuProfile(profile: MenuSceneProfile): Pick<MenuSceneConfig, "entryPolicy" | "returnPolicy" | "suspendsGameplay"> {
  return profile === "in_game"
    ? { entryPolicy: "gameplay", returnPolicy: "resume", suspendsGameplay: true }
    : { entryPolicy: "title", returnPolicy: "title", suspendsGameplay: false };
}

function presentationModeForMenuProfile(profile: MenuSceneProfile): MenuScenePresentationMode {
  return profile === "in_game" ? "scene" : "scene";
}

function menuScenePresentationMode(value: unknown, fallback: MenuScenePresentationMode): MenuScenePresentationMode {
  return value === "hud" || value === "both" || value === "scene" ? value : fallback;
}

function menuSceneRole(value: unknown, fallback: MenuSceneRole): MenuSceneRole {
  return value === "logo" || value === "opening" || value === "title" || value === "initial" || value === "menu" || value === "start"
    || value === "new_game" || value === "gender_select" || value === "name_input" || value === "load_game"
    || value === "mission_board" || value === "inventory" || value === "map" || value === "profile"
    || value === "save" || value === "language" || value === "settings" || value === "credits"
    ? value
    : fallback;
}

function defaultClickBox(index: number): MenuClickBox {
  return {
    x: 64,
    y: Math.min(140, 88 + index * 24),
    width: 112,
    height: 20
  };
}

function normalizeClickBox(value: unknown, index: number): MenuClickBox {
  const source = record(value);
  const fallback = defaultClickBox(index);
  const x = integer(source.x, fallback.x, 0, MENU_SCREEN_WIDTH - 1);
  const y = integer(source.y, fallback.y, 0, MENU_SCREEN_HEIGHT - 1);
  return {
    x,
    y,
    width: integer(source.width, fallback.width, 1, MENU_SCREEN_WIDTH - x),
    height: integer(source.height, fallback.height, 1, MENU_SCREEN_HEIGHT - y)
  };
}

function normalizeMenuItemBinding(value: unknown): MenuSceneItemBinding | undefined {
  const source = record(value);
  const bindingSource = source.source;
  if (bindingSource !== "variable" && bindingSource !== "inventory" && bindingSource !== "stat" && bindingSource !== "equipped") {
    return undefined;
  }
  const format = source.format === "count" || source.format === "percent" || source.format === "on_off"
    ? source.format
    : "number";
  const limits = bindingSource === "variable"
    ? { minimum: 0, maximum: 63 }
    : bindingSource === "inventory"
      ? { minimum: 0, maximum: 15 }
      : { minimum: 0, maximum: 7 };
  const index = integer(source.index, -1, -1, limits.maximum);
  return index < limits.minimum ? undefined : { source: bindingSource, index, format };
}

function normalizeMenuItem(value: unknown, index: number): MenuSceneItem {
  const source = record(value);
  const dialogueKey = stringValue(source.dialogueKey);
  const rawMinimum = integer(source.minValue, 0, -32768, 32767);
  const rawMaximum = integer(source.maxValue, 1, -32768, 32767);
  const minValue = Math.min(rawMinimum, rawMaximum);
  const maxValue = Math.max(rawMinimum, rawMaximum);
  const action = MENU_ACTIONS.has(source.action as MenuSceneItemAction)
    ? source.action as MenuSceneItemAction
    : "select";
  const fallbackID = `item-${index + 1}`;
  const binding = normalizeMenuItemBinding(source.binding);
  return {
    id: stringValue(source.id, fallbackID) || fallbackID,
    label: stringValue(source.label, `Opção ${index + 1}`) || `Opção ${index + 1}`,
    ...(dialogueKey ? { dialogueKey } : {}),
    action,
    targetScreenID: stringValue(source.targetScreenID),
    ...((action === "open_screen" || action === "push_screen") && stringValue(source.targetItemID)
      ? { targetItemID: stringValue(source.targetItemID) }
      : {}),
    eventName: stringValue(source.eventName),
    enabled: typeof source.enabled === "boolean" ? source.enabled : true,
    variableIndex: integer(source.variableIndex, -1, -1, 63),
    minValue,
    maxValue,
    step: integer(source.step, 1, 1, 32767),
    checkedValue: integer(source.checkedValue, maxValue, minValue, maxValue),
    ...(binding ? { binding } : {}),
    ...(source.audioChannel === "music" || source.audioChannel === "sfx" || source.audioChannel === "pcm_music" || source.audioChannel === "pcm_sfx" || source.audioChannel === "all"
      ? { audioChannel: source.audioChannel }
      : {}),
    ...(typeof source.requiresSave === "boolean" ? { requiresSave: source.requiresSave } : {}),
    ...(Number.isInteger(source.saveSlot) && Number(source.saveSlot) >= 0 && Number(source.saveSlot) < 8
      ? { saveSlot: Number(source.saveSlot) } : {}),
    ...(Array.isArray(source.valueLabels) ? { valueLabels: source.valueLabels.slice(0, 16).map((value) => stringValue(value).slice(0, 20)) } : {}),
    ...(Array.isArray(source.detailLines) ? { detailLines: source.detailLines.slice(0, 3).map(value => stringValue(value).slice(0, 24)) } : {}),
    clickBox: normalizeClickBox(source.clickBox, index)
  };
}

function normalizeTextInput(value: unknown, defaultKeyboard = false): MenuTextInputConfig | undefined {
  const source = record(value);
  const variableName = stringValue(source.variableName);
  if (!variableName) return undefined;
  const keyboardSource = record(source.keyboard);
  const hasKeyboard = Object.prototype.hasOwnProperty.call(source, "keyboard");
  const keyboardLayout = keyboardSource.layout === "grid" ? "grid" : "hidden";
  const bottomGrid = keyboardSource.controlLayout === "bottom_grid" || keyboardSource.control_layout === "bottom_grid";
  const minimumWidth = bottomGrid ? 16 : 22;
  const minimumHeight = bottomGrid ? 10 : 6;
  const keyboard = keyboardLayout === "grid"
    ? {
        layout: "grid" as const,
        x: integer(keyboardSource.x, NAME_INPUT_KEYBOARD_DEFAULT.x, 0, MENU_TILE_COLUMNS - minimumWidth),
        y: integer(keyboardSource.y, NAME_INPUT_KEYBOARD_DEFAULT.y, 0, MENU_TILE_ROWS - minimumHeight),
        width: integer(keyboardSource.width, NAME_INPUT_KEYBOARD_DEFAULT.width, minimumWidth, MENU_TILE_COLUMNS - integer(keyboardSource.x, NAME_INPUT_KEYBOARD_DEFAULT.x, 0, MENU_TILE_COLUMNS - minimumWidth)),
        height: integer(keyboardSource.height, NAME_INPUT_KEYBOARD_DEFAULT.height, minimumHeight, MENU_TILE_ROWS - integer(keyboardSource.y, NAME_INPUT_KEYBOARD_DEFAULT.y, 0, MENU_TILE_ROWS - minimumHeight)),
        ...(bottomGrid ? { controlLayout: "bottom_grid" as const } : {}),
        allowLowercase: typeof keyboardSource.allowLowercase === "boolean"
          ? keyboardSource.allowLowercase
          : true,
        ...(keyboardSource.surface === "background" || keyboardSource.keyboard_surface === "background" ? {
          surface: "background" as const
        } : {}),
        ...(keyboardSource.controlLayout === "side" || keyboardSource.control_layout === "side" ? {
          controlLayout: "side" as const,
          controlsX: integer(keyboardSource.controlsX ?? keyboardSource.controls_x, 26, 0, MENU_TILE_COLUMNS - 5),
          controlsY: integer(keyboardSource.controlsY ?? keyboardSource.controls_y, integer(keyboardSource.y, NAME_INPUT_KEYBOARD_DEFAULT.y, 0, MENU_TILE_ROWS - 6), 0, MENU_TILE_ROWS - 6),
          controlsWidth: integer(keyboardSource.controlsWidth ?? keyboardSource.controls_width, 6, 5, MENU_TILE_COLUMNS),
          controlsHeight: integer(keyboardSource.controlsHeight ?? keyboardSource.controls_height, 6, 6, MENU_TILE_ROWS)
        } : {})
      }
    : defaultKeyboard && !hasKeyboard
      ? { ...NAME_INPUT_KEYBOARD_DEFAULT }
      : hasKeyboard
        ? {
            layout: "hidden" as const,
            x: 0,
            y: 0,
            width: 0,
            height: 0,
            allowLowercase: false
          }
        : undefined;
  return {
    variableName,
    maxLength: integer(source.maxLength, 8, 1, 16),
    x: integer(source.x, 0, 0, MENU_TILE_COLUMNS - 1),
    y: integer(source.y, 0, 0, MENU_TILE_ROWS - 1),
    width: integer(source.width, 8, 1, MENU_TILE_COLUMNS),
    ...(keyboard ? { keyboard } : {})
  };
}

function normalizeBackgroundAnimation(value: unknown): MenuBackgroundAnimationConfig | undefined {
  const source = record(value);
  const frameAssetNames = Array.from(new Set(
    (Array.isArray(source.frameAssetNames) ? source.frameAssetNames : [])
      .map((entry) => stringValue(entry))
      .filter(Boolean)
  )).slice(0, 8);
  if (frameAssetNames.length < 2) return undefined;
  return {
    frameAssetNames,
    frameDuration: integer(source.frameDuration, 18, 1, 3600),
    loop: typeof source.loop === "boolean" ? source.loop : true
  };
}

function normalizeEmbeddedScreens(value: unknown, parentProfile: MenuSceneProfile): MenuEmbeddedScreenConfig[] {
  if (!Array.isArray(value)) return [];
  const seenIDs = new Set<string>();
  const screens: MenuEmbeddedScreenConfig[] = [];
  for (const entry of value.slice(0, 16)) {
    const source = record(entry);
    const id = stringValue(source.id);
    if (!id || seenIDs.has(id)) continue;
    seenIDs.add(id);
    const kind = screenType(source.screenType);
    const defaults = defaultMenuSceneConfig(kind);
    const rawItems = Array.isArray(source.items) ? source.items : defaults.items;
    const hudMode = source.hudMode === "none" ? "none" as const : undefined;
    const hudPresetId = stringValue(source.hudPresetId);
    const onBackEventName = stringValue(source.onBackEventName);
    const backgroundAnimation = normalizeBackgroundAnimation(source.backgroundAnimation);
    const screenProfile = menuSceneProfile(source.menuProfile, parentProfile);
    const lifecycle = lifecycleForMenuProfile(screenProfile);
    const presentationMode = menuScenePresentationMode(source.presentationMode, presentationModeForMenuProfile(screenProfile));
    screens.push({
      id,
      screenType: kind,
      title: stringValue(source.title, defaults.title),
      titleOverlayAssetName: stringValue(source.titleOverlayAssetName),
      ...(hudMode ? { hudMode } : {}),
      ...(source.hudTransparentText === true ? {hudTransparentText:true} : {}),
      ...(Number.isInteger(source.hudTextColor) ? { hudTextColor: integer(source.hudTextColor, 32767, 0, 32767) } : {}),
      ...(Number(source.hudListRows) > 0 ? { hudListRows: integer(source.hudListRows, 4, 1, 6) } : {}),
      ...(stringValue(source.titleTextVariableName) ? { titleTextVariableName: stringValue(source.titleTextVariableName) } : {}),
      ...(hudMode === "none" ? {} : hudPresetId ? { hudPresetId } : {}),
      ...(backgroundAnimation ? { backgroundAnimation } : {}),
      titleFadeFrames: integer(source.titleFadeFrames, 0, 0, 3600),
      autoAdvanceFrames: integer(source.autoAdvanceFrames, defaults.autoAdvanceFrames, 0, 3600),
      allowSkip: typeof source.allowSkip === "boolean" ? source.allowSkip : defaults.allowSkip,
      nextScreenID: stringValue(source.nextScreenID),
      items: rawItems.slice(0, 32).map(normalizeMenuItem),
      ...(source.carousel === true ? { carousel: true } : {}),
      onEnterEventName: stringValue(source.onEnterEventName),
      menuProfile: screenProfile,
      entryPolicy: source.entryPolicy === "gameplay" ? "gameplay" : source.entryPolicy === "title" ? "title" : lifecycle.entryPolicy,
      returnPolicy: source.returnPolicy === "resume" || source.returnPolicy === "title"
        ? source.returnPolicy
        : lifecycle.returnPolicy,
      suspendsGameplay: typeof source.suspendsGameplay === "boolean" ? source.suspendsGameplay : lifecycle.suspendsGameplay,
      presentationMode,
      ...(onBackEventName ? { onBackEventName } : {})
    });
  }
  return screens;
}

export function defaultMenuSceneConfig(
  kind: MenuScreenType = "title",
  role: MenuSceneRole = defaultMenuSceneRole(kind)
): MenuSceneConfig {
  const menuProfile = defaultMenuSceneProfile(role);
  const lifecycle = lifecycleForMenuProfile(menuProfile);
  if (kind === "logo") {
    return {
      screenType: "logo",
      role,
      title: "Logo",
      titleOverlayAssetName: "",
      titleFadeFrames: 0,
      autoAdvanceFrames: 150,
      allowSkip: true,
      nextScreenID: "",
      items: [],
      menuProfile,
      presentationMode: presentationModeForMenuProfile(menuProfile),
      ...lifecycle
    };
  }
  const items = role === "start"
    ? [
        { id: "missions", label: "Missões", clickBox: { x: 64, y: 48, width: 120, height: 18 } },
        { id: "inventory", label: "Inventário", clickBox: { x: 64, y: 68, width: 120, height: 18 } },
        { id: "map", label: "Mapa", clickBox: { x: 64, y: 88, width: 120, height: 18 } },
        { id: "profile", label: "Perfil/equipe", clickBox: { x: 64, y: 108, width: 120, height: 18 } },
        { id: "save", label: "Salvar", clickBox: { x: 64, y: 128, width: 120, height: 18 } },
        { id: "back", label: "Voltar", clickBox: { x: 64, y: 148, width: 120, height: 12 } }
      ].map((item, index) => normalizeMenuItem(item, index))
    : [normalizeMenuItem({
        id: kind === "title" ? "start" : "item-1",
        label: kind === "title" ? "Press Start" : "Iniciar",
        clickBox: kind === "title"
          ? { x: 72, y: 112, width: 96, height: 24 }
          : defaultClickBox(0)
      }, 0)];
  return {
    screenType: kind,
    role,
    title: kind === "title" ? "Title Screen" : "Menu",
    titleOverlayAssetName: "",
    titleFadeFrames: 0,
    autoAdvanceFrames: 0,
    allowSkip: true,
    nextScreenID: "",
    items,
    menuProfile,
    presentationMode: presentationModeForMenuProfile(menuProfile),
    ...lifecycle
  };
}

export function normalizeMenuSceneConfig(value: unknown): MenuSceneConfig {
  const source = record(value);
  const kind = screenType(source.screenType);
  const role = menuSceneRole(source.role, defaultMenuSceneRole(kind));
  const profile = menuSceneProfile(source.menuProfile, defaultMenuSceneProfile(role));
  const lifecycle = lifecycleForMenuProfile(profile);
  const defaults = defaultMenuSceneConfig(kind, role);
  const presentationMode = menuScenePresentationMode(source.presentationMode, defaults.presentationMode);
  const rawItems = Array.isArray(source.items) ? source.items : defaults.items;
  const hudMode = source.hudMode === "none" ? "none" as const : undefined;
  const hudPresetId = stringValue(source.hudPresetId);
  const backgroundAnimation = normalizeBackgroundAnimation(source.backgroundAnimation);
  const config: MenuSceneConfig = {
    screenType: kind,
    role,
    title: stringValue(source.title, defaults.title),
    titleOverlayAssetName: stringValue(source.titleOverlayAssetName),
    ...(hudMode ? { hudMode } : {}),
      ...(source.hudTransparentText === true ? {hudTransparentText:true} : {}),
      ...(Number.isInteger(source.hudTextColor) ? { hudTextColor: integer(source.hudTextColor, 32767, 0, 32767) } : {}),
      ...(Number(source.hudListRows) > 0 ? { hudListRows: integer(source.hudListRows, 4, 1, 6) } : {}),
      ...(stringValue(source.titleTextVariableName) ? { titleTextVariableName: stringValue(source.titleTextVariableName) } : {}),
    ...(hudMode === "none" ? {} : hudPresetId ? { hudPresetId } : {}),
    ...(backgroundAnimation ? { backgroundAnimation } : {}),
    titleFadeFrames: integer(source.titleFadeFrames, defaults.titleFadeFrames, 0, 3600),
    autoAdvanceFrames: integer(source.autoAdvanceFrames, defaults.autoAdvanceFrames, 0, 3600),
    allowSkip: typeof source.allowSkip === "boolean" ? source.allowSkip : defaults.allowSkip,
    nextScreenID: stringValue(source.nextScreenID),
    items: rawItems.slice(0, 32).map(normalizeMenuItem),
    ...(source.carousel === true ? { carousel: true } : {}),
    menuProfile: profile,
    presentationMode,
    entryPolicy: source.entryPolicy === "gameplay" ? "gameplay" : source.entryPolicy === "title" ? "title" : lifecycle.entryPolicy,
    returnPolicy: source.returnPolicy === "resume" ? "resume" : source.returnPolicy === "title" ? "title" : lifecycle.returnPolicy,
    suspendsGameplay: typeof source.suspendsGameplay === "boolean" ? source.suspendsGameplay : lifecycle.suspendsGameplay
  };
  const textInput = normalizeTextInput(source.textInput, role === "name_input");
  if (textInput) config.textInput = textInput;
  const onBackEventName = stringValue(source.onBackEventName);
  if (onBackEventName) config.onBackEventName = onBackEventName;
  const screens = normalizeEmbeddedScreens(source.screens, profile);
  if (screens.length > 0) config.screens = screens;
  return config;
}

function editorPreviewKeyboard(
  keyboard: MenuTextInputKeyboardConfig | undefined
): MenuSceneEditorPreviewKeyboard | null {
  if (!keyboard || keyboard.layout !== "grid") return null;
  const sideControls = keyboard.controlLayout === "side";
  const bottomGrid = keyboard.controlLayout === "bottom_grid";
  const sourceGrid = sideControls || bottomGrid ? MENU_TEXT_INPUT_SIDE_KEYBOARD_GRID : MENU_TEXT_INPUT_KEYBOARD_GRID;
  const rowCount = sideControls || bottomGrid ? 4 : 3;
  const columnCount = sideControls || bottomGrid ? 8 : 10;
  return {
    x: keyboard.x,
    y: keyboard.y,
    width: keyboard.width,
    height: keyboard.height,
    ...(bottomGrid ? { controlLayout: "bottom_grid" as const } : {}),
    letterRows: Array.from({ length: rowCount }, (_value, rowIndex) => Array.from({ length: columnCount }, (_columnValue, columnIndex) => {
      const keyboardIndex = sourceGrid[rowIndex]?.[columnIndex] ?? -1;
      return keyboardIndex >= 0 && keyboardIndex < MENU_TEXT_INPUT_ALPHABET.length
        ? MENU_TEXT_INPUT_ALPHABET[keyboardIndex] ?? ""
        : "";
    })),
    controls: [
      { id: "backspace", label: bottomGrid ? "DEL" : "BACK", enabled: true },
      { id: "case", label: bottomGrid ? "Aa" : "UPPR", enabled: keyboard.allowLowercase },
      { id: "done", label: bottomGrid ? "OK" : "DONE", enabled: true }
    ],
    ...(sideControls ? {
      controlLayout: "side" as const,
      controlsX: keyboard.controlsX,
      controlsY: keyboard.controlsY,
      controlsWidth: keyboard.controlsWidth,
      controlsHeight: keyboard.controlsHeight
    } : {})
  };
}

export function deriveMenuSceneEditorPreview(value: unknown): MenuSceneEditorPreview {
  const config = normalizeMenuSceneConfig(value);
  const selectedItemID = config.items[0]?.id ?? null;
  const items = config.items.map((item, index) => ({
    ...item,
    selected: index === 0
  }));
  const textInput = config.textInput
    ? {
        variableName: config.textInput.variableName,
        maxLength: config.textInput.maxLength,
        x: config.textInput.x,
        y: config.textInput.y,
        width: config.textInput.width,
        surface: {
          x: Math.max(0, config.textInput.x - 2),
          y: Math.max(0, config.textInput.y - 2),
          width: Math.min(MENU_TILE_COLUMNS - Math.max(0, config.textInput.x - 2), config.textInput.width + 4),
          height: 4
        },
        slots: Array.from({ length: config.textInput.maxLength }, () => "_"),
        cursorIndex: 0,
        keyboard: editorPreviewKeyboard(config.textInput.keyboard)
      }
    : null;
  return {
    screenType: config.screenType,
    role: config.role,
    menuProfile: config.menuProfile,
    title: config.title,
    selectedItemID,
    items,
    textInput
  };
}

export function addMenuSceneItem(config: MenuSceneConfig, item: Partial<MenuSceneItem> = {}): MenuSceneConfig {
  const existingIDs = new Set(config.items.map((entry) => entry.id));
  const requestedID = stringValue(item.id);
  let id = requestedID || `item-${config.items.length + 1}`;
  let suffix = 2;
  while (existingIDs.has(id)) {
    id = `${requestedID || "item"}-${suffix}`;
    suffix += 1;
  }
  return normalizeMenuSceneConfig({
    ...config,
    items: [...config.items, { ...item, id }]
  });
}

export function updateMenuSceneItem(
  config: MenuSceneConfig,
  itemID: string,
  changes: Partial<MenuSceneItem>
): MenuSceneConfig {
  return normalizeMenuSceneConfig({
    ...config,
    items: config.items.map((item) => item.id === itemID ? { ...item, ...changes } : item)
  });
}

export function moveMenuSceneItem(config: MenuSceneConfig, itemID: string, offset: number): MenuSceneConfig {
  const from = config.items.findIndex((item) => item.id === itemID);
  if (from < 0 || offset === 0) return normalizeMenuSceneConfig(config);
  const to = Math.min(config.items.length - 1, Math.max(0, from + Math.sign(offset)));
  if (from === to) return normalizeMenuSceneConfig(config);
  const items = [...config.items];
  const [item] = items.splice(from, 1);
  items.splice(to, 0, item);
  return normalizeMenuSceneConfig({ ...config, items });
}

export function removeMenuSceneItem(config: MenuSceneConfig, itemID: string): MenuSceneConfig {
  return normalizeMenuSceneConfig({
    ...config,
    items: config.items.filter((item) => item.id !== itemID)
  });
}

export function menuSceneItemAtPoint(config: MenuSceneConfig, x: number, y: number): MenuSceneItem | null {
  return config.items.find((item) => item.enabled
    && x >= item.clickBox.x
    && y >= item.clickBox.y
    && x < item.clickBox.x + item.clickBox.width
    && y < item.clickBox.y + item.clickBox.height) ?? null;
}
