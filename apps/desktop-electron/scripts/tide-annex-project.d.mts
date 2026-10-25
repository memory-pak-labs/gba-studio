import type {GBAProjectData} from '../src/shared/projectFile.js';
export interface TideManifest {assets:Array<Record<string,unknown>>;tilemaps:Record<string,number[]>;attributes:number[];approval?:Record<string,boolean>}
export function addTideAnnex<T extends GBAProjectData>(source:T,manifest:TideManifest):T;
export function preserveTideAnnex<T extends GBAProjectData>(source:T,generated:T):T;
