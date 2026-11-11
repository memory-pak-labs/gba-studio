import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import createMGBA from '../static/WebPlayer/player/mgba-core.mjs';
import { createNativeAudioRecorder } from './lib/native-audio-recorder.mjs';

// Independent scalar oracle checks every emitted FIFO byte across active rate
// changes, including loop seams. A project hook selects a non-default boot rate.
const [packArg, outputArg] = process.argv.slice(2);
assert.ok(packArg && outputArg, 'usage: verify-audio-mixing-rate-rom.mjs ENGINE_PACK OUTPUT');
const pack = path.resolve(packArg), output = path.resolve(outputArg);
fs.mkdirSync(output, { recursive: true });
const source = Array.from({ length: 4096 }, (_, i) => (i * 37) % 121 - 60);
const rates = [10512, 21024, 31536, 10512, 31536, 21024, 31536];
fs.writeFileSync(path.join(output, 'main.cpp'), `#include "gbs/engine.hpp"
#include "gbs/event.hpp"
#include "gbs/audio.hpp"
static const int8_t samples[] = {${source.join(',')}};
static const gbs::PcmAsset sample {samples,4096,8363,true,3,4096};
extern "C" { volatile uint32_t mixing_witness[5] = {}; }
static gbs::EventState event_state __attribute__((section(".ewram_bss")));
extern "C" uint32_t gbs_project_audio_mixing_rate(void) { return 10512; }
extern "C" int gbs_main() {
 gbs::init(); mixing_witness[0]=gbs::audio_mixing_rate_hz();
 gbs::init_event_state(event_state);
 static gbs::TrackerStep note {1,440,255,15,2};
 note.sample_only=true;note.sample_index=0;note.sample_gain=32;note.sample_linear_pan=true;note.pan=20;
 static const uint8_t order[]={0};static const gbs::TrackerPattern pattern {&note,1};
 static const gbs::TrackerAsset song {&pattern,1,order,1,false,&sample,1,true};
 gbs::set_audio_channel_volume(gbs::AudioChannel::Music,12);
 mixing_witness[1]=gbs::play_tracker_music(song);
 const int16_t rates[]={${rates.join(',')}};
 for(unsigned frame=0;;++frame) {
  if(frame && frame%24==0 && frame/24<7) {
   const gbs::EventCommand command {gbs::EventOp::SetAudioMixingRate,rates[frame/24],0,0};
   gbs::run_event_script(event_state,&command,1);
   if(event_state.audio_mixing_rate_changed) {
    gbs::set_audio_mixing_rate(event_state.audio_mixing_rate_hz);
    event_state.audio_mixing_rate_changed=false;
   }
  }
  gbs::wait_vblank();mixing_witness[2]=frame+1;
  mixing_witness[3]=gbs::audio_mixing_rate_hz();
  mixing_witness[4]=gbs::audio_runtime_usage().pcm_underrun_count;
 }
}
`);
fs.writeFileSync(path.join(output, 'gbastudio_project.json'), JSON.stringify({ schema: 1, backend: 'gbastudio_engine', kind: 'topdown', entry: 'main.cpp', build: { target: 'mixing', make_target: 'all' }, requires: { features: ['audio.configurable_mixing_rate'] } }));
execFileSync(process.env.PYTHON ?? 'python3', [path.join(pack, 'tools/gbsbuild'), '--engine-pack', pack, '--project-dir', output], { stdio: 'pipe' });
const arm = path.join(process.env.DEVKITARM ?? '/opt/devkitpro/devkitARM', 'bin');
const symbols = execFileSync(path.join(arm, 'arm-none-eabi-nm'), ['-C', path.join(output, 'build/mixing.elf')], { encoding: 'utf8' });
const address = name => { const line = symbols.split('\n').find(l => l.endsWith(` ${name}`) || l.endsWith(`::${name}`)); assert.ok(line, name); return parseInt(line.split(' ')[0], 16); };
const witness = address('mixing_witness'), submitted = address('pcm_submitted_blocks'), buffers = address('pcm_mix_buffers');
const voice = address('pcm_tracker'), pendingCount = address('pcm_pending_sample_count'), streamCount = address('pcm_stream_sample_count');
const wasm = new WebAssembly.Module(fs.readFileSync(new URL('../static/WebPlayer/player/mgba-core.wasm', import.meta.url)));
const core = await createMGBA({ print() {}, printErr() {}, instantiateWasm(imports, done) { const instance = new WebAssembly.Instance(wasm, imports); done(instance); return instance.exports; } });
const recorder = createNativeAudioRecorder(core, output);
const report = { passed: false, blocks: 0, comparedBytes: 0, rates: [], timerCounters: {}, underruns: 0 };
try {
  assert.equal(core._gba_init(), 1); const rom = fs.readFileSync(path.join(output, 'build/mixing.gba'));
  const pointer = core._malloc(rom.length); core.HEAPU8.set(rom, pointer); assert.equal(core._gba_load_rom(pointer, rom.length), 1); core._free(pointer);
  const read16 = a => core._gba_audio_register(a);
  const read32 = a => (read16(a) | read16(a + 2) << 16) >>> 0;
  const byte = a => (read16(a & ~1) >> ((a & 1) * 8)) & 255;
  let previous = 0, position = 0;
  recorder.select('dynamic-mixing');
  for (let frame = 0; frame < 250 && report.blocks < 168; ++frame) {
    core._gba_run_frame(); recorder.frame();
    const count = read32(submitted); if (!count || count === previous) continue;
    assert.equal(count - previous, 1, 'one block per video frame');
    assert.equal(read32(witness), 10512, 'project hook selects initial rate'); assert.equal(read32(witness + 4), 1, 'tracker accepted');
    const samples = read16(pendingCount), rate = samples / 176 * 10512;
    assert.ok(rates.includes(rate)); if (report.rates.at(-1) !== rate) report.rates.push(rate);
    const step = Math.floor(8363 * 65536 / rate), base = buffers + ((count - 1) % 2) * 2 * 560;
    for (let i = 0; i < samples; ++i) {
      const index = Math.floor(position / 65536), next = index + 1 < 4096 ? index + 1 : 3;
      let value = source[index] + Math.floor((source[next] - source[index]) * (position % 65536) / 65536);
      value = Math.trunc(Math.trunc(value * 32 / 255) * 12 / 15);
      assert.equal(byte(base + i), Math.trunc(value * 107 / 255) & 255, `left block ${count} sample ${i}`);
      assert.equal(byte(base + 560 + i), Math.trunc(value * 148 / 255) & 255, `right block ${count} sample ${i}`);
      position += step; if (position >= 4096 * 65536) position -= 4093 * 65536;
    }
    assert.equal(read32(voice + 4), position, 'source cursor survives the switch');
    assert.ok([176,352,528].includes(read16(streamCount)), 'committed DMA block count');
    if (count > 1) {
      assert.equal(read16(0x04000106) & 128, 128, 'Direct Sound timer stays enabled after the first queued block');
      const committed = read16(streamCount), counter = read16(0x04000104), key = String(committed / 176 * 10512);
      assert.ok(counter >= 65536 - 280896 / committed, 'timer counter stays within the selected reload period');
      const bounds = report.timerCounters[key] ?? { min: 65536, max: 0 };
      bounds.min = Math.min(bounds.min, counter); bounds.max = Math.max(bounds.max, counter); report.timerCounters[key] = bounds;
    }
    report.underruns = read32(witness + 16); assert.equal(report.underruns, 0);
    report.comparedBytes += samples * 2; ++report.blocks; previous = count;
  }
  assert.equal(report.blocks, 168); assert.deepEqual(report.rates, rates);
  // Frame polls share the same timer phase. Counter deltas expose the actual
  // reload periods, rather than trusting the requested rate in engine state.
  for (const [rate, period] of [[10512, 1596], [21024, 798]]) {
    const delta = report.timerCounters[31536].min - report.timerCounters[rate].min;
    assert.ok(Math.abs(delta - (period - 532)) <= 16, `hardware timer period for ${rate}`);
  } report.wav = recorder.stop(); report.passed = true;
  console.log(JSON.stringify(report));
} finally {
  core._gba_destroy(); fs.writeFileSync(path.join(output, 'evidence.json'), JSON.stringify(report, null, 2) + '\n');
}
