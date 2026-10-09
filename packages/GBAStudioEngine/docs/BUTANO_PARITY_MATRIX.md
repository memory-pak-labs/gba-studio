# Matriz de Paridade Butano

Status usado nesta matriz:

- `OK`: existe API, capability, teste, exemplo ou smoke empacotado.
- `Parcial`: existe base funcional, mas ainda falta profundidade de producao.
- `Faltando`: ainda nao implementado na GBAStudio Engine.
- `Nao planejado agora`: fora do objetivo atual da engine.

Referencia auditada em 2026-07-18: Butano 21.7.1 (`112a1827c9c6d9e6041a7e93e66f04c4561a6415`).
A meta continua sendo paridade de capacidade e robustez, nao compatibilidade de API.

O parametro principal de prontidao agora e o projeto completo do GBA Studio em
`apps/desktop-electron/default-assets/templates/exemplo-gba/exemplo-gba.gba-project`.
Exemplos, fixtures reduzidas, production smoke e stress ROMs sao evidencias
subsidiarias para diagnosticar uma falha do projeto completo; nao fecham
readiness isoladamente.

| Area | Status | Evidencia local | Proximo passo |
| --- | --- | --- | --- |
| Core/loop de frame | Parcial | `gbs::init` inicializa hardware, render, DMA e audio; `gbs::wait_vblank` atualiza audio uma vez por frame antes de sincronizar VBlank via `VBlankIntrWait` e descarregar DMA; `RuntimeServices` e `RuntimeFrameContext` centralizam inicializacao e dispatch por frame no runtime mixed; `hardware_core_tests` e `runtime_orchestration_tests` validam ordem e cardinalidade | Medir ticks reais de CPU/VBlank, frames perdidos, politica explicita de frame skip e snapshot central de input em mGBA/hardware. |
| Render tiled/BGs | OK | `render_runtime`, `background_tilemaps`, `render_runtime_tests`, `assetc --lz77-tiles`, `assetc --lz77-palette`, `assetc --huffman-tilemap`, `assetc --huffman-tiles`, `assetc --huffman-palette` | Stress de VRAM por tileset grande em mGBA/hardware real. |
| Render avancado | Parcial | affine BG/OBJ, bitmap, blending, mosaic e windows estao integrados; HBE e raster affine compartilham dispatcher interno HBlank com handles estaveis, prioridade e lifecycle independente | Validar custo/frame accuracy dos efeitos por scanline no mGBA e hardware. |
| Sprites/OAM | OK | metasprites, animacao, OBJ priority/window/mosaic, OBJ 4bpp/8bpp, OAM shadow com dirty range, overflow detection com contagem (`oam_overflow_count`) | Stress `sprites_oam_heavy` em hardware real. |
| Audio | Parcial | PSG, PCM assinado, WAV, MOD/S3M/VGM, mixer e atualizacao central estao integrados; `AudioEngineState` e apenas uma facade experimental sem playback proprio | Consolidar a facade com o mixer real e expor telemetria estruturada de underrun/custo no Play. |
| Input | OK | `gbs/input.hpp`, `topdown_basic`, latch/consumidor de IRQ de keypad, input advanced (repeat detection com initial delay + rate, combos pressed/held/repeated) | Cobrir combos por genero quando necessario. |
| Timers | OK | `gbs/timer.hpp`, `hardware_core_tests` | Stress com IRQ/timer em hardware real. |
| DMA | OK | `dma_copy16/32`, fila VBlank, stats | Stress de fila cheia e uploads por room. |
| IRQ | OK | VBlank/timer/keypad dispatch, `VBlankIntrWait`, latch consumivel de keypad, deferred work queue (16 entries FIFO) para deferir trabalho pesado do ISR | Validar cenarios agressivos no mGBA/hardware real. |
| Assets | Parcial | `assetc`, pack JSON schema 11, schema publico `asset_pack_report`, export JSON, incremental, budgets, `production_profile`, relatorios por asset/pool/room/template, split/compressao RLE/LZ77/Huffman e OBJ 8bpp | Validar heuristicas em projetos reais maiores. |
| Memoria/VRAM | Parcial | `ResourceBank`, cache, grupos, streaming, usage report, prefetch por distancia da camera com upload por DMA, staging e mixer PCM em EWRAM, `resource_pool_readiness` com gates de perfil | Validar fragmentacao/fallback em mGBA/hardware e matriz de stress. |
| Build/CLI | OK | `gbsbuild`, `gbsdoctor`, `production_smoke`, `validate-public-schema auto`, `list-public-schemas`, `write-public-schema-catalog`, `verify-public-schema-catalog` e readiness por pool com SHA-256 e schema proprio para projeto/export/asset/readiness | Fazer o gate do projeto completo consumir esses diagnosticos; manter `stress_projects` como isolamento de falhas. |
| Save/backup | Parcial | `SaveBank` e envelopes multi-genero continuam sem heap; `SaveBackend` permite configurar capacidade, granularidade e callbacks para SRAM, Flash ou EEPROM em host, enquanto `info.hpp` mantem o dispositivo fisico desconhecido como `UnsupportedDevice` | Validar framing/protocolo Flash e EEPROM em hardware real antes de habilitar autodeteccao ou declarar suporte fisico. |
| Templates | OK | top-down, platformer, isometric, Point-and-click v4 com inventario/save/HUD, Shoot-em-up v4 com score/high score/save/HUD, Visual Novel v4 com choices condicionais/save/HUD, Menu/UI v4 com stack/condicoes/toggle/slider/save/HUD, Cutscene v4 com branch/skip/wait/save/HUD e World Map v4 com nos condicionais/bloqueados/escondidos, save e HUD de status exportados em `enginepack.json` | Provar os runtimes juntos na ROM mixed do projeto completo antes de ampliar cada template isoladamente. |
| Exemplos | Parcial | exemplos basicos, production smoke, stress ROMs verificaveis por `smoke_mgba --stress` e evidencias parciais `readiness_evidence` para smoke mGBA manual, hardware/CI e rollout privado da engine primaria | Usar ROMs isoladas para reproducao e stress depois que o projeto completo identificar o gargalo. |
| Docs | Parcial | README, roadmap, smoke, integration, Electron | Manter esta matriz sincronizada por release. |
| Integracao GBA Studio | Parcial | `smoke:exemplo-template` cobre autoria, persistencia, export mixed, build da ROM e Play Window do projeto completo; a fronteira Electron agora rejeita build sem ROM materializada e publica o artefato no root do projeto antes de abrir o Play | Executar o smoke completo e confirmar materializacao, abertura do Play e consumo da telemetria; `verify-stress` e mGBA complementam a decisao. |
| Multiplayer/Link | Parcial | SIO Normal 8/32-bit e Multiplayer 2-4 jogadores usam a fronteira `gbs_hw`, SIOMULTI0..3, ID e mascara derivados do hardware | Validar sincronizacao com duas instancias no mGBA multiplayer e depois com 2+ GBAs/link cable; IRQ non-blocking permanece pendente. |
| Rumble | Experimental | Timer e eventos usam `RumbleProvider`; sem provider explicito o recurso permanece indisponivel e nao escreve em enderecos de cartucho desconhecido | Implementar providers apenas para hardware/cartuchos identificados e valida-los fisicamente. |
| Pseudo-3D | Parcial | A cena de racing possui contrato autoravel, preview do editor, exportacao de panorama/chao/minimapa e runtime affine com raster por scanline; `pseudo_3d.hpp` continua sendo um utilitario de estrada independente | Unificar o utilitario de estrada com o contrato racing e medir frame rate no mGBA Web. |
| Containers STL-like | API | `Optional<T>`, `FixedString<N>`, `Vector<T,N>` sem heap, cobertos por testes | Adotar em contratos novos quando reduzirem duplicacao; nao e recurso autoravel. |
| Typewriter | API | Utilitario UTF-8 coberto por testes; o dialogo de producao ainda usa seu reveal paginado proprio | Consolidar com `DialogueState` antes de declarar integracao ao runtime. |
| Compatibilidade Butano API | Nao planejado agora | engine própria independente | Paridade de capacidade, nao API identica. |

