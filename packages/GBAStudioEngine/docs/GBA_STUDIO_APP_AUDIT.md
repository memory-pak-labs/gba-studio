# Auditoria Do App GBA Studio Para Integracao Futura

Data: 2026-06-02

Esta auditoria registra o impacto das alteracoes atuais do app GBA Studio no contrato futuro do backend `gbastudio_engine`. Nenhum arquivo do app foi alterado nesta etapa.

## Resultado

As alteracoes do app nao bloqueiam o desenvolvimento paralelo da engine. Elas mudam, porem, o melhor ponto de acoplamento para a integracao futura: o exportador deve usar os modelos normalizados do app, especialmente `RoomRuntimeSpec`, em vez de ler diretamente todos os detalhes de `GBAProjectDocument`.

## Fontes Do App Auditadas

- `Sources/GBAStudio/Domain/RoomRuntimeSpec.swift`
- `Sources/GBAStudio/Domain/ProjectModels.swift`
- `Sources/GBAStudio/Domain/EventModels.swift`
- `Sources/GBAStudio/Domain/DialogueModels.swift`
- `Sources/GBAStudio/Domain/AudioModels.swift`
- `Sources/GBAStudio/Domain/SceneCameraMode.swift`
- `Sources/GBAStudio/Domain/EditorTypes.swift`
- `Sources/GBAStudio/Extensions/StudioModel+Export.swift`

## Campos Relevantes Para Export

### Rooms

O app agora normaliza cada room com:

- `id`, `name`, `width`, `height`;
- `music`;
- `cameraMode`;
- `backgroundAssetName`;
- `backgroundRenderMode`;
- `sceneType`;
- `parallax`;
- modo de video e affine BG2/BG3;
- modos bitmap 3/4/5;
- blending/window0/window1/OBJ window/mosaic basicos;
- compressao de tilemap bruta/RLE/LZ77;
- prioridades BG/OBJ;
- `cameraBounds`;
- `tilemap`;
- `collisionMap`;
- `collisionTypes`;
- `heightMap`, `slopeMap` e grid isometrico para fases futuras;
- atores, triggers, player spawn e scripts de cena.

Para a engine v0.x, o backend futuro deve aceitar `sceneType == topdown` como caminho principal. Outros tipos (`platformer`, `isometric`, `pointAndClick`, `shmup`, `scene`) devem ser preservados no manifesto/diagnostico, mas podem ser reportados como fora de escopo ate a engine implementar runtimes correspondentes.

### Tile Layers E Backgrounds

`SceneTileLayer` usa mappings `BG3`, `BG2`, `BG1`, `BG0`, com `BG2` como camada padrao de pintura. O exportador `gbastudio_engine` deve transformar essas camadas em `TopDownBackgroundData` por layer, preservando:

- ordem de prioridade visual;
- tiles vazios como transparencia/logica de nao sobrescrever;
- dimensoes 32x32, 64x32, 32x64 ou 64x64 quando couber no formato GBA atual;
- fallback para tilemap composto quando o projeto nao tiver camadas explicitas.

### Camera E Bounds

O app aceita camera `followPlayer`, `fixedCenter` e `fixedTile(x, y)`, alem de `CameraBoundsSettings`. O contrato da engine precisa mapear:

- `followPlayer` para `TopDownCameraMode::Follow`;
- `fixedCenter` para `TopDownCameraMode::Fixed` centralizado na area valida;
- `fixedTile` para posicao em pixels baseada no tile informado;
- `cameraBounds` para limites de scroll da room quando a engine expuser bounds completos.

Atualizacao v0.21: `TopDownRoomMetadata` agora carrega bounds de camera em pixels. O exportador futuro deve converter `CameraBoundsSettings` de tiles para pixels antes de gerar `gbastudio_project_data.hpp`.

### Atores

`ActorDocument` agora carrega:

- `name`, `sprite`, tile X/Y;
- `direction`;
- `animationName`;
- `collisionGroup`;
- `movementSpeedPreset`;
- `animationSpeedPreset`;
- bindings por slot (`onStart`, `onUpdate`, `onHitActor`, `onHitPlayer`, grupos 1-3);
- `eventName` legado usado como interacao migrada.

