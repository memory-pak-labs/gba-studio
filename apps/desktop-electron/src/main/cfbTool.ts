import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { StringDecoder } from "node:string_decoder";
import { CFB_VERSION, type CartridgeFirmware, type CartridgeToolStatus } from "../shared/cartridgeWriter.js";

import { loadCfbBundle } from "./cfbBundle.js";

export type CfbEvent = Record<string, unknown> & { type: string };
const MAX_LINE = 262144;
const RELEASE = "https://github.com/eyenobig/chis-burner-cmd/releases/download/v0.5.2/";
const SOURCE = "https://github.com/eyenobig/chis-burner-cmd/tree/8b3eb46d639221f3093ae2b5646fdf9d91fa7999";
const ASSETS: Record<string, { name: string; sha256: string; bytes: number }> = {
  "darwin-arm64": { name: "cfb-aarch64-apple-darwin", sha256: "8ecaf84a53b49a6c8f7c762fc8033e8df8b11df8d3809876fb08d8b7316240da", bytes: 2686496 },
  "darwin-x64": { name: "cfb-x86_64-apple-darwin", sha256: "6473e7e6bbc92092ff6854c583385b6eef3cb3144f9521bb750a64c5dc8cc033", bytes: 2714872 },
  "win32-x64": { name: "cfb-x86_64-pc-windows-msvc.exe", sha256: "e67871a0f0b67707f9c8166654ee77ff723985ef3a53549aef335e28b972070c", bytes: 2874368 },
  "linux-x64": { name: "cfb-x86_64-unknown-linux-gnu", sha256: "ce339af0ca75585eb23e89c42f1107c391a5f53cc5e158d561b6b660c643f490", bytes: 2807800 }
};
export function cfbAsset(platform: string, arch: string) { return ASSETS[`${platform}-${arch}`] ?? null; }
export function sha256(bytes: Uint8Array): string { return createHash("sha256").update(bytes).digest("hex"); }

export class CfbEventDecoder {
  private pending = "";
  push(chunk: string): CfbEvent[] {
    this.pending += chunk;
    const lines = this.pending.split("\n");
    this.pending = lines.pop()!;
    if (this.pending.length > MAX_LINE || lines.some(line => line.length > MAX_LINE)) throw new Error("Resposta do gravador excedeu o limite.");
    return lines.filter(line => line.trim()).map(line => this.parse(line));
  }
  finish(): CfbEvent[] {
    const last = this.pending.trim(); this.pending = "";
    return last ? [this.parse(last)] : [];
  }
  private parse(line: string): CfbEvent {
    const value: unknown = JSON.parse(line);
    if (!value || typeof value !== "object" || !("type" in value) || typeof value.type !== "string") throw new Error("Resposta inválida do gravador.");
    return value as CfbEvent;
  }
}

export function validateCfbResult(events: CfbEvent[], command: string, bytes: number): void {
  const results = events.filter(event => event.type === "result" && event.command === command);
  if (events.some(e => e.type === "error") || results.length !== 1 || results[0].ok !== true || results[0].bytes !== bytes || results[0].mismatch_bytes !== 0) {
    throw new Error(`O gravador não confirmou ${command} para todos os ${bytes} bytes.`);
  }
}

