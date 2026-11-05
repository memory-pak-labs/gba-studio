// Deterministic, generated technical art. No game assets are imported or changed.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import createMGBA from '../static/WebPlayer/player/mgba-core.mjs';
import { readRuntimeTelemetry } from '../static/WebPlayer/player/mgba-direct-player.mjs';
import { encodePngRgba } from './lib/png-icons.mjs';
import { sha256, verifyLinkedRom } from './lib/rom-regression.mjs';

const [packArg, outputArg] = process.argv.slice(2);
assert.ok(packArg && outputArg, 'Usage: smoke-video-budget-states.mjs ENGINE_PACK OUTPUT');
const pack = path.resolve(packArg), output = path.resolve(outputArg);
const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const project = path.join(output, 'project');
fs.mkdirSync(project, { recursive: true });
const pixels = new Uint8Array(128 * 128 * 4);
for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
  const color = ((x >> 3) + (y >> 3)) % 2 ? [240, 80, 16, 255] : [80, 160, 240, 255];
  pixels.set(color, (y * 128 + x) * 4);
}
fs.writeFileSync(path.join(output, 'pattern.png'), encodePngRgba({ width: 128, height: 128, pixels }));

const shmupProject = {
  "assets": { "bg_palettes": ["regular"], "tile_assets": ["regular"] },
  "resource_banks": "asset_pack",
  "initial_wave": 0,
  "player": {
    "position": {
      "x": 112,
      "y": 128
    },
    "size": {
      "x": 16,
      "y": 16
    },
    "speed": 2,
    "fire_cooldown": 8,
    "projectile_offset": {
      "x": 6,
      "y": -4
    },
    "on_fire": []
  },
  "projectile": {
    "size": {
      "x": 4,
      "y": 8
    },
    "velocity": {
      "x": 0,
      "y": -4
    },
    "max_active": 6
  },
  "enemy_projectile": {
    "size": {
      "x": 4,
      "y": 8
    },
    "velocity": {
      "x": 0,
      "y": 2
    },
    "max_active": 8,
    "on_hit_player": [
      {
        "op": "set_variable",
        "variable": 2,
        "value": 1
      }
    ]
  },
  "waves": [
    {
      "name": "budget",
      "start_frame": 0,
      "player_speed": 4,
      "fire_cooldown": 6,
      "next_wave": 1,
      "on_clear": [],
      "on_start": [],
      "enemies": [
        {
          "name": "scout",
          "position": {
            "x": 112,
            "y": 16
          },
          "size": {
            "x": 16,
            "y": 16
          },
          "velocity": {
            "x": 0,
            "y": 0
          },
          "movement": "linear",
          "health": 1,
          "score": 100,
          "fire_interval": 0,
          "projectile_offset": {
            "x": 6,
            "y": 12
          },
          "on_destroy": []
        }
      ],
      "resource_bank_group": "scene_budget"
    },
    {
      "name": "next",
      "start_frame": 0,
      "player_speed": 4,
      "fire_cooldown": 6,
      "next_wave": -1,
      "on_clear": [],
      "on_start": [],
      "enemies": [
        {
          "name": "scout",
          "position": {
            "x": 16,
            "y": 16
          },
          "size": {
            "x": 16,
            "y": 16
          },
          "velocity": {
            "x": 0,
            "y": 0
          },
          "movement": "linear",
          "health": 99,
          "score": 100,
          "fire_interval": 0,
          "projectile_offset": {
            "x": 6,
            "y": 12
          },
          "on_destroy": []
        }
      ],
      "resource_bank_group": "scene_budget"
    }
  ],
  "background": 0,
  "composition": {
    "enabled": false
  },
  "backgrounds": [
    {
      "name": "Afim",
      "width_tiles": 90,
      "height_tiles": 20,
      "layers": [],
      "video": {
        "display_mode": 1,
        "affine": {
          "asset": "floor",
          "layer": "BG2"
        }
      }
    },
    {
      "name": "Regular",
      "layers": [
        {
          "layer": "BG2",
          "tilemap": "regular",
          "scroll": { "x": 0, "y": 0 }
        }
      ]
    }
  ]
};
const manifest = {
  schema: 1, backend: 'gbastudio_engine', kind: 'shmup', runtime_profile: 'shmup',
  template_dir: path.join(pack, 'templates/exported_shmup'), entry: 'main.cpp', project_data: 'shmup_project_data.hpp',
  generated_assets: ['floor.hpp', 'regular.hpp'], build: { target: 'video_budget_states', make_target: 'all' },
  scene_contracts: [{ name: 'budget', runtime_profile: 'shmup' }], shmup_project: shmupProject,
  asset_pack: { assets: [['floor', 'affine_bg'], ['regular', 'bg']].map(([name, kind]) => ({
    id: name, name, kind, png: path.join(output, 'pattern.png'), header: name + '.hpp', symbol: name, bank_group: 'scene_budget'
  })) }
};
const source = path.join(output, 'export_project.json');
fs.writeFileSync(source, JSON.stringify(manifest, null, 2));
function command(tool, args, log) {
  const result = spawnSync(process.env.GBA_STUDIO_PYTHON ?? (process.platform === 'win32' ? 'python' : 'python3'),
    [path.join(pack, 'tools', tool), ...args], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, timeout: 600_000 });
  fs.writeFileSync(path.join(output, log), (result.stdout ?? '') + (result.stderr ?? '') + (result.error ? String(result.error) : ''));
  assert.equal(result.status, 0, tool + ' failed; see ' + path.join(output, log));
}
command('assetc', [source, '--export-project-json', '-o', project], 'assetc.log');
fs.copyFileSync(source, path.join(project, 'export_project.json'));
command('gbsbuild', ['--engine-pack', pack, '--project-dir', project], 'build.log');
const build = path.join(project, 'build');
const romPath = path.join(build, 'video_budget_states.gba'), rom = fs.readFileSync(romPath);
const receipt = verifyLinkedRom({ romPath, reportPath: path.join(build, 'rom_build_report.json'), enginePack: pack });
const plan = JSON.parse(fs.readFileSync(path.join(project, 'asset_pack_report.json'))).scene_video_layouts.plans[0];
assert.deepEqual(plan.video_states.map(s => s.plan.display_mode), [1, 0]);
// A regular scene entered directly is the visual reference for the transition.
const referenceProject = path.join(output, 'regular-reference');
const referenceSource = path.join(output, 'regular-reference.json');
manifest.shmup_project.initial_wave = 1;
fs.writeFileSync(referenceSource, JSON.stringify(manifest, null, 2));
command('assetc', [referenceSource, '--export-project-json', '-o', referenceProject], 'reference-assetc.log');
fs.copyFileSync(referenceSource, path.join(referenceProject, 'export_project.json'));
command('gbsbuild', ['--engine-pack', pack, '--project-dir', referenceProject], 'reference-build.log');
const wasm = new WebAssembly.Module(fs.readFileSync(path.join(app, 'static/WebPlayer/player/mgba-core.wasm')));
const makeCore = () => createMGBA({ print() {}, printErr() {}, instantiateWasm(imports, done) {
  const instance = new WebAssembly.Instance(wasm, imports); done(instance); return instance.exports;
} });
const core = await makeCore();
const report = { ok: false, romSha256: sha256(rom), receipt, controlsOnly: true, physicalGba: false, frames: [] };
const run = (count, keys = 0, active = core) => { active._gba_set_keys(keys); for (let i = 0; i < count; i++) active._gba_run_frame(); };
function capture(label, active = core) {
  const rgba = active.HEAPU8.slice(active._gba_framebuffer(), active._gba_framebuffer() + 153600);
  for (let i = 3; i < rgba.length; i += 4) rgba[i] = 255;
  fs.writeFileSync(path.join(output, label + '.png'), encodePngRgba({ width: 240, height: 160, pixels: rgba }));
  // This patch contains only background, away from HUD, enemies and shots.
  const background = new Uint8Array(96 * 48 * 4);
  for (let y = 0; y < 48; y++) for (const [region, x] of [32, 160].entries()) {
    background.set(rgba.subarray(((y + 64) * 240 + x) * 4, ((y + 64) * 240 + x + 48) * 4), (y * 96 + region * 48) * 4);
  }
  const frame = { label, telemetry: readRuntimeTelemetry(active), mode: active._gba_audio_register(0x04000000) & 7,
    bg2: active._gba_audio_register(0x0400000c), rgbaSha256: sha256(rgba), backgroundSha256: sha256(background),
    regularTileSample: Array.from({ length: 32 }, (_, i) => active._gba_audio_register(0x06000020 + i * 2) & 65535),
    regularMapSample: Array.from({ length: 4 }, (_, i) => active._gba_audio_register(0x0600a000 + i * 2) & 65535) };
  report.frames.push(frame); return frame;
}
try {
  assert.equal(core._gba_init(), 1);
  const pointer = core._malloc(rom.length); core.HEAPU8.set(rom, pointer);
  assert.equal(core._gba_load_rom(pointer, rom.length), 1); core._free(pointer);
  run(60);
  const affine = capture('affine');
  assert.equal(affine.mode, 1); assert.equal((affine.bg2 >> 8) & 31, 0); assert.equal((affine.bg2 >> 2) & 3, 2);
  // Defeat the aligned enemy through the real fire input to advance the wave.
  run(180, 1); run(10);
  const regular = capture('regular');
  assert.equal(regular.telemetry.currentRoom, 1, 'wave advanced by shooting');
  assert.equal(regular.mode, 0);
  assert.equal((regular.bg2 >> 8) & 31, 20, 'regular map restored to SBB20');
  assert.equal((regular.bg2 >> 2) & 3, 0, 'regular tiles restored to CBB0');
  assert.equal((regular.bg2 >> 7) & 1, 0, 'regular tiles restored to 4bpp');
  assert.ok(plan.video_states[1].plan.resources.screenblocks.some(r => r.start === 20 && r.count >= 1));
  const reference = await makeCore();
  try {
    const referenceRom = fs.readFileSync(path.join(referenceProject, 'build/video_budget_states.gba'));
    assert.equal(reference._gba_init(), 1);
    const pointer = reference._malloc(referenceRom.length); reference.HEAPU8.set(referenceRom, pointer);
    assert.equal(reference._gba_load_rom(pointer, referenceRom.length), 1); reference._free(pointer);
    run(60, 0, reference);
    const direct = capture('regular-reference', reference);
    assert.equal(direct.mode, 0); assert.equal(direct.telemetry.currentRoom, 1);
    assert.equal(regular.backgroundSha256, direct.backgroundSha256, 'regular background pixels restored after affine map overwrote CBB0');
    report.backgroundPixelsVerified = true;
  } finally { reference._gba_destroy(); }
  report.ok = true;
} finally {
  core._gba_destroy(); fs.writeFileSync(path.join(output, 'verification.json'), JSON.stringify(report, null, 2));
}
console.log('PASS: affine to regular SHMUP transition, native controls and budget states agree');
