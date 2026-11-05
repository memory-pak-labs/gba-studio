import type { RomPlayerFrameStats, RomPlayerTelemetryEvent } from "../shared/hardwareProfiler.js";

interface RecordingWindow {
  id: number;
  isDestroyed(): boolean;
  close(): void;
  on(event: "close", listener: (event: { preventDefault(): void }) => void): unknown;
  on(event: "closed", listener: () => void): unknown;
  webContents: { executeJavaScript(code: string): Promise<unknown> };
}
export interface RecordingRegistration {
  window: RecordingWindow;
  ownerID: number;
  normalize(value: unknown): RomPlayerFrameStats | null;
  onTelemetry?(telemetry: RomPlayerTelemetryEvent): void;
}
export interface RecordingControlResult {
  ok: boolean;
  telemetry?: RomPlayerTelemetryEvent;
  error?: string;
}
interface Entry extends RecordingRegistration {
  begin?: Promise<RecordingControlResult>;
  flush?: Promise<RecordingControlResult>;
}
const players = new Map<number, Entry>();
const commands = {
  begin: "window.GBAStudioDirectPlayer?.beginInputRecording?.() ?? null",
  flush: "window.GBAStudioDirectPlayer?.flushInputRecording?.() ?? null"
} as const;

async function execute(entry: Entry, action: keyof typeof commands, recordingID?: string): Promise<RecordingControlResult> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const value = await Promise.race([
      entry.window.webContents.executeJavaScript(action === "begin" ? `window.GBAStudioDirectPlayer?.beginInputRecording?.(${JSON.stringify(recordingID)}) ?? null` : commands.flush),
      new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error("Player recording timed out.")), 3000); })
    ]);
    if (value == null && action === "flush") return { ok: true };
    const stats = entry.normalize(value);
    if (!stats) return { ok: false, error: "Não foi possível receber a gravação do Player." };
    const telemetry: RomPlayerTelemetryEvent = { state: "running", windowID: entry.window.id, stats };
    entry.onTelemetry?.(telemetry);
    return { ok: true, telemetry };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  } finally { if (timeout) clearTimeout(timeout); }
}

function flush(entry: Entry): Promise<RecordingControlResult> {
  return entry.flush ??= (async () => {
    await entry.begin;
    return execute(entry, "flush");
  })().finally(() => { entry.flush = undefined; });
}

export function registerRomPlayerRecording(registration: RecordingRegistration): void {
  const entry: Entry = { ...registration };
  players.set(entry.window.id, entry);
  let closing = false, released = false;
  entry.window.on("close", event => {
    if (released) return;
    event.preventDefault();
    if (closing) return;
    closing = true;
    void flush(entry).then(result => {
      if (!result.ok) entry.onTelemetry?.({ state: "closed", windowID: entry.window.id, recordingError: result.error });
    }).finally(() => {
      released = true;
      if (!entry.window.isDestroyed()) entry.window.close();
    });
  });
  entry.window.on("closed", () => players.delete(entry.window.id));
}

export async function controlRomPlayerRecording(ownerID: number, request: { windowID: number; action: "begin" | "flush"; recordingID?: string }): Promise<RecordingControlResult> {
  const entry = players.get(request?.windowID);
  if (!entry || entry.ownerID !== ownerID || entry.window.isDestroyed()
    || !["begin", "flush"].includes(request.action)) return { ok: false, error: "Player indisponível para gravação." };
  if (request.action === "flush") return flush(entry);
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(request.recordingID ?? "")) return { ok: false, error: "Gravação inválida." };
  return entry.begin ??= execute(entry, "begin", request.recordingID).finally(() => { entry.begin = undefined; });
}
