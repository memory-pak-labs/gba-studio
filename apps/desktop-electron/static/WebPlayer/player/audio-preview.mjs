import createMGBA from "./mgba-core.mjs";

const query = new URLSearchParams(location.search);
const id = query.get("id");
let core, witness = 0, active = true, videoFrames = 0;
const send = (message, transfer = []) => parent.postMessage({ id, ...message }, "*", transfer);
const word = address => (core._gba_audio_register(address) | core._gba_audio_register(address + 2) << 16) >>> 0;
function findWitness() {
  for (const [start, end] of [[0x02000000, 0x02040000], [0x03000000, 0x03008000]]) {
    for (let address = start; address < end - 32; address += 4) {
      if (word(address) === 0x41555043 && word(address + 4) === 0x50434d31) return address;
    }
  }
  return 0;
}
window.addEventListener("pagehide", () => { active = false; core?._gba_destroy(); });
window.addEventListener("message", event => {
  if (!active || !core || event.source !== parent || event.data?.id !== id || event.data?.type !== "pump") return;
  try {
    const left = [], right = [];
    for (let frame = 0; frame < 4; frame++) {
      core._gba_run_frame(); videoFrames++;
      const count = core._gba_audio_sample_count();
      const samples = new Int16Array(core.HEAPU8.buffer, core._gba_audio_samples(), count * 2);
      for (let i = 0; i < count; i++) { left.push(samples[i * 2] / 32768); right.push(samples[i * 2 + 1] / 32768); }
      if (!witness) witness = findWitness();
      if (witness && !word(witness + 24)) throw new Error("A engine rejeitou o asset de áudio.");
      if (!witness && videoFrames > 60) throw new Error("A ROM da prévia não iniciou o áudio.");
      if (witness && word(witness + 28)) break;
    }
    const l = Float32Array.from(left), r = Float32Array.from(right);
    send({ type: "frames", left: l, right: r, frame: witness ? word(witness + 8) : 0,
      underruns: witness ? word(witness + 20) : 0, voices: witness ? word(witness + 16) : 0,
      ended: Boolean(witness && word(witness + 28)) }, [l.buffer, r.buffer]);
  } catch (error) { active = false; send({ type: "error", error: String(error.message ?? error) }); }
});
try {
  const romURL = new URL(query.get("rom") ?? "", location.href);
  if (romURL.origin !== location.origin || !romURL.pathname.startsWith("/roms/")) throw new Error("ROM da prévia inválida.");
  const response = await fetch(romURL);
  if (!response.ok) throw new Error("ROM da prévia não encontrada.");
  const rom = new Uint8Array(await response.arrayBuffer());
  core = await createMGBA({ noInitialRun: true, locateFile: file => new URL(file, import.meta.url).href });
  if (core._gba_init() !== 1) throw new Error("Falha ao iniciar o core de áudio.");
  const pointer = core._malloc(rom.length); core.HEAPU8.set(rom, pointer);
  const loaded = core._gba_load_rom(pointer, rom.length); core._free(pointer);
  if (loaded !== 1) throw new Error("Falha ao carregar a ROM de áudio.");
  send({ type: "ready", sampleRate: core._gba_audio_sample_rate() });
} catch (error) { active = false; send({ type: "error", error: String(error.message ?? error) }); }
