export function verifyNativeVisualRuntimeMain(mainCpp: string): string[];

export const TOPDOWN_WALK_4DIRS_CANONICAL_PREFIX: readonly string[];

export function playerAnimationNames(exportContract: unknown): string[];

export interface TopdownWalk4DirsContractResult {
  animationCount: number;
  canonicalPrefix: string[];
}

export function verifyTopdownWalk4DirsExportContract(exportContract: unknown): TopdownWalk4DirsContractResult;

export interface NativeVisualExportContractResult {
  spriteAssetCount: number;
  tilesetAssetCount: number;
  roomCount: number;
  playerAssetId: string;
  emitAnimationFallback: false;
}

export function verifyNativeVisualExportContract(exportContract: unknown): NativeVisualExportContractResult;