/** Execute only the verified helper, with an argument array and no shell/stdin. */
export function runCfb(executable: string, args: string[], onEvent?: (event: CfbEvent) => void, timeoutMs = 120000): Promise<CfbEvent[]> {
  return new Promise((resolve, reject) => {
    // cfb has no config-path flag. Omitting these prevents reads/writes of the
    // standalone application's ~/.cfb.json; GBA commands default to 3.3 V.
    const environment = { ...process.env };
    delete environment.HOME; delete environment.USERPROFILE;
    const child = spawn(executable, ["--json", "--lang", "en", ...args], { env: environment, shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    const decoder = new CfbEventDecoder(); const utf8 = new StringDecoder("utf8");
    const events: CfbEvent[] = []; let stderr = ""; let failure: Error | undefined;
    let killTimer: ReturnType<typeof setTimeout> | undefined;
    const fail = (error: Error) => { failure ??= error; child.kill(); killTimer ??= setTimeout(() => child.kill("SIGKILL"), 5000); };
    const accept = (batch: CfbEvent[]) => {
      for (const event of batch) {
        onEvent?.(event);
        if (event.type === "error") failure ??= new Error(String(event.message ?? "Falha no gravador.").slice(0,1000));
        if (event.type !== "progress" && event.type !== "log") {
          if (events.length >= 2048) throw new Error("Respostas demais do gravador.");
          events.push(event);
        }
      }
    };
    const timer = setTimeout(() => fail(new Error("Tempo limite do gravador excedido. O cartucho pode precisar ser regravado.")), timeoutMs);
    child.stdout.on("data", (chunk: Buffer) => { try { accept(decoder.push(utf8.write(chunk))); } catch (error) { fail(error instanceof Error ? error : new Error(String(error))); } });
    child.stderr.on("data", (chunk: Buffer) => { stderr = (stderr + chunk.toString("utf8")).slice(-2000); });
    child.on("error", error => { failure = error; });
    child.on("close", code => {
      clearTimeout(timer);
      clearTimeout(killTimer);
      try { accept(decoder.push(utf8.end())); accept(decoder.finish()); } catch (error) { failure ??= error as Error; }
      if (failure || code !== 0) reject(failure ?? new Error(`O gravador encerrou com código ${code}. ${stderr}`));
      else resolve(events);
    });
  });
}

export interface CfbToolPort {
  status(): Promise<CartridgeToolStatus>;
  install(): Promise<CartridgeToolStatus>;
  run(args: string[], onEvent?: (event: CfbEvent) => void, firmware?: CartridgeFirmware): Promise<CfbEvent[]>;
}

export class ManagedCfbTool implements CfbToolPort {
  private readonly asset;
  private readonly directory: string;
  constructor(root: string, private readonly platform = process.platform, private readonly arch = process.arch, private readonly fetchFile: typeof fetch = fetch, private readonly bundleRoot?: string) {
    this.asset = cfbAsset(platform, arch); this.directory = join(root, "tools", `cfb-${CFB_VERSION}`);
  }
  private get executable(): string { return join(this.directory, this.asset?.name ?? "unsupported"); }
  private bundle() { return this.bundleRoot ? loadCfbBundle(this.bundleRoot, this.platform, this.arch) : Promise.resolve(undefined); }
  async status(): Promise<CartridgeToolStatus> {
    if (!this.asset) return { installed: false, supported: false, version: CFB_VERSION, error: "Suporte disponível para macOS Intel/Apple Silicon, Windows x64 e Linux x64." };
    try {
      const bundle = await this.bundle();
      if (bundle) return { installed: true, supported: true, version: bundle.version };
      const bytes = await readFile(this.executable);
      return { installed: bytes.length === this.asset.bytes && sha256(bytes) === this.asset.sha256, supported: true, version: CFB_VERSION };
    } catch (error) {
      return { installed: false, supported: true, version: CFB_VERSION, ...((error as NodeJS.ErrnoException).code === "ENOENT" ? {} : { error: error instanceof Error ? error.message : String(error) }) };
    }
  }
  async install(): Promise<CartridgeToolStatus> {
    if (!this.asset) return this.status();
    try { if (await this.bundle()) return this.status(); } catch { return this.status(); }
    if ((await this.status()).installed) return this.status();
    await mkdir(this.directory, { recursive: true });
    const temporary = `${this.executable}.${randomUUID()}.tmp`;
    try {
      const response = await this.fetchFile(RELEASE + this.asset.name, { signal: AbortSignal.timeout(120000) });
      if (!response.ok || !response.body) throw new Error(`Falha ao baixar suporte: HTTP ${response.status}.`);
      const chunks: Uint8Array[] = []; let length = 0;
      for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
        length += chunk.length; if (length > this.asset.bytes) throw new Error("Download do gravador excedeu o tamanho esperado.");
        chunks.push(chunk);
      }
      const bytes = Buffer.concat(chunks);
      if (bytes.length !== this.asset.bytes || sha256(bytes) !== this.asset.sha256) throw new Error("Checksum do suporte ao gravador inválido.");
      await writeFile(temporary, bytes, { flag: "wx", mode: 0o700 });
      await chmod(temporary, 0o700);
      await rename(temporary, this.executable);
      await writeFile(join(this.directory, "SOURCE.txt"), `cfb ${CFB_VERSION}\nGPL-3.0-only\nSource: ${SOURCE}\nBinary: ${RELEASE + this.asset.name}\nSHA-256: ${this.asset.sha256}\n`);
      return this.status();
    } catch (error) {
      await rm(temporary, { force: true });
      return { installed: false, supported: true, version: CFB_VERSION, error: error instanceof Error ? error.message : String(error) };
    }
  }
  async run(args: string[], onEvent?: (event: CfbEvent) => void, firmware: CartridgeFirmware = "stm"): Promise<CfbEvent[]> {
    if (firmware !== "stm" && firmware !== "stc8") throw new Error("Modelo do gravador inválido.");
    const bundle = await this.bundle();
    if (firmware === "stm" && !bundle && !["detect", "voltage"].includes(args[0])) throw new Error("Suporte STM ausente nesta compilação do GBA Studio. Recompile o suporte ao gravador.");
    if (!(await this.status()).installed) throw new Error("Instale o suporte ChisFlash antes de conectar o gravador.");
    const helperArgs = bundle && firmware === "stm" ? ["--no-power-control", ...args] : args;
    return runCfb(bundle?.executable ?? this.executable, helperArgs, onEvent, args[0] === "burn" || args[0] === "dump" ? 1800000 : 180000);
  }
}
