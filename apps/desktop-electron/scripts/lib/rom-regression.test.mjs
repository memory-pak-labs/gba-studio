import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { captureRomFrames, compareFrameHashes, verifyLinkedRom } from './rom-regression.mjs';
import { createSmokeGbaRom } from './smoke-gba-rom.mjs';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const roots = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'gbs-rom-receipt-')); roots.push(root);
  const pack = path.join(root, 'pack'), build = path.join(root, 'build');
  mkdirSync(path.join(pack, 'lib'), { recursive: true }); mkdirSync(build);
  const library = Buffer.from('native engine'), rom = Buffer.alloc(1024, 7);
  writeFileSync(path.join(pack, 'lib/libgbastudio_engine.a'), library);
  writeFileSync(path.join(pack, 'enginepack.json'), JSON.stringify({ version: '2.27.0' }));
  const romPath = path.join(build, 'fixture.gba'), reportPath = path.join(build, 'rom_build_report.json');
  writeFileSync(romPath, rom);
  const report = { schema: 1, source: 'linked_rom', target: 'fixture', romFile: 'fixture.gba', romBytes: rom.length,
    romSha256: digest(rom), engineVersion: '2.27.0', engineLibrarySha256: digest(library),
    capacity: 33554432, remaining: 33554432 - rom.length, blocked: false };
  const save = () => writeFileSync(reportPath, JSON.stringify(report)); save();
  return { pack, romPath, reportPath, report, save };
}

describe('linked ROM identity', () => {
  it('accepts the materialized ROM and the selected engine, retaining the receipt', () => {
    const f = fixture();
    expect(verifyLinkedRom({ ...f, enginePack: f.pack })).toMatchObject({ romBytes: 1024, engineVersion: '2.27.0', verified: true });
  });
  it.each(['bytes', 'hash', 'file', 'library', 'version', 'blocked', 'capacity'])('rejects a stale or invalid %s receipt', field => {
    const f = fixture();
    if (field === 'bytes') f.report.romBytes++;
    if (field === 'hash') writeFileSync(f.romPath, Buffer.alloc(1024, 8));
    if (field === 'file') f.report.romFile = 'another.gba';
    if (field === 'library') writeFileSync(path.join(f.pack, 'lib/libgbastudio_engine.a'), 'other engine');
    if (field === 'version') f.report.engineVersion = 'old';
    if (field === 'blocked') f.report.blocked = true;
    if (field === 'capacity') f.report.capacity--;
    f.save();
    expect(() => verifyLinkedRom({ ...f, enginePack: f.pack })).toThrow();
  });
  it('fails when no successful build receipt exists', () => {
    const f = fixture(); rmSync(f.reportPath);
    expect(() => verifyLinkedRom({ ...f, enginePack: f.pack })).toThrow();
  });
});

describe('fixed-frame baselines', () => {
  const expected = [{ label: 'boot', frame: 180, rgbaSha256: digest('approved pixels') }];
  it('matches only the exact pixels at the exact frame', () => {
    expect(compareFrameHashes(expected, expected)).toEqual({ passed: true, checks: [{ ...expected[0], actualSha256: expected[0].rgbaSha256, passed: true }] });
    expect(compareFrameHashes(expected, [{ ...expected[0], rgbaSha256: digest('one changed pixel') }]).passed).toBe(false);
    expect(compareFrameHashes(expected, [{ ...expected[0], frame: 181 }]).passed).toBe(false);
  });
  it('rejects missing, extra and duplicate captures instead of passing an empty run', () => {
    expect(compareFrameHashes(expected, []).passed).toBe(false);
    expect(compareFrameHashes(expected, [...expected, { ...expected[0], label: 'extra' }]).passed).toBe(false);
    expect(() => compareFrameHashes([], [])).toThrow();
    expect(() => compareFrameHashes([...expected, ...expected], expected)).toThrow();
  });
  it('boots the real pinned core twice and reproduces the framebuffer', async () => {
    const rom = createSmokeGbaRom();
    const options = { rom, playerRoot: path.resolve('static/WebPlayer/player'), checkpoints: [{ label: 'boot', frame: 3 }, { label: 'settled', frame: 5 }] };
    const a = await captureRomFrames(options), b = await captureRomFrames(options);
    expect(a.emulator.sourceRevision).toBe('0.10.5');
    expect(a.frames).toHaveLength(2);
    expect(a.frames[0].pixels).toHaveLength(240 * 160 * 4);
    expect(a.frames.map(f => f.rgbaSha256)).toEqual(b.frames.map(f => f.rgbaSha256));
  });
  it.each([
    [{ label: '../outside', frame: 1 }], [{ label: 'boot', frame: 0 }],
    [{ label: 'boot', frame: 2 }, { label: 'again', frame: 1 }],
    [{ label: 'boot', frame: 1 }, { label: 'boot', frame: 2 }]
  ])('rejects invalid frame plans before loading a ROM', async checkpoints => {
    await expect(captureRomFrames({ rom: Buffer.alloc(0), checkpoints, playerRoot: '/missing' })).rejects.toThrow();
  });
});