Atualizacao v0.22: o contrato da engine preserva direcao, grupo de colisao, velocidade em porcentagem e slots de script, e o runtime aplica comandos basicos de ator. Estado de animacao nomeado ainda precisa ser resolvido pelo exportador para ponteiros `SpriteAnimation`/`MetaSprite` gerados ou indices de animacao.

### Triggers

Atualizacao v0.21: `TopDownTriggerData` cobre area, evento de entrada, evento de saida, `runOnce`, cooldown e tipo (`standard`, `water`, `damage`). Condicao existe como script reservado, mas a semantica completa de condicao textual do app ainda precisa do compilador de eventos.

### Eventos

`TypedEventCommand` ja representa comandos muito alem do bytecode atual da engine. O backend futuro deve compilar uma subset inicial:

- dialogo: `drawText`, `showDialogue`, `closeDialogue`;
- audio: `playMusic`, `playSFX`, `stopMusic`;
- cena: `changeScene`, camera basica e waits simples;
- ator: comandos essenciais de visibilidade, posicao, direcao e animacao;
- variaveis/flags: set, add, compare, clear e branches;
- controle: wait, stop, call event simples.

Comandos fora da subset devem entrar no relatorio de export como `previewOnly`, `stub` ou `unsupported`, reaproveitando a ideia de safety review do app.

### Dialogos

Atualizacao v0.23: `DialogueEntry` com choices pode ser mapeado para `TopDownDialogueChoiceData` quando bastarem opcoes estaticas e resultado em variavel. O exportador deve resolver `dialogueKey -> indice`, escolher texto traduzido quando configurado e limitar/diagnosticar menus que excedam a capacidade visual atual.

### Audio

`AudioItem` possui audio composto/importado, `kind`, `format`, `assignedScene`, loop, BPM, instrumentos, canais, patterns e order. A engine v0.x suporta PSG programatico via `SfxAsset` e `MusicAsset`. O exportador futuro deve:

- mapear composicoes simples para PSG JSON/assetc;
- aceitar `SFX` e `Musica` por nome/exportID;
- converter WAV/PCM, samples MOD/S3M com loop points, tracker JSON, MOD ProTracker subset com volume/finetune, tempo, arpeggio/slides/portamento/vibrato/tremolo aproximados e pattern jump/break, S3M subset com volume de instrumento, volume/speed/tempo/slides/portamento/vibrato/tremolo aproximados e pattern jump/break e VGM SN76489 subset com volume/noise e skips seguros para stereo/data blocks via `assetc --audio-json`, incluindo S3M 8/16-bit mono/stereo nao comprimido normalizado para PCM8, e reportar VGM com chips avancados ou modulos avancados como fora do escopo atual quando nao houver conversor;
- usar `assignedScene` e `ScenaDocument.music` para metadata de room.

### Colisao

O app suporta tipos de colisao: livre, solido, direcionais, agua, dano, escada e slopes. A engine atual usa flags solidas por tile. O primeiro backend deve exportar `blocksMovement == true` como solido e preservar tipos avancados em tabela auxiliar ou diagnostico ate a engine implementar colisao direcional, dano/agua e slopes.

Atualizacao v0.34: a engine suporta solido, bloqueio direcional, agua, dano, escada e slopes diagonais opcionais por tabela `TileSlope`; o `assetc --slope-color-indexes` tambem gera slope maps a partir de PNG.

## Impacto No Contrato Da Engine

O contrato existente esta valido para a baseline top-down, mas deve evoluir antes da integracao formal:

- adicionar tabela de strings/ids para mapear nomes do app para indices gerados;
- expandir eventos para comandos complexos de ator, camera avancada e menus de escolha com branches diretos;
- registrar suporte parcial de collision types avancados;
- manter `RoomRuntimeSpec` como fonte intermediaria recomendada para o exportador.

## Regra De Seguranca

A integracao futura deve continuar lado a lado com Butano. O app atual ainda chama `ButanoExportWriter` no fluxo principal de export; qualquer backend `gbastudio_engine` deve ser adicionado como opcao paralela e consumir somente Engine Pack, `assetc`, `gbsdoctor` e `gbsbuild`.
