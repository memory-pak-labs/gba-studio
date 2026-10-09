# Exported mixed runtime

Template de ROM que despacha scenes topdown, platformer, isometric, menu, SHMUP, point-and-click, dungeon crawler e corrida no mesmo binario.
Os headers de cada runtime e `mixed_project_data.hpp` sao gerados pelo `assetc`.

O build usa exclusivamente `lib/libgbastudio_engine.a` do Engine Pack e o
`templates/Makefile.gba`, sem depender do Butano ou de runtimes externos.
