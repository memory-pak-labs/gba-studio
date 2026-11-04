export function wavSampleLoop(bytes: ArrayBuffer): { start: number; end: number } | null {
  const view = new DataView(bytes);
  const tag = (at: number) => String.fromCharCode(...new Uint8Array(bytes, at, 4));
  if (bytes.byteLength < 12 || tag(0) !== "RIFF" || tag(8) !== "WAVE") return null;
  let rate = 0, loop: [number, number] | null = null;
  for (let at = 12; at + 8 <= bytes.byteLength;) {
    const id = tag(at), size = view.getUint32(at + 4, true), data = at + 8;
    if (data + size > bytes.byteLength) return null;
    if (id === "fmt " && size >= 16) rate = view.getUint32(data + 4, true);
    if (id === "smpl" && size >= 60 && view.getUint32(data + 28, true) === 1 && view.getUint32(data + 40, true) === 0) {
      loop = [view.getUint32(data + 44, true), view.getUint32(data + 48, true) + 1];
    }
    at = data + size + size % 2;
  }
  return rate > 0 && loop && loop[0] < loop[1] ? { start: loop[0] / rate, end: loop[1] / rate } : null;
}