## Pendencias remanescentes desta auditoria

- A camada BIOS cobre `Div`, `DivArm`, `Sqrt`, `IntrWait`, `VBlankIntrWait`,
  `BiosChecksum`, `SoundBiasChange`, `CpuSet`, `CpuFastSet`, `BitUnPack`,
  `LZ77UnCompWRAM/VRAM`, `HuffUnComp`, `RLUnComp` e `Diff8/16bitUnFilter`.
  Os caminhos host validam headers, alinhamento, limites e decodificam os
  formatos; no GBA os wrappers chamam os SWIs correspondentes. Reset,
  SoundDriver e MultiBoot não são expostos porque exigem estado global,
  estruturas externas ou podem interromper/destruir o runtime ativo.
- Transformações affine podem ser amostradas com keyframes monotônicos e
  `Easing`, sem `float`; `set_affine_sprite_transform_at_frame` e
  `set_affine_bg_transform_at_frame` aplicam o resultado aos registradores
  existentes. O contrato top-down aceita `affine_obj.keyframes` com matriz
  8.8 por frame e o runtime de exemplo as consome com o contador global.
- Save Flash/EEPROM agora possui backend de runtime configuravel para host e
  testes de geometria/operacoes. A API publica as capacidades conhecidas e
  bloqueia inferencia/probe inseguro; o protocolo fisico continua pendente.
