export type ControlledEntityRole = "character" | "ship" | "vehicle" | "cursor" | "marker" | "fighter" | "none";

export type ControlledEntitySceneType = "topdown" | "platformer" | "isometric" | "dungeonCrawler" | "racing" | "shmup" | "pointAndClick" | "worldMap" | "battleRpg" | "visualNovel" | "cutscene" | "menu" | "luta" | "custom";

export type ControlledEntityActivation = "automatic" | "navigable" | "explicit-override";

export type ControlledEntityAnchor = "bottom-center" | "center" | "hotspot";

export type ControlledEntityDirection = "down" | "up" | "left" | "right" | "down-left" | "down-right" | "up-left" | "up-right";

export type ControlledEntityDirectionMode = "cardinal-4" | "horizontal" | "diagonal-4" | "heading-4" | "scene-dependent" | "pointer" | "none-or-cardinal-4" | "horizontal-facing";

export type ControlledEntityTechnicalState = "idle" | "walk" | "jump" | "fall" | "attack" | "hurt";

export interface ControlledEntitySize {
  width: number;
  height: number;
}

export interface ControlledEntityAnimation {
  technicalState: ControlledEntityTechnicalState;
  required: boolean;
  defaultFrames: number;
  allowedFrames: readonly [number, number];
  fps: number;
  loop: boolean;
  direction?: ControlledEntityDirection | "none";
}

export interface ControlledEntityDirectionModel {
  mode: ControlledEntityDirectionMode;
  generated?: readonly ControlledEntityDirection[];
  mirrored?: Partial<Record<ControlledEntityDirection, ControlledEntityDirection>>;
}

export interface ControlledEntityContract {
  sceneType: ControlledEntitySceneType;
  required: boolean;
  role: ControlledEntityRole;
  activation?: ControlledEntityActivation;
  visualCanvas?: ControlledEntitySize;
  compactVariant?: ControlledEntitySize;
  vehicleVariant?: ControlledEntitySize;
  collision?: ControlledEntitySize | "none";
  anchor?: ControlledEntityAnchor;
  directionModel?: ControlledEntityDirectionModel;
  animations?: Record<string, ControlledEntityAnimation>;
  gbaAssetPreset?: string;
}

export type ControlledEntityContractOverride = Partial<Omit<ControlledEntityContract, "sceneType">>;
