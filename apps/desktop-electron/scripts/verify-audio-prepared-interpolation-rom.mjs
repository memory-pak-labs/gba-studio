import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import createMGBA from '../static/WebPlayer/player/mgba-core.mjs';

// Compare exact prepared interpolation against the scalar ARM mixer, before
// the emulator resamples output. Authored 16-voice XM/IT keeps every effect.
const [packArg, outputArg] = process.argv.slice(2);
assert.ok(packArg && outputArg, 'usage: node scripts/verify-audio-prepared-interpolation-rom.mjs ENGINE_PACK OUTPUT');
const pack = path.resolve(packArg), output = path.resolve(outputArg);
const python = process.env.PYTHON ?? 'python3';
const arm = path.join(process.env.DEVKITARM ?? '/opt/devkitpro/devkitARM', 'bin');
const engine = fileURLToPath(new URL('../../../packages/GBAStudioEngine/', import.meta.url));
const wasmBytes = fs.readFileSync(new URL('../static/WebPlayer/player/mgba-core.wasm', import.meta.url));
const wasm = new WebAssembly.Module(wasmBytes);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
fs.mkdirSync(output, { recursive: true });
execFileSync(python, [path.join(engine, 'tests/host/tracker_stress_fixtures.py'), output, '--pitch-channels', '16']);
const evidence = { passed: false, engineLibrarySha256: hash(fs.readFileSync(path.join(pack, 'lib/libgbastudio_engine.a'))), wasmSha256: hash(wasmBytes), cases: [] };
try {
  for (const format of ['xm', 'it']) {
    const dir = path.join(output, format); fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(path.join(output, `load-effects.${format}`), path.join(dir, `load-effects.${format}`));
    fs.writeFileSync(path.join(dir, 'audio.json'), JSON.stringify({ tracker: [{ name: 'song', [format]: `load-effects.${format}`, loop: true, native_primary_volume: 12 }] }));
    execFileSync(python, [path.join(pack, 'tools/assetc'), path.join(dir, 'audio.json'), '--audio-json', '-o', path.join(dir, 'song.hpp'), '--name', 'channels']);
    // Keep the scalar descriptors in ROM too: the full tick stream exceeds
    // EWRAM, and copying it at boot would distort the comparison.
    const scalarHeader = fs.readFileSync(path.join(dir, 'song.hpp'), 'utf8')
      .replace(/, channels_\w+_mix_maps, \d+, \d+u/g, ', nullptr, 0, 0')
      .replace(/channels_\w+_mix_maps \+ \d+/g, 'nullptr')
      .replaceAll('channels_', 'scalar_');
    fs.writeFileSync(path.join(dir, 'scalar.hpp'), scalarHeader);
    fs.writeFileSync(path.join(dir, 'main.cpp'), `#include "gbs/engine.hpp"
#include "gbs/audio.hpp"
#include "song.hpp"
#include "scalar.hpp"
extern "C" { volatile unsigned gain_witness[4] = {}; }
extern "C" int gbs_main() {
    gbs::init();
    const bool prepared = (*reinterpret_cast<volatile uint16_t*>(0x04000130) & 1u) == 0;
    const auto& song = prepared ? channels_song_asset : scalar_song_asset;
    gbs::set_audio_channel_volume(gbs::AudioChannel::Music, 12);
    gain_witness[3] = gbs::play_tracker_music(song);
    for (;;) {
        gbs::wait_vblank();
        const auto usage = gbs::audio_runtime_usage();
        ++gain_witness[0]; gain_witness[1] = usage.active_voice_count;
        gain_witness[2] = usage.pcm_underrun_count;
    }
}
`);
    fs.writeFileSync(path.join(dir, 'gbastudio_project.json'), JSON.stringify({ schema: 1, backend: 'gbastudio_engine', kind: 'topdown', entry: 'main.cpp', build: { target: 'gain', make_target: 'all' }, requires: { engine_pack: '>=2.27.0', features: ['audio.tracker_pcm_16_channels', 'audio.pcm_prepared_interpolation', `audio.tracker_${format}_pcm_profile`, 'audio.tracker_pcm_controls', 'audio.tracker_sample_sustain'] } }));
    execFileSync(python, [path.join(pack, 'tools/gbsbuild'), '--engine-pack', pack, '--project-dir', dir], { stdio: 'pipe' });
    const rom = fs.readFileSync(path.join(dir, 'build/gain.gba'));
    const symbols = execFileSync(path.join(arm, 'arm-none-eabi-nm'), ['-C', '-S', path.join(dir, 'build/gain.elf')], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    const address = name => {
      const line = symbols.split('\n').find(line => line.endsWith(` ${name}`) || line.endsWith(`::${name}`));
      assert.ok(line, `symbol ${name}`); return parseInt(line.split(' ')[0], 16);
    };
    const witness = address('gain_witness'), submitted = address('pcm_submitted_blocks'), buffers = address('pcm_mix_buffers'), trackerVoices = address('pcm_tracker');
    // This diagnostic reads private ARM state when the scalar reference
    // starves the game's telemetry. Fail if its layout needs refreshing.
    const trackerSymbol = symbols.split('\n').find(line => line.endsWith('::pcm_tracker'));
    assert.equal(parseInt(trackerSymbol.trim().split(/\s+/)[1], 16), 16 * 32, 'private ARM voice array layout');
    const runs = [];
    for (const prepared of [false, true]) {
      const core = await createMGBA({ print() {}, printErr() {}, instantiateWasm(imports, done) { const instance = new WebAssembly.Instance(wasm, imports); done(instance); return instance.exports; } });
      try {
        assert.equal(core._gba_init(), 1);
        const pointer = core._malloc(rom.length);
        try { core.HEAPU8.set(rom, pointer); assert.equal(core._gba_load_rom(pointer, rom.length), 1); } finally { core._free(pointer); }
        core._gba_set_keys(prepared ? 1 : 0);
        const read16 = a => core._gba_audio_register(a);
        const read32 = a => (read16(a) | (read16(a + 2) << 16)) >>> 0;
        const blocks = []; let previous = 0;
        for (let frame = 0; frame < 600 && blocks.length < 360; ++frame) {
          core._gba_run_frame();
          assert.equal(read16(0x04000204), 0x4317, 'standard cartridge timing and prefetch at boot');
          const count = read32(submitted);
          if (!count || count === previous) continue;
          // A replay boundary may expose two completions. Both ping-pong
          // buffers remain readable, so compare both rather than dropping one.
          assert.ok(count - previous <= 2, 'both completed blocks remain resident');
          for (let completed = previous + 1; completed <= count && blocks.length < 360; ++completed) {
            const pcm = Buffer.alloc(528 * 2);
            const base = buffers + ((completed - 1) % 2) * 2 * (528 + 32);
            for (let side = 0; side < 2; ++side) for (let sample = 0; sample < 528; sample += 2) pcm.writeUInt16LE(read16(base + side * (528 + 32) + sample), side * 528 + sample);
            blocks.push(pcm);
          }
          previous = count;
        }
        assert.equal(blocks.length, 360, 'six seconds of native mixer blocks');
        assert.equal(read32(witness + 12), 1, 'tracker accepted');
        const voices = Array.from({ length: 16 }, (_, i) => read16(trackerVoices + i * 32 + 22) & 255).filter(Boolean).length;
        assert.equal(voices, 16, 'all sixteen mixer voices remain active');
        assert.equal(read32(witness + 8), 0, 'no PCM underruns');
        runs.push({ prepared, frames: read32(witness), blocks: Buffer.concat(blocks) });
      } finally { core._gba_destroy(); }
    }
    assert.deepEqual(runs[1].blocks, runs[0].blocks, 'prepared intervals and scalar interpolation produce byte-identical PCM on ARM');
    assert.ok(runs[1].frames >= 350, 'prepared mixer sustains the isolated ROM cadence');
    evidence.cases.push({ format, romSha256: hash(rom), pcmSha256: hash(runs[0].blocks), comparedBytes: runs[0].blocks.length, runs: runs.map(({ prepared, frames }) => ({ prepared, frames })) });
  }
  evidence.passed = true;
  console.log('PASS: XM/IT prepared interpolation equals scalar ARM mixing; 16 modulated voices, 31536 Hz, cartridge timing configured');
} finally { fs.writeFileSync(path.join(output, 'evidence.json'), JSON.stringify(evidence, null, 2) + '\n'); }
