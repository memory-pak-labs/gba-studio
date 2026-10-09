# Exported World Map Template

Template nativo inicial de mapa mundial para projetos exportados pelo GBA Studio.

- Compila fora do repositorio privado usando headers publicos, `lib/libgbastudio_engine.a`, `templates/gba.ld`, `templates/Makefile.gba`, `tools/gbsdoctor` e `tools/gbsbuild`, sem depender do Butano.
- Usa `gbs::WorldMapProjectData`.
- Move o cursor entre nos conectados com o D-pad.
- Executa scripts de foco/selecao e mostra dialogo.
- Diferencia nos abertos, bloqueados e ocultos por variavel.
- Restaura/grava progresso quando `world_map_project.save` gera `save_enabled`.
- Exibe HUD nativo com nome do no focado e status ou destino de fase.