- O panning PCM e o roteamento FIFO A/B foram implementados e cobertos por
  contrato de fonte, mas a validacao audivel em mGBA/hardware permanece aberta.
- O panning do PSG aceita `pan` em SFX, musica e tracker; como o hardware
  oferece enable por canal, a implementacao usa roteamento discreto por lado
  e mantem a validacao audivel em mGBA/hardware como evidencia pendente.
- Multiplayer 2-4 jogadores usa o modo SIO dedicado e permanece pendente de
  validacao com link cable real ou mGBA multiplayer mode.
- Rumble e opt-in por provider; nao existe deteccao GPIO generica segura.
- HBE presets (water, wave, mode7) implementados; requerem validacao visual
  em mGBA para frame accuracy e custo por scanline. O dispatcher interno
  permite coexistencia de HBE e raster affine, mas o limite fixo de quatro
  callbacks por fonte permanece uma restricao deliberada do runtime.
- A cena racing pseudo-3D ja possui preview, exportacao e template runtime com
  raster affine; o utilitario generico `pseudo_3d.hpp` ainda requer unificacao
  com esse contrato e benchmark em hardware real.

## Gate Para Backend Beta

- `npm run smoke:exemplo-template` passa usando o projeto completo, com edicao,
  save/reopen, export mixed, build de uma unica ROM e abertura da Play Window.
- `npm run audit:functional-parity` passa sem lacuna P0 no app.
- `make test` passa.
- `make verify-package` passa.
- `make verify-stress` passa.
- As ROMs de stress abrem no mGBA.
- O app GBA Studio usa `gbastudio_engine` como backend padrao privado para
  novos projetos, mantendo Butano apenas como fallback manual.
- `gbastudio_engine` so vira backend principal pronto para release quando
  `gbsdoctor --require-primary-ready --json` passar com evidencia real.

## Prioridades Orientadas Pelo Projeto Completo

Estado medido em 2026-07-18: o smoke atravessa a autoria do projeto atual com
20 cenas, 81 assets e 195 eventos, mas a ROM mixed falha no link porque a secao
`.bss` nao cabe em IWRAM. A realocacao do mixer PCM e dos buffers de staging para
EWRAM eliminou esse estouro nos fixtures ARM do Engine Pack: os mapas verificados
em 2026-08-31 mostram `pcm_mix_buffers` em `0x0200....`, `__bss_end` abaixo de
`__stack_bottom` e ROMs geradas para os projetos completos de verificacao. O gate
Electron ainda permanece bloqueado em uma etapa posterior: o smoke nao encontrou
`EngineExport/exemplo/build/exemplo.gba` ao abrir a Play Window. O mesmo fluxo
tambem pode emitir avisos de dispatch de runtime; eles devem ser tratados como
diagnosticos separados da falha de arquivo ausente.

1. Manter verde o fluxo completo de criar, editar, salvar, reabrir, exportar,
   compilar e executar o Exemplo GBA como uma unica ROM mixed.
2. Corrigir a entrega da ROM no smoke Electron e manter o estado estatico
   agregado dos runtimes fora de IWRAM quando o mapa comprovar pressao; depois
   corrigir dispatch incompleto, transicoes, assets, contratos exportados e
   comportamento na Play Window conforme aparecerem no mesmo gate.
3. Medir nele ticks reais de CPU/VBlank, frames perdidos, custo de audio e
   pressao de VRAM; implementar frame skip ou streaming adicional somente com
   evidencia dessa medicao.
4. Implementar affine sprites, HBlank/HDMA, efeitos dinamicos e ciclo de vida de
   recursos conforme lacunas reais do projeto completo, nao por paridade
   abstrata de API.
5. Usar ROMs isoladas e stress projects para reproduzir o subsistema culpado e
   validar a correcao em mGBA/hardware antes de retornar ao gate completo.
