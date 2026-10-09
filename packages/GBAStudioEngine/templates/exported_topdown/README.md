# Exported Top-down Fixture

Este template representa a saida esperada de um exportador futuro do GBA Studio para o backend `gbastudio_engine`, sem depender do Butano.

O projeto empacotado deve ser compilavel fora do repositorio privado usando apenas:

- `include/`
- `lib/libgbastudio_engine.a`
- `templates/gba.ld`
- `templates/Makefile.gba`
- `tools/gbsdoctor`
- `tools/gbsbuild`

Arquivos esperados no projeto exportado:

- `main.cpp`
- `gbastudio_project_data.hpp`
- `player_sprite_asset.hpp`
- `gbastudio_project.json`
