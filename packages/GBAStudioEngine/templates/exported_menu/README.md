# GBAStudio Engine Exported Menu

Template v4 para projetos Menu/UI exportados pelo GBA Studio usando o runtime nativo `gbs::MenuProjectData`.

O projeto empacotado compila fora do repositorio privado usando apenas headers publicos, `lib/libgbastudio_engine.a`, `templates/gba.ld`, `templates/Makefile.gba`, `tools/gbsdoctor` e `tools/gbsbuild`, sem depender do Butano.

O template restaura o ultimo save valido no boot e grava automaticamente no slot 0 quando o jogador navega, troca de tela, altera toggles/sliders ou executa itens. A configuracao fica em `menu_project.save` no export JSON ou em `save_enabled`/`save_bank` no header C++.

O HUD nativo mostra a tela atual, o item selecionado e a profundidade da stack de submenu para smoke visual rapido.

Controles:

- `Up` / `Down`: mover selecao.
- `Left` / `Right`: ajustar item do tipo slider.
- `A`: executar item selecionado ou alternar item do tipo toggle.
- `B`: voltar para a tela anterior quando houver stack de submenu.
