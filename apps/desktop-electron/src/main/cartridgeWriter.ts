import { randomUUID } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { CARTRIDGE_PROFILE, type CartridgeFirmware, type CartridgeOutcome, type CartridgePort, type CartridgePrepareRequest, type CartridgeProgress, type CartridgeReview } from "../shared/cartridgeWriter.js";
import { sha256, validateCfbResult, type CfbEvent, type CfbToolPort } from "./cfbTool.js";

interface WriterOptions {
  root: string;
  tool: CfbToolPort;
  build(request: CartridgePrepareRequest): Promise<{ romPath: string | null; error?: string }>;
  progress?(owner: number, event: CartridgeProgress): void;
}
interface Prepared { owner: number; review: CartridgeReview; romPath: string; directory: string; fingerprint: string; firmware: CartridgeFirmware }
function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" ? value as Record<string, unknown> : {}; }
function message(error: unknown): string { return error instanceof Error ? error.message : String(error); }

/** One physical operation at a time. Review tokens are single-use and bound to a window. */
export class CartridgeWriter {
  private busy = false;
  private writing = false;
  private progressByOwner = new Map<number, CartridgeProgress>();
  private outcomeByOwner = new Map<number, CartridgeOutcome>();
  private prepared = new Map<string, Prepared>();
  constructor(private readonly options: WriterOptions) {}
  get isWriting() { return this.writing; }
  async status(owner?: number) { return { ...await this.options.tool.status(), busy: this.busy, progress: owner === undefined ? undefined : this.progressByOwner.get(owner), outcome: owner === undefined ? undefined : this.outcomeByOwner.get(owner) }; }
  async install() {
    if (this.busy) return { ...(await this.status()), error: "Aguarde a operação do gravador terminar." };
    this.busy = true;
    try { return await this.options.tool.install(); } finally { this.busy = false; }
  }
  discard(owner: number): void {
    for (const [token, value] of this.prepared) if (value.owner === owner) this.prepared.delete(token);
  }
  private emit(owner: number, progress: CartridgeProgress) { this.progressByOwner.set(owner, progress); this.options.progress?.(owner, progress); }
  private async run(command: string[], port: string, owner: number, firmware: CartridgeFirmware): Promise<CfbEvent[]> {
    return this.options.tool.run([...command, "--port", port], event => {
      if (event.type === "progress" && ["erase", "write", "verify"].includes(String(event.phase)) && typeof event.done === "number" && typeof event.total === "number" && event.done >= 0 && event.total > 0) {
        this.emit(owner, { phase: event.phase as "erase" | "write" | "verify", done: event.done, total: event.total });
      }
    }, firmware);
  }
  async detect(): Promise<{ ports: CartridgePort[]; error?: string }> {
    if (this.busy) return { ports: [], error: "Aguarde a operação do gravador terminar." };
    this.busy = true;
    try {
      const events = await this.options.tool.run(["detect"]);
      if (!events.some(e => e.type === "summary" && e.command === "detect")) throw new Error("O gravador não confirmou a detecção.");
      return { ports: events.filter(e => e.type === "port" && e.burner === true && e.vid === "0483" && e.pid === "0721" && typeof e.port === "string").map(e => ({ port: e.port as string, name: String(e.name ?? "ChisFlash Burner"), available: e.open === true })) };
    } catch (error) { return { ports: [], error: message(error) }; } finally { this.busy = false; }
  }
  private async checkPort(port: string): Promise<void> {
    const events = await this.options.tool.run(["detect"]);
    if (!events.some(e => e.type === "port" && e.port === port && e.burner === true && e.open === true && e.vid === "0483" && e.pid === "0721")) throw new Error("O gravador selecionado foi desconectado ou está ocupado.");
  }
  private async cartridge(port: string, owner: number, romBytes: number, firmware: CartridgeFirmware): Promise<CfbEvent> {
    await this.checkPort(port);
    // The runner excludes standalone preferences. GBA commands use 3.3 V.
    const voltage = await this.run(["voltage", "3v3"], port, owner, firmware);
    if (!voltage.some(e => e.type === "voltage" && e.voltage === "3.3V")) throw new Error("Não foi possível confirmar alimentação de 3,3 V.");
    const events = await this.run(["info"], port, owner, firmware);
    const info = events.find(e => e.type === "info");
    if (!info || info.port !== port || info.present !== true || !["gba", "unknown"].includes(String(info.kind)) || typeof info.id !== "string" || !info.id.trim()) throw new Error("Cartucho GBA não identificado. Confira o encaixe e tente novamente.");
    if (info.capacity_bytes !== CARTRIDGE_PROFILE.romBytes || romBytes > Number(info.capacity_bytes)) throw new Error("A capacidade do cartucho não corresponde ao perfil ChisFlash de 32 MiB ou não comporta a ROM.");
    return info;
  }
  private fingerprint(info: CfbEvent): string {
    return JSON.stringify([info.id, info.capacity_bytes, info.sector_size, info.sector_count]);
  }
  private async dumpSave(port: string, owner: number, path: string, firmware: CartridgeFirmware): Promise<Buffer> {
    const events = await this.run(["save-dump", "--type", "fram", "--len", String(CARTRIDGE_PROFILE.saveBytes), "--out", path], port, owner, firmware);
    validateCfbResult(events, "save-dump", CARTRIDGE_PROFILE.saveBytes);
    const bytes = await readFile(path);
    if (bytes.length !== CARTRIDGE_PROFILE.saveBytes) throw new Error("O backup do save está incompleto. A gravação foi interrompida.");
    return bytes;
  }
  async prepare(owner: number, request: CartridgePrepareRequest): Promise<CartridgeOutcome> {
    if (this.busy) return { ok: false, error: "Já existe uma operação do gravador em andamento." };
    this.busy = true; this.discard(owner); this.outcomeByOwner.delete(owner);
    let backupPath: string | undefined;
    try {
      const firmware = request?.firmware ?? "stm";
      if (firmware !== "stm" && firmware !== "stc8") throw new Error("Modelo do gravador inválido.");
      if (request?.profileID !== CARTRIDGE_PROFILE.id) throw new Error("Confirme o perfil físico ChisFlash v1.2 / FRAM 128 KiB antes de preparar a gravação.");
      const save = record(record(request?.project?.data?.settings).save);
      if (save.saveType !== "sram") throw new Error("Este perfil exige SRAM / FRAM nos ajustes de save do projeto. Flash 1 Mbit ainda não é suportado por esta integração.");
      if (!request.projectPath || !isAbsolute(request.projectPath) || !request.port || request.port.length > 512) throw new Error("Salve o projeto e selecione um gravador antes de preparar a ROM.");
      this.emit(owner, { phase: "building" });
      const built = await this.options.build(request);
      if (built.error || !built.romPath) throw new Error(built.error ?? "A compilação não produziu uma ROM.");
      const file = await stat(built.romPath);
      if (file.size < 192 || file.size > CARTRIDGE_PROFILE.romBytes) throw new Error("ROM vazia, inválida ou maior que 32 MiB.");
      const bytes = await readFile(built.romPath);
      if (bytes.length !== file.size) throw new Error("A ROM mudou durante a preparação. Compile novamente.");
      const checksum = (-bytes.subarray(0xa0, 0xbd).reduce((sum, byte) => sum + byte, 0) - 0x19) & 255;
      if (bytes[0xb2] !== 0x96 || bytes[0xbd] !== checksum) throw new Error("O arquivo compilado não possui um cabeçalho GBA válido.");
      const token = randomUUID(); const directory = join(this.options.root, "backups", token);
      await mkdir(directory, { recursive: true, mode: 0o700 });
      const romPath = join(directory, "game.gba");
      await writeFile(romPath, bytes, { flag: "wx", mode: 0o600 });
      this.emit(owner, { phase: "checking" });
      const info = await this.cartridge(request.port, owner, bytes.length, firmware);
      this.emit(owner, { phase: "backup" });
      backupPath = join(directory, "save-before.sav");
      const saveBefore = await this.dumpSave(request.port, owner, backupPath, firmware);
      const secondRead = await this.dumpSave(request.port, owner, join(directory, "save-confirm.sav"), firmware);
      if (!saveBefore.equals(secondRead)) throw new Error("As duas leituras do save diferem. Confira os contatos; a ROM não será gravada.");
      const review: CartridgeReview = { token, port: request.port, profile: CARTRIDGE_PROFILE.label, romBytes: bytes.length, romSha256: sha256(bytes), capacityBytes: Number(info.capacity_bytes), chipID: String(info.id), backupPath, saveSha256: sha256(saveBefore), expiresAt: Date.now() + 10 * 60 * 1000 };
      await writeFile(join(directory, "review.json"), JSON.stringify(review, null, 2), { mode: 0o600 });
      this.prepared.set(token, { owner, review, directory, romPath, fingerprint: this.fingerprint(info), firmware });
      this.emit(owner, { phase: "ready" });
      return { ok: true, review };
    } catch (error) { return { ok: false, error: message(error), backupPath }; } finally { this.busy = false; }
  }
  async write(owner: number, token: string): Promise<CartridgeOutcome> {
    if (this.busy) return { ok: false, error: "Já existe uma operação do gravador em andamento." };
    const prepared = this.prepared.get(token);
    if (!prepared || prepared.owner !== owner) return { ok: false, error: "Prepare e revise a ROM antes de gravar o cartucho." };
    this.prepared.delete(token); this.busy = true; this.writing = true;
    const { review, directory, romPath, firmware } = prepared;
    const reportPath = join(directory, "result.json");
    let outcome: CartridgeOutcome;
    try {
      if (Date.now() > review.expiresAt) throw new Error("A revisão expirou. Prepare a ROM novamente.");
      if (sha256(await readFile(romPath)) !== review.romSha256) throw new Error("A ROM mudou depois da revisão. Prepare novamente.");
      this.emit(owner, { phase: "checking" });
      const info = await this.cartridge(review.port, owner, review.romBytes, firmware);
      if (this.fingerprint(info) !== prepared.fingerprint) throw new Error("O cartucho mudou depois da revisão. Prepare novamente.");
      const currentSave = await this.dumpSave(review.port, owner, join(directory, "save-preflight.sav"), firmware);
      if (sha256(currentSave) !== review.saveSha256) throw new Error("O save mudou depois do backup. Prepare a ROM novamente antes de gravar.");
      this.emit(owner, { phase: "write" });
      const burned = await this.run(["burn", "--rom", romPath], review.port, owner, firmware);
      validateCfbResult(burned, "burn", review.romBytes);
      this.emit(owner, { phase: "verify" });
      const readbackPath = join(directory, "readback.gba");
      const readback = await this.run(["dump", "--out", readbackPath, "--len", String(review.romBytes)], review.port, owner, firmware);
      validateCfbResult(readback, "dump", review.romBytes);
      if (sha256(await readFile(readbackPath)) !== review.romSha256) throw new Error("A leitura da ROM gravada não corresponde à ROM revisada. Regrave o cartucho.");
      this.emit(owner, { phase: "save-check" });
      const saveAfter = await this.dumpSave(review.port, owner, join(directory, "save-after.sav"), firmware);
      if (sha256(saveAfter) !== review.saveSha256) throw new Error("A ROM foi gravada, mas o save mudou. O backup original foi preservado; não restaure automaticamente.");
      outcome = { ok: true, backupPath: review.backupPath, reportPath };
      this.emit(owner, { phase: "complete" });
    } catch (error) { outcome = { ok: false, error: message(error), backupPath: review.backupPath, reportPath }; }
    try { await writeFile(reportPath, JSON.stringify({ ...outcome, romSha256: review.romSha256, saveSha256: review.saveSha256, finishedAt: new Date().toISOString() }, null, 2), { mode: 0o600 }); }
    catch { outcome = { ...outcome, ok: false, error: `${outcome.error ?? "Operação concluída."} Não foi possível salvar o relatório.` }; }
    this.busy = false; this.writing = false;
    this.outcomeByOwner.set(owner, outcome);
    return outcome;
  }
}
