import type { ParsedGBAProject } from "./projectFile.js";

export const CFB_VERSION = "0.5.2";
export const CARTRIDGE_PROFILE = { id: "chisflash-v1.2-fram", label: "ChisFlash v1.2 · FRAM 128 KiB", saveBytes: 131072, romBytes: 33554432 } as const;
export type CartridgeFirmware = "stm" | "stc8";
export type CartridgePhase = "building" | "checking" | "backup" | "ready" | "erase" | "write" | "verify" | "save-check" | "complete";
export interface CartridgeProgress { phase: CartridgePhase; done?: number; total?: number }
export interface CartridgeToolStatus { installed: boolean; supported: boolean; version: string; error?: string; busy?: boolean; progress?: CartridgeProgress; outcome?: CartridgeOutcome }
export interface CartridgePort { port: string; name: string; available: boolean }
export interface CartridgePrepareRequest { project: ParsedGBAProject; projectPath: string; port: string; profileID: typeof CARTRIDGE_PROFILE.id; firmware?: CartridgeFirmware }
export interface CartridgeReview {
  token: string; profile: string; port: string; romBytes: number; romSha256: string;
  capacityBytes: number; chipID: string; backupPath: string; saveSha256: string; expiresAt: number;
}
export interface CartridgeOutcome { ok: boolean; error?: string; review?: CartridgeReview; backupPath?: string; reportPath?: string }
export interface CartridgeWriterAPI {
  status(): Promise<CartridgeToolStatus>;
  install(): Promise<CartridgeToolStatus>;
  detect(): Promise<{ ports: CartridgePort[]; error?: string }>;
  prepare(request: CartridgePrepareRequest): Promise<CartridgeOutcome>;
  write(token: string): Promise<CartridgeOutcome>;
  discard(): Promise<void>;
  onProgress(listener: (progress: CartridgeProgress) => void): () => void;
}
export const cartridgeWriterChannels = {
  status: "cartridge:status", install: "cartridge:install", detect: "cartridge:detect",
  prepare: "cartridge:prepare", write: "cartridge:write", discard: "cartridge:discard", progress: "cartridge:progress"
} as const;
