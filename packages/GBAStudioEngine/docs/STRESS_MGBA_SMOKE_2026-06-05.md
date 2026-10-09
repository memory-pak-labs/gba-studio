# Stress mGBA Smoke - 2026-06-05

Engine Pack: 1.23.0
Emulator: mGBA 0.10.5

## Summary

All six stress ROMs built by `make verify-stress` were opened manually in mGBA.
No white screen, crash, or boot hang was observed. FPS stayed around 59.8-60.4
in the emulator title bar.

## Results

| ROM | Result | Observation |
| --- | --- | --- |
| `stress_topdown_large.gba` | Pass | Room, HUD, player/actor shapes, save label, and dialogue box visible. |
| `stress_platformer_large.gba` | Pass | Platform layout and player shape visible. No boot hang. |
| `stress_isometric_large.gba` | Pass | Isometric-style actor/tile shapes visible. No boot hang. |
| `stress_sprites_oam_heavy.gba` | Pass | Top-down stress screen visible at stable FPS. |
| `stress_tilesets_vram_heavy.gba` | Pass | Top-down stress screen visible at stable FPS. |
| `stress_audio_heavy.gba` | Pass | Initial manual user test reported no audible audio; the stress generator was corrected to include `SfxAsset`, `MusicAsset`, and `PcmAsset` data generated from `audio_heavy.json`. User retest confirmed audible audio. |

## ROM Paths

- `/Users/example/Developer/GBAStudioEngine/build/stress-projects/topdown_large/build/stress_topdown_large.gba`
- `/Users/example/Developer/GBAStudioEngine/build/stress-projects/platformer_large/build/stress_platformer_large.gba`
- `/Users/example/Developer/GBAStudioEngine/build/stress-projects/isometric_large/build/stress_isometric_large.gba`
- `/Users/example/Developer/GBAStudioEngine/build/stress-projects/sprites_oam_heavy/build/stress_sprites_oam_heavy.gba`
- `/Users/example/Developer/GBAStudioEngine/build/stress-projects/tilesets_vram_heavy/build/stress_tilesets_vram_heavy.gba`
- `/Users/example/Developer/GBAStudioEngine/build/stress-projects/audio_heavy/build/stress_audio_heavy.gba`

## Follow-up

- Keep hardware-real validation pending until a physical GBA/flashcart or CI
  hardware target is available.
