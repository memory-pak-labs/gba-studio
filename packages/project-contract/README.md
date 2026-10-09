# GBA Studio Project Contract

Contrato compartilhado inicial para arquivos `.gba-project`.

## Escopo atual

- Parse de `.gba-project` como objeto JSON.
- Serializacao estavel com indentacao de 2 espacos e newline final.
- Sumario minimo usado por clientes desktop: `schemaVersion`, `name`, contagem de rooms/scenas e assets.
- Preservacao de campos desconhecidos para evitar perda de dados durante a migracao Electron.
- Deteccao explicita do manifesto Swift atual `gbastudio.split-project`, evitando que o Electron trate um `.gbastudio` dividido como projeto monolitico completo durante o Project I/O P0.
- Fixture compartilhada `fixtures/topdown-demo.gba-project` usada como contrato de migracao pelos gates do Electron.
- Gate agregado `validateGBAProjectMigrationContract`, combinando os validators de todos os workspaces com origem da falha por validator.
- Descritores iniciais de schema por workspace (`Arquivos`, `Rooms`, `Sprites`, `Eventos`, `Audio`, `Settings`) com validacao de cobertura dos campos de topo esperados.
- Schema detalhado inicial de `Arquivos`, validando `id`, `name`, `kind` e `metadata.source` em `assets`, alem de `assetGroups` recursivos com referencias para assets existentes.
- Schema detalhado inicial de `Rooms`, validando `name`, `width`, `height`, `tilemap` e `collisions` em `scenas`/`rooms`, alem de `actors` e `triggers` com referencias opcionais para rooms existentes e bounds coerentes com as dimensoes da room.
- Schema detalhado inicial de `Sprites`, validando animacoes e estados em `animations`/`animationStates`, com referencias de `spriteSheet` para assets, `animationIDs` para animacoes existentes e estrutura metasprite de `frames`/`tiles`.
- Schema detalhado inicial de `Audio`, validando `name`, `kind`, `bpm`, `volume`, referencias para assets de audio, `patternOrder` e estrutura tracker de `patterns`/`channels`/`notes` em `audioItems`.
- Schema detalhado inicial de `Eventos`, validando `name`, `category`, formato de `steps`, comandos em `command`/`steps`, `isEnabled` tipado e referencias de `change_scene`, `play_music` e `play_sfx`.
- Schema detalhado inicial de `Settings`, validando as secoes `general`, `build`, `preview`, `audio`, `save` e `debug`, campos centrais, `startScene` contra Rooms, `enginePackPath` obrigatorio para `gbastudio_engine` e dominios seguros para ROM/export, preview, audio e save.

Este pacote e intencionalmente pequeno nesta fase: ele centraliza o contrato de arquivo antes de extrair schemas mais detalhados dos workspaces.
