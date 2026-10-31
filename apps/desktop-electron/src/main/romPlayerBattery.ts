import { createHash, randomUUID } from "node:crypto";
import { lstatSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { WebContents } from "electron";
import { ipcChannels } from "../shared/ipc.js";

const maxRecordLength = 176_000;
const maxBatteryBytes = 131_072;

function validateRecord(value: unknown, identity: string): asserts value is string {
  if (typeof value !== "string" || value.length > maxRecordLength) throw new Error("Save inválido.");
  const record = JSON.parse(value);
  if (record?.schema !== 1 || record.romSha256 !== identity || typeof record.data !== "string" ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(record.data)) {
    throw new Error("Save inválido ou de outro jogo.");
  }
  const bytes = Buffer.from(record.data, "base64");
  if (!bytes.length || bytes.length > maxBatteryBytes || bytes.toString("base64") !== record.data) {
    throw new Error("Tamanho ou conteúdo de save inválido.");
  }
}

/** The ROM output path is stable across rebuilds; unrelated projects never share a save. */
export function createRomPlayerBattery(userDataPath: string, romPath: string, sceneScope?: string) {
  if (sceneScope !== undefined && (typeof sceneScope !== "string" || !sceneScope || sceneScope.length > 1024)) {
    throw new Error("Identidade de cena inválida.");
  }
  const scope = sceneScope === undefined ? "" : `\0scene\0${sceneScope}`;
  const identity = createHash("sha256").update(`gba-studio:play-battery:v1\0${path.resolve(romPath)}${scope}`).digest("hex");
  const directory = path.join(userDataPath, "rom-player-saves");
  const filePath = path.join(directory, `${identity}.json`);
  function ensureDirectory() {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const info = lstatSync(directory);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("Diretório de save inválido.");
  }
  function existingFile() {
    try {
      const info = lstatSync(filePath);
      if (!info.isFile() || info.isSymbolicLink() || info.size > maxRecordLength) throw new Error("Arquivo de save inválido.");
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    }
  }
  return {
    identity, filePath,
    read(): string | null {
      ensureDirectory();
      if (!existingFile()) return null;
      const record = readFileSync(filePath, "utf8");
      validateRecord(record, identity);
      return record;
    },
    write(record: unknown): void {
      validateRecord(record, identity);
      ensureDirectory();
      if (existingFile()) validateRecord(readFileSync(filePath, "utf8"), identity);
      const temporary = path.join(directory, `.${identity}.${randomUUID()}.tmp`);
      try {
        writeFileSync(temporary, record, { flag: "wx", mode: 0o600 });
        renameSync(temporary, filePath);
      } finally {
        try { unlinkSync(temporary); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
      }
    }
  };
}

export function registerRomPlayerBattery(contents: WebContents, battery: ReturnType<typeof createRomPlayerBattery>, playerUrl: string): void {
  const expected = new URL(playerUrl);
  contents.on("ipc-message-sync", (event, channel, operation: unknown, value: unknown) => {
    if (channel !== ipcChannels.romPlayerBattery) return;
    try {
      if (event.senderFrame !== contents.mainFrame) throw new Error("Quadro inválido.");
      const sender = new URL(event.senderFrame.url);
      if (sender.origin !== expected.origin || sender.pathname !== expected.pathname) throw new Error("Origem inválida.");
      if (operation === "identity") event.returnValue = { ok: true, value: battery.identity };
      else if (operation === "read") event.returnValue = { ok: true, value: battery.read() };
      else if (operation === "write") { battery.write(value); event.returnValue = { ok: true, value: null }; }
      else throw new Error("Operação inválida.");
    } catch {
      event.returnValue = { ok: false };
    }
  });
}
