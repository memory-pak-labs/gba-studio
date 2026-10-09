# Exported Point-and-click Fixture

Template nativo para projetos `point_click` exportados pelo GBA Studio ou Electron.

O projeto empacotado compila fora do repositorio privado usando apenas headers publicos, `lib/libgbastudio_engine.a`, `templates/gba.ld`, `templates/Makefile.gba`, `tools/gbsdoctor` e `tools/gbsbuild`, sem depender do Butano.

Arquivos esperados:

- `main.cpp`
- `point_click_project_data.hpp`
- `gbastudio_project.json`

O runtime cobre cenas, hotspots clicaveis, cursor por D-pad, dialogo, scripts de entrada/saida, inventario simples por variaveis, selecao de item com `B`, HUD nativo com cena/item selecionado, hotspots que concedem/exigem item, transicao de cena apos dialogo e autosave de progresso no slot 0.
