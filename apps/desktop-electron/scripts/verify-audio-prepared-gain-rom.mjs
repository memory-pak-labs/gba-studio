import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import createMGBA from '../static/WebPlayer/player/mgba-core.mjs';

// Compare completed native PCM blocks, before the emulator's output resampler.
const [packArg, outputArg] = process.argv.slice(2);
assert.ok(packArg && outputArg, 'usage: node scripts/verify-audio-prepared-gain-rom.mjs ENGINE_PACK OUTPUT');
const pack = path.resolve(packArg), output = path.resolve(outputArg);
const python = process.env.PYTHON ?? 'python3';
const arm = path.join(process.env.DEVKITARM ?? '/opt/devkitpro/devkitARM', 'bin');
const engine = fileURLToPath(new URL('../../../packages/GBAStudioEngine/', import.meta.url));
const wasmBytes = fs.readFileSync(new URL('../static/WebPlayer/player/mgba-core.wasm', import.meta.url));
const wasm = new WebAssembly.Module(wasmBytes);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
fs.mkdirSync(output, { recursive: true });
execFileSync(python, [path.join(engine, 'tests/host/tracker_multichannel_fixtures.py'), output]);
const evidence = { passed: false, engineLibrarySha256: hash(fs.readFileSync(path.join(pack, 'lib/libgbastudio_engine.a'))), wasmSha256: hash(wasmBytes), cases: [] };
try {
  for (const format of ['mod', 's3m']) {
    const dir = path.join(output, format); fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(path.join(output, `channels.${format}`), path.join(dir, `channels.${format}`));
    fs.writeFileSync(path.join(dir, 'audio.json'), JSON.stringify({ tracker: [{ name: 'song', [format]: `channels.${format}`, loop: true, native_primary_volume: 12 }] }));
    execFileSync(python, [path.join(pack, 'tools/assetc'), path.join(dir, 'audio.json'), '--audio-json', '-o', path.join(dir, 'song.hpp'), '--name', 'channels']);
    fs.writeFileSync(path.join(dir, 'main.cpp'), `#include "gbs/engine.hpp"
#include "gbs/audio.hpp"
#include "song.hpp"
extern "C" { volatile unsigned gain_witness[4] = {}; }
extern "C" int gbs_main() {
    gbs::init();
    const bool prepared = (*reinterpret_cast<volatile uint16_t*>(0x04000130) & 1u) == 0;
    static gbs::PcmAsset samples[channels_song_asset.sample_count];
    for (unsigned i = 0; i < channels_song_asset.sample_count; ++i) {
        samples[i] = channels_song_asset.samples[i];
        if (!prepared) samples[i].native_gain_samples = nullptr;
    }
    auto song = channels_song_asset; song.samples = samples;
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
    fs.writeFileSync(path.join(dir, 'gbastudio_project.json'), JSON.stringify({ schema: 1, backend: 'gbastudio_engine', kind: 'topdown', entry: 'main.cpp', build: { target: 'gain', make_target: 'all' }, requires: { engine_pack: '>=2.27.0', features: ['audio.tracker_pcm_16_channels', 'audio.pcm_prepared_gain'] } }));
    execFileSync(python, [path.join(pack, 'tools/gbsbuild'), '--engine-pack', pack, '--project-dir', dir], { stdio: 'pipe' });
    const rom = fs.readFileSync(path.join(dir, 'build/gain.gba'));
    const symbols = execFileSync(path.join(arm, 'arm-none-eabi-nm'), ['-C', path.join(dir, 'build/gain.elf')], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    const address = name => {
      const line = symbols.split('\n').find(line => line.endsWith(` ${name}`) || line.endsWith(`::${name}`));
      assert.ok(line, `symbol ${name}`); return parseInt(line.split(' ')[0], 16);
    };
    const witness = address('gain_witness'), submitted = address('pcm_submitted_blocks'), buffers = address('pcm_mix_buffers');
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
          assert.equal(count, previous + 1, 'observe every completed PCM block'); previous = count;
          const pcm = Buffer.alloc(528 * 2);
          const base = buffers + ((count - 1) % 2) * 2 * (528 + 32);
          for (let side = 0; side < 2; ++side) for (let sample = 0; sample < 528; sample += 2) pcm.writeUInt16LE(read16(base + side * (528 + 32) + sample), side * 528 + sample);
          blocks.push(pcm);
        }
        assert.equal(blocks.length, 360, 'six seconds of native mixer blocks');
        assert.equal(read32(witness + 12), 1, 'tracker accepted');
        assert.equal(read32(witness + 4), 16, 'all sixteen voices remain active');
        assert.equal(read32(witness + 8), 0, 'no PCM underruns');
        runs.push({ prepared, frames: read32(witness), blocks: Buffer.concat(blocks) });
      } finally { core._gba_destroy(); }
    }
    assert.deepEqual(runs[1].blocks, runs[0].blocks, 'prepared and live gain produce byte-identical PCM on ARM');
    assert.ok(runs.every(run => run.frames >= 350), 'full video cadence in isolated audio ROM');
    evidence.cases.push({ format, romSha256: hash(rom), pcmSha256: hash(runs[0].blocks), comparedBytes: runs[0].blocks.length, runs: runs.map(({ prepared, frames }) => ({ prepared, frames })) });
  }
  evidence.passed = true;
  console.log('PASS: MOD/S3M prepared gain equals live ARM mixing; 16 voices, 31536 Hz, zero underruns, cartridge timing configured');
} finally { fs.writeFileSync(path.join(output, 'evidence.json'), JSON.stringify(evidence, null, 2) + '\n'); }
