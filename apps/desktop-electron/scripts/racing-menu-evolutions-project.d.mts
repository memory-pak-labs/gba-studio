import type { GBAProjectData } from '../../../packages/project-contract/src/index.js';
export function extendRacingMenus<T extends GBAProjectData>(source: T): T;

export function preserveRacingMenus<T extends GBAProjectData>(source:T,generated:T):T;
