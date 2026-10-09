# Exported Isometric Fixture

Este template representa a saida esperada de um exportador futuro do GBA Studio para um projeto `isometric` usando o backend `gbastudio_engine`, sem depender do Butano.

O projeto empacotado deve ser compilavel fora do repositorio privado usando apenas:

- `include/`
- `lib/libgbastudio_engine.a`
- `templates/gba.ld`
- `templates/Makefile.gba`
- `tools/gbsdoctor`
- `tools/gbsbuild`

Arquivos esperados no projeto exportado:

- `main.cpp`
- `isometric_project_data.hpp`
- `gbastudio_project.json`
