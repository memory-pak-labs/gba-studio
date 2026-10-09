import type {
  ControlledEntityAnchor,
  ControlledEntityContract,
  ControlledEntityDirection,
  ControlledEntityDirectionModel,
  ControlledEntityRole,
  ControlledEntitySceneType,
  ControlledEntitySize,
  ControlledEntityTechnicalState
} from "./types.js";

export type ControlledEntitySpritePackDirection = ControlledEntityDirection | "none";

export interface ControlledEntityAssetGenerationAnimation {
  name: string;
  technicalState: ControlledEntityTechnicalState;
  required: boolean;
  frameCount: number;
  allowedFrames: readonly [number, number];
  fps: number;
  loop: boolean;
  directions: ControlledEntitySpritePackDirection[];
}

export interface ControlledEntityAssetGenerationBrief {
  sceneType: ControlledEntitySceneType;
  role: Exclude<ControlledEntityRole, "none">;
  required: true;
  visualCanvas: ControlledEntitySize;
  collision: ControlledEntitySize | "none";
  anchor: ControlledEntityAnchor;
  directionModel: ControlledEntityDirectionModel;
  directions: ControlledEntitySpritePackDirection[];
  mirroring: Partial<Record<ControlledEntityDirection, ControlledEntityDirection>>;
  animations: ControlledEntityAssetGenerationAnimation[];
  gbaAssetPreset: string;
  generationGuidance: string[];
}

export interface ControlledEntitySpritePackManifestInput {
  name: string;
  source: string;
  sourceAnimationMode?: "single-frame" | "strip";
}

export interface ControlledEntitySpritePackAnimation {
  name: string;
  state: ControlledEntityTechnicalState;
  direction: ControlledEntitySpritePackDirection;
  fps: number;
  loops: boolean;
  frames: number[];
}

export interface ControlledEntitySpritePackManifest {
  schemaVersion: 2;
  name: string;
  source: string;
  preset: string;
  layout: {
    mode: "horizontal";
    rows: 1;
    columns?: 1;
  };
  animations: ControlledEntitySpritePackAnimation[];
}

function generatedDirections(contract: ControlledEntityContract): ControlledEntitySpritePackDirection[] {
  const directions = contract.directionModel?.generated ?? [];
  return directions.length > 0 ? [...directions] : ["none"];
}

function generationGuidance(
  contract: ControlledEntityContract,
  directions: ControlledEntitySpritePackDirection[]
): string[] {
  const canvas = contract.visualCanvas!;
  return [
    `Render the ${contract.role} inside a ${canvas.width}x${canvas.height}px visual canvas.`,
    `Keep the ${contract.anchor} anchor consistent across every frame.`,
    `Generate only these raster directions: ${directions.join(", ")}.`,
    `Prepare the output with the ${contract.gbaAssetPreset} preset in gba-sprite-prep.`
  ];
}

export function buildControlledEntityAssetGenerationBrief(
  contract: ControlledEntityContract
): ControlledEntityAssetGenerationBrief | null {
  if (
    !contract.required ||
    contract.role === "none" ||
    !contract.visualCanvas ||
    contract.collision === undefined ||
    !contract.anchor ||
    !contract.directionModel ||
    !contract.animations ||
    !contract.gbaAssetPreset
  ) {
    return null;
  }

  const directions = generatedDirections(contract);
  return {
    sceneType: contract.sceneType,
    role: contract.role,
    required: true,
    visualCanvas: { ...contract.visualCanvas },
    collision: contract.collision === "none" ? "none" : { ...contract.collision },
    anchor: contract.anchor,
    directionModel: {
      ...contract.directionModel,
      ...(contract.directionModel.generated ? { generated: [...contract.directionModel.generated] } : {}),
      ...(contract.directionModel.mirrored ? { mirrored: { ...contract.directionModel.mirrored } } : {})
    },
    directions,
    mirroring: { ...contract.directionModel.mirrored },
    animations: Object.entries(contract.animations).map(([name, animation]) => ({
      name,
      technicalState: animation.technicalState,
      required: animation.required,
      frameCount: animation.defaultFrames,
      allowedFrames: animation.allowedFrames,
      fps: animation.fps,
      loop: animation.loop,
      directions: animation.direction ? [animation.direction] : [...directions]
    })),
    gbaAssetPreset: contract.gbaAssetPreset,
    generationGuidance: generationGuidance(contract, directions)
  };
}

export function buildControlledEntitySpritePackManifest(
  brief: ControlledEntityAssetGenerationBrief,
  input: ControlledEntitySpritePackManifestInput
): ControlledEntitySpritePackManifest {
  const name = input.name.trim();
  const source = input.source.trim();
  if (!name || !source) {
    throw new Error("controlled entity sprite-pack manifests require a name and source");
  }

  const reusesSingleSourceFrame = input.sourceAnimationMode === "single-frame";
  let nextFrame = 0;
  const animations = brief.animations.flatMap((animation) => animation.directions.map((direction) => {
    const frames = reusesSingleSourceFrame
      ? Array.from({ length: animation.frameCount }, () => 0)
      : Array.from({ length: animation.frameCount }, () => nextFrame++);
    return {
      name: direction === "none" ? animation.name : `${animation.name}_${direction}`,
      state: animation.technicalState,
      direction,
      fps: animation.fps,
      loops: animation.loop,
      frames
    };
  }));

  return {
    schemaVersion: 2,
    name,
    source,
    preset: brief.gbaAssetPreset,
    layout: { mode: "horizontal", rows: 1, ...(reusesSingleSourceFrame ? { columns: 1 } : {}) },
    animations
  };
}
