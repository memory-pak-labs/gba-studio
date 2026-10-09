# Exported Visual Novel Fixture

Template nativo para projetos `visual_novel` exportados pelo GBA Studio ou Electron.

O projeto empacotado compila fora do repositorio privado usando apenas headers publicos, `lib/libgbastudio_engine.a`, `templates/gba.ld`, `templates/Makefile.gba`, `tools/gbsdoctor` e `tools/gbsbuild`, sem depender do Butano.

Arquivos esperados:

- `main.cpp`
- `visual_novel_project_data.hpp`
- `gbastudio_project.json`

O runtime cobre cena, texto, choices condicionais por variavel, scripts de entrada/saida, script por escolha, destino de cena por escolha, historico simples com `B`, HUD nativo de cena/historico, autosave de progresso no slot 0 e avanco por botao. Arte de personagem, composicao de sprites e menus de save entram em etapas posteriores.
