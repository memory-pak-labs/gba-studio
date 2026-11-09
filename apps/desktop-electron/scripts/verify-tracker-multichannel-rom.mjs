import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import createMGBA from '../static/WebPlayer/player/mgba-core.mjs';
import { createNativeAudioRecorder } from './lib/native-audio-recorder.mjs';

// A real assetc -> gbsbuild -> ARM ROM -> bundled mGBA PCM regression.
// Run with a freshly built Engine Pack; evidence never enters the repository.
const [enginePackArg, outputArg] = process.argv.slice(2);
assert.ok(enginePackArg && outputArg, 'usage: node scripts/verify-tracker-multichannel-rom.mjs ENGINE_PACK OUTPUT');
const enginePack = path.resolve(enginePackArg), output = path.resolve(outputArg);
const engineRoot = fileURLToPath(new URL('../../../packages/GBAStudioEngine/', import.meta.url));
const python = process.env.PYTHON ?? 'python3';
const devkitArm = process.env.DEVKITARM ?? '/opt/devkitpro/devkitARM';
fs.mkdirSync(output, { recursive: true });
execFileSync(python, [path.join(engineRoot, 'tests/host/tracker_multichannel_fixtures.py'), output]);
const wasm = new WebAssembly.Module(fs.readFileSync(new URL('../static/WebPlayer/player/mgba-core.wasm', import.meta.url)));
const evidence = { passed: false, engineLibrarySha256: hash(fs.readFileSync(path.join(enginePack, 'lib/libgbastudio_engine.a'))), assetcSha256: hash(fs.readFileSync(path.join(enginePack, 'tools/assetc'))), wasmSha256: hash(fs.readFileSync(new URL('../static/WebPlayer/player/mgba-core.wasm', import.meta.url))), cases: [] };
function hash(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function amplitude(samples, frequency, rate) {
  let real = 0, imaginary = 0;
  const step = 2 * Math.PI * frequency / rate;
  for (let i = 0; i < samples.length; i++) {
    const value = samples[i] / 32768 * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (samples.length - 1)));
    real += value * Math.cos(step * i); imaginary += value * Math.sin(step * i);
  }
  return 4 * Math.hypot(real, imaginary) / samples.length;
}
function strongestAmplitude(samples, expected, rate) {
  return Math.max(...[-0.4, -0.2, 0, 0.2, 0.4].map(offset => amplitude(samples, expected + offset, rate)));
}
try {
  for (const format of ['mod', 's3m']) {
    const project = path.join(output, format); fs.mkdirSync(project, { recursive: true });
    fs.copyFileSync(path.join(output, `channels.${format}`), path.join(project, `channels.${format}`));
    fs.writeFileSync(path.join(project, 'audio.json'), JSON.stringify({ tracker: [{ name: 'song', [format]: `channels.${format}`, loop: true }] }));
    execFileSync(python, [path.join(enginePack, 'tools/assetc'), path.join(project, 'audio.json'), '--audio-json', '-o', path.join(project, 'song.hpp'), '--name', 'channels']);
    fs.writeFileSync(path.join(project, 'main.cpp'), `#include "gbs/engine.hpp"
#include "gbs/audio.hpp"
#include "song.hpp"
extern "C" { volatile unsigned tracker_witness[5] = {}; }
extern "C" int gbs_main() {
    gbs::init();
    const auto& original = channels_song_asset;
    gbs::TrackerStep solo_step {};
    const gbs::TrackerPattern solo_pattern { &solo_step, 1 };
    const uint8_t order[] = { 0 };
    const gbs::TrackerAsset solo { &solo_pattern, 1, order, 1, true, original.samples, original.sample_count };
    unsigned previous_stage = 99;
    for (unsigned frame = 0;; ++frame) {
        const unsigned stage = frame < 768 ? frame / 48 : (frame < 1008 ? 16 : 17);
        if (stage != previous_stage) {
            solo_step = original.patterns[0].steps[stage < 16 ? stage : 0];
            solo_step.duration_frames = 255;
            tracker_witness[4] = gbs::play_tracker_music(stage < 16 ? solo : original);
            if (stage == 17) tracker_witness[4] &= gbs::play_pcm_sfx(original.samples[0], 8, 4);
            previous_stage = stage;
        }
        gbs::wait_vblank();
        const auto usage = gbs::audio_runtime_usage();
        tracker_witness[0] = frame + 1;
        tracker_witness[1] = stage;
        tracker_witness[2] = usage.active_voice_count;
        tracker_witness[3] = usage.pcm_underrun_count;
    }
}
`);
    fs.writeFileSync(path.join(project, 'gbastudio_project.json'), JSON.stringify({ schema: 1, backend: 'gbastudio_engine', kind: 'topdown', entry: 'main.cpp', build: { target: `tracker_${format}`, make_target: 'all' }, requires: { engine_pack: '>=2.27.0', features: ['audio.tracker_pcm_16_channels'] } }));
    execFileSync(python, [path.join(enginePack, 'tools/gbsbuild'), '--engine-pack', enginePack, '--project-dir', project, '--devkitarm', devkitArm], { stdio: 'pipe' });
    const romPath = path.join(project, 'build', `tracker_${format}.gba`), rom = fs.readFileSync(romPath);
    const symbols = execFileSync(path.join(devkitArm, 'bin/arm-none-eabi-nm'), [path.join(project, 'build', `tracker_${format}.elf`)], { encoding: 'utf8' });
    const match = symbols.match(/^([0-9a-f]+) [BbDd] tracker_witness$/m); assert.ok(match, 'ROM witness symbol');
    const address = parseInt(match[1], 16);
    const core = await createMGBA({ print() {}, printErr() {}, instantiateWasm(imports, done) { const instance = new WebAssembly.Instance(wasm, imports); done(instance); return instance.exports; } });
    const result = { format, romPath, romSha256: hash(rom), channels: [], mix: [], passed: false }; evidence.cases.push(result);
    try {
      assert.equal(core._gba_init(), 1);
      const pointer = core._malloc(rom.length);
      try { core.HEAPU8.set(rom, pointer); assert.equal(core._gba_load_rom(pointer, rom.length), 1); } finally { core._free(pointer); }
      const read = index => core._gba_audio_register(address + index * 4) >>> 0;
      const chunks = Array.from({ length: 18 }, () => []);
      const recorder = createNativeAudioRecorder(core, output); recorder.select(`tracker-${format}-16-channels`);
      let prior = 0, mixFrames = 0, mixStart = 0, fxFrames = 0, fxStart = 0;
      for (let frame = 0; frame < 1300; ++frame) {
        core._gba_run_frame();
        const gameFrame = read(0), stage = read(1);
        if (!gameFrame) continue;
        assert.equal(read(4), 1, 'ROM accepts exported tracker');
        assert.equal(read(3), 0, 'no PCM underruns');
        if (gameFrame % 48 < 6 && stage < 16) continue;
        assert.equal(read(2), stage < 16 ? 1 : (stage === 16 ? 16 : 17), 'independent active voices');
        const pcm = new Int16Array(core.HEAPU8.buffer, core._gba_audio_samples(), core._gba_audio_sample_count() * 2);
        for (let i = 0; i < pcm.length; i += 2) chunks[stage].push(pcm[i]);
        if (stage === 16 && mixFrames < 240) { if (!mixFrames) mixStart = gameFrame; recorder.frame(); mixFrames++; }
        if (stage === 17) { if (!fxFrames) fxStart = gameFrame; fxFrames++; }
        prior = gameFrame;
        if (mixFrames === 240 && fxFrames === 120) break;
      }
      result.gameFrames = prior; result.mixFrames = mixFrames;
      result.mixGameFrames = fxStart - mixStart;
      result.fxFrames = fxFrames; result.fxGameFrames = prior - fxStart;
      assert.equal(fxFrames, 120, "full music plus SFX keeps advancing");
      assert.ok(result.fxGameFrames >= 117, "music plus SFX maintains frame cadence");
      assert.ok(result.mixGameFrames >= 235, "sixteen voices sustain at least 98% of video-frame cadence");
      assert.equal(mixFrames, 240, 'full sixteen-channel playback keeps advancing');
      result.wav = recorder.stop();
      for (let channel = 0; channel < 16; ++channel) {
        const sampleRate = format === 'mod' ? Math.round(7093789 / ((428 + channel * 8) * 2)) : Math.round(8363 * 2 ** (channel / 12));
        const frequency = sampleRate / 64;
        const solo = strongestAmplitude(chunks[channel], frequency, core._gba_audio_sample_rate());
        const mixed = strongestAmplitude(chunks[16], frequency, core._gba_audio_sample_rate());
        result.channels.push({ channel: channel + 1, frequency, soloAmplitude: solo });
        result.mix.push({ channel: channel + 1, amplitude: mixed });
        assert.ok(solo > 0.001, `channel ${channel + 1} is audible alone (${solo})`);
        assert.ok(mixed > 0.001, `channel ${channel + 1} survives the full mix (${mixed})`);
      }
      result.passed = true;
    } finally { core._gba_destroy(); }
  }
  evidence.passed = true;
  console.log('PASS: MOD/S3M -> assetc -> ARM ROM -> mGBA; sixteen independent voices and PCM frequency checks');
} finally { fs.writeFileSync(path.join(output, 'evidence.json'), JSON.stringify(evidence, null, 2) + '\n'); }
