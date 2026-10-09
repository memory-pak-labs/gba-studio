# Exported Dungeon Crawler Template

Runtime nativo em grade para cenas `dungeonCrawler`.

- Compila fora do repositório usando headers públicos, `lib/libgbastudio_engine.a`, `templates/gba.ld`, `templates/Makefile.gba`, `tools/gbsdoctor` e `tools/gbsbuild`, sem depender do Butano.

- Direcional esquerda/direita: giro de 90 graus.
- Direcional cima: passo à frente com colisão.
- Direcional baixo: passo para trás quando permitido.
- Renderização em primeira pessoa respeitando `view_distance`.
