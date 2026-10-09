# GBAStudio Engine Exported Cutscene

Template v4 para cutscenes exportadas pelo GBA Studio usando o runtime nativo `gbs::CutsceneProjectData`.

O projeto empacotado compila fora do repositorio privado usando apenas headers publicos, `lib/libgbastudio_engine.a`, `templates/gba.ld`, `templates/Makefile.gba`, `tools/gbsdoctor` e `tools/gbsbuild`, sem depender do Butano.

O template restaura o ultimo save valido no boot e grava automaticamente no slot 0 durante passos temporizados, transicoes de step/cena e skips. A configuracao fica em `cutscene_project.save` no export JSON ou em `save_enabled`/`save_bank` no header C++.

O HUD nativo mostra a cena atual, o step e o contador de frames para smoke visual rapido.

Controles:

- `A` / `Start`: avancar ou pular o passo atual quando `skippable` permitir.
- Passos com `auto_advance` avancam sozinhos apos `duration_frames`.
- Passos com `wait_for_dialogue` aguardam o fechamento da caixa de dialogo antes de continuar.
- Branches por variavel podem redirecionar para outra cena ou outro passo.
