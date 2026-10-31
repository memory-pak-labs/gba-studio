import type {GBAProjectData} from '../src/shared/projectFile.js';
export interface EncoreAssetManifest {assets: Array<Record<string,unknown>>}
export const ENCORE_VARIABLES: Array<{id:string;name:string;initialValue:number}>;
export function extendExampleEncore<T extends GBAProjectData>(source:T,manifest:EncoreAssetManifest):T;
export function preserveExampleEncore<T extends GBAProjectData>(source:T,generated:T):T;
