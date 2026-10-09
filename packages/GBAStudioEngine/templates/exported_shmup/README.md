# Exported Shmup Fixture

Template nativo para projetos shoot-em-up exportados pelo GBA Studio usando `gbastudio_engine`.

O projeto empacotado compila fora do repositorio privado usando apenas headers publicos, `lib/libgbastudio_engine.a`, `templates/gba.ld`, `templates/Makefile.gba`, `tools/gbsdoctor` e `tools/gbsbuild`, sem depender do Butano.

Arquivos esperados:

- `main.cpp`
- `shmup_project_data.hpp`
- `gbastudio_project.json`

Este template valida o contrato `gbs::ShmupProjectData` com player, projeteis, waves, inimigos, scripts e dialogue lines. A partir do Engine Pack 1.42.0, tambem restaura/grava `ShmupSaveData` no slot 0 quando `shmup_project.save` gera `save_enabled` e `save_bank`; no 1.43.0, exibe HUD nativo com score, high score, vidas e wave.
