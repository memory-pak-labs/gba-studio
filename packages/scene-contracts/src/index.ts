import { battleRpgControlledEntityContract } from "./contracts/battleRpg.js";
import { customControlledEntityContract } from "./contracts/custom.js";
import { cutsceneControlledEntityContract } from "./contracts/cutscene.js";
import { dungeonCrawlerControlledEntityContract } from "./contracts/dungeonCrawler.js";
import { isometricControlledEntityContract } from "./contracts/isometric.js";
import { lutaControlledEntityContract } from "./contracts/luta.js";
import { menuControlledEntityContract } from "./contracts/menu.js";
import { platformerControlledEntityContract } from "./contracts/platformer.js";
import { pointAndClickControlledEntityContract } from "./contracts/pointAndClick.js";
import { racingControlledEntityContract } from "./contracts/racing.js";
import { shmupControlledEntityContract } from "./contracts/shmup.js";
import { topdownControlledEntityContract } from "./contracts/topdown.js";
import { visualNovelControlledEntityContract } from "./contracts/visualNovel.js";
import { worldMapControlledEntityContract } from "./contracts/worldMap.js";
export * from "./assetGeneration.js";
import type {
  ControlledEntityContract,
  ControlledEntityContractOverride,
  ControlledEntitySceneType
} from "./types.js";

export * from "./types.js";

export const controlledEntityContracts: Record<ControlledEntitySceneType, ControlledEntityContract> = {
  topdown: topdownControlledEntityContract,
  platformer: platformerControlledEntityContract,
  isometric: isometricControlledEntityContract,
  dungeonCrawler: dungeonCrawlerControlledEntityContract,
  racing: racingControlledEntityContract,
  shmup: shmupControlledEntityContract,
  pointAndClick: pointAndClickControlledEntityContract,
  worldMap: worldMapControlledEntityContract,
  battleRpg: battleRpgControlledEntityContract,
  visualNovel: visualNovelControlledEntityContract,
  cutscene: cutsceneControlledEntityContract,
  menu: menuControlledEntityContract,
  luta: lutaControlledEntityContract,
  custom: customControlledEntityContract
};

export interface ResolveControlledEntityContractOptions {
  worldMapNavigable?: boolean;
  customOverride?: ControlledEntityContractOverride;
  requestControlledEntity?: boolean;
}

export function resolveControlledEntityContract(
  sceneType: ControlledEntitySceneType,
  options: ResolveControlledEntityContractOptions = {}
): ControlledEntityContract {
  const contract = controlledEntityContracts[sceneType];

  if (sceneType === "worldMap" && options.worldMapNavigable) {
    return { ...contract, required: true };
  }

  if (sceneType === "custom" && options.customOverride) {
    return { ...contract, ...options.customOverride, sceneType: "custom" };
  }

  return contract;
}

export type ControlledEntityRequiredField = "required" | "role" | "visualCanvas" | "collision" | "anchor" | "directionModel" | "animations" | "gbaAssetPreset";

export type ControlledEntityGenerationResolution =
  | { status: "READY" | "NOT_REQUIRED"; contract: ControlledEntityContract }
  | { status: "NEEDS_CONTRACT_OVERRIDE"; missingFields: ControlledEntityRequiredField[] };

export type ControlledEntityContractIssueCode = "REQUIRED_ENTITY_FIELD_MISSING" | "INVALID_ALLOWED_FRAMES" | "INVALID_FPS" | "INVALID_TECHNICAL_STATE" | "MIRROR_SOURCE_NOT_GENERATED";

export interface ControlledEntityContractIssue {
  sceneType: string;
  field: string;
  code: ControlledEntityContractIssueCode;
}

const technicalStates = new Set(["idle", "walk", "jump", "fall", "attack", "hurt"]);

export function validateControlledEntityContracts(
  contracts: Record<string, ControlledEntityContract> = controlledEntityContracts
): ControlledEntityContractIssue[] {
  const issues: ControlledEntityContractIssue[] = [];

  for (const contract of Object.values(contracts)) {
    if (contract.required) {
      const requiredFields: Array<[ControlledEntityRequiredField, boolean]> = [
        ["role", contract.role !== "none"],
        ["visualCanvas", contract.visualCanvas !== undefined],
        ["collision", contract.collision !== undefined],
        ["anchor", contract.anchor !== undefined],
        ["directionModel", contract.directionModel !== undefined],
        ["animations", contract.animations !== undefined && Object.keys(contract.animations).length > 0],
        ["gbaAssetPreset", contract.gbaAssetPreset !== undefined]
      ];

      for (const [field, present] of requiredFields) {
        if (!present) {
          issues.push({ sceneType: contract.sceneType, field, code: "REQUIRED_ENTITY_FIELD_MISSING" });
        }
      }
    }

    for (const [name, animation] of Object.entries(contract.animations ?? {})) {
      if (animation.allowedFrames[0] > animation.allowedFrames[1]) {
        issues.push({
          sceneType: contract.sceneType,
          field: `animations.${name}.allowedFrames`,
          code: "INVALID_ALLOWED_FRAMES"
        });
      }
      if (animation.fps <= 0) {
        issues.push({ sceneType: contract.sceneType, field: `animations.${name}.fps`, code: "INVALID_FPS" });
      }
      if (!technicalStates.has(animation.technicalState)) {
        issues.push({
          sceneType: contract.sceneType,
          field: `animations.${name}.technicalState`,
          code: "INVALID_TECHNICAL_STATE"
        });
      }
    }

    const generatedDirections = new Set(contract.directionModel?.generated ?? []);
    for (const [direction, source] of Object.entries(contract.directionModel?.mirrored ?? {})) {
      if (!generatedDirections.has(source)) {
        issues.push({
          sceneType: contract.sceneType,
          field: `directionModel.mirrored.${direction}`,
          code: "MIRROR_SOURCE_NOT_GENERATED"
        });
      }
    }
  }

  return issues;
}

function missingRequiredControlledEntityFields(contract: ControlledEntityContract): ControlledEntityRequiredField[] {
  const missingFields: ControlledEntityRequiredField[] = [];

  if (!contract.required) missingFields.push("required");
  if (contract.role === "none") missingFields.push("role");
  if (!contract.visualCanvas) missingFields.push("visualCanvas");
  if (contract.collision === undefined) missingFields.push("collision");
  if (!contract.anchor) missingFields.push("anchor");
  if (!contract.directionModel) missingFields.push("directionModel");
  if (!contract.animations || Object.keys(contract.animations).length === 0) missingFields.push("animations");
  if (!contract.gbaAssetPreset) missingFields.push("gbaAssetPreset");

  return missingFields;
}

export function resolveControlledEntityGeneration(
  sceneType: ControlledEntitySceneType,
  options: ResolveControlledEntityContractOptions = {}
): ControlledEntityGenerationResolution {
  const contract = resolveControlledEntityContract(sceneType, options);

  if (sceneType === "custom" && options.requestControlledEntity) {
    const missingFields = missingRequiredControlledEntityFields(contract);
    if (missingFields.length > 0) {
      return { status: "NEEDS_CONTRACT_OVERRIDE", missingFields };
    }
  }

  return { status: contract.required ? "READY" : "NOT_REQUIRED", contract };
}
