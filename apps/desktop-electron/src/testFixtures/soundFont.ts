const chunk = (id: string, data: Buffer) => {
  const header = Buffer.alloc(8); header.write(id); header.writeUInt32LE(data.length, 4);
  return Buffer.concat([header, data, Buffer.alloc(data.length % 2)]);
};
const list = (id: string, children: Buffer[]) => chunk("LIST", Buffer.concat([Buffer.from(id), ...children]));
function nameRecord(name: string, size: number) { const b = Buffer.alloc(size); b.write(name, 0, 20); return b; }
function generator(op: number, value: number) { const b = Buffer.alloc(4); b.writeUInt16LE(op); b.writeUInt16LE(value & 65535, 2); return b; }

// Authored synthetic samples, never a commercial SoundFont fixture.
export function soundFontFixture(options: { loop?: boolean; root?: number; sampleType?: number; badIndex?: boolean } = {}) {
  const samples = Buffer.alloc(128 * 2); for (let i = 0; i < 128; i++) samples.writeInt16LE(Math.round(Math.sin(i / 4) * 20000), i * 2);
  const phdr = nameRecord("Piano", 38); phdr.writeUInt16LE(2, 20);
  const eop = nameRecord("EOP", 38); eop.writeUInt16LE(1, 24);
  const inst = nameRecord("Soft", 22); const eoi = nameRecord("EOI", 22); eoi.writeUInt16LE(1, 20);
  const shdr = nameRecord("Wave", 46); shdr.writeUInt32LE(128, 24); shdr.writeUInt32LE(16, 28); shdr.writeUInt32LE(112, 32);
  shdr.writeUInt32LE(15768, 36); shdr[40] = options.root ?? 60; shdr.writeUInt16LE(options.sampleType ?? 1, 44);
  const pbag = Buffer.alloc(8); pbag.writeUInt16LE(1, 4);
  const ibag = Buffer.alloc(8); ibag.writeUInt16LE(3, 4);
  const body = Buffer.concat([Buffer.from("sfbk"), list("INFO", [chunk("ifil", Buffer.from([2, 0, 1, 0])), chunk("INAM", Buffer.from("Test bank\0"))]),
    list("sdta", [chunk("smpl", samples)]), list("pdta", [chunk("phdr", Buffer.concat([phdr, eop])), chunk("pbag", pbag), chunk("pmod", Buffer.alloc(10)),
      chunk("pgen", Buffer.concat([generator(41, 0), generator(0, 0)])), chunk("inst", Buffer.concat([inst, eoi])), chunk("ibag", ibag), chunk("imod", Buffer.alloc(10)),
      chunk("igen", Buffer.concat([generator(43, 36 | (96 << 8)), generator(54, options.loop ? 1 : 0), generator(53, options.badIndex ? 99 : 0), generator(0, 0)])),
      chunk("shdr", Buffer.concat([shdr, nameRecord("EOS", 46)]))])]);
  return chunk("RIFF", body);
}
