# Functional parity audit

Estado auditado em 2026-07-09.

Este documento e a leitura viva de backlog/readiness do app Electron canonico no macOS. A evidencia operacional mais recente e `npm run gate:electron` verde em 2026-07-09, incluindo `npm test`, `npm run smoke:visual`, `npm run smoke:engine-rom`, `npm run audit:real-project -- --strict`, `npm run audit:functional-parity -- --strict` e `git diff --check`.

Conclusao curta: o backlog P0 funcional do Electron/macOS esta fechado para o projeto real/base. O backlog completo do produto ainda nao esta finalizado: agora entram distribuicao macOS, assinatura/notarizacao, stress de projeto real maior, UX fina e backlog P1/P2. Windows e Linux ficam fora do caminho critico ate o app Electron macOS estar pronto para finalizacao/distribuicao.

Regra de fonte: o projeto completo Exemplo GBA em `default-assets/templates/exemplo-gba/exemplo-gba.gba-project` e o P0 canonico e sustenta o aceite de Editor, Preview, Play Window e ROM. A fixture `fixtures/electron-p0-playtest.gba-project` e tecnica, reduzida e diagnostica; ela nao deve ser criada, promovida ou interpretada como um segundo projeto P0 do produto.

## Regra de status

| Status | Criterio |
| --- | --- |
| `funcional` | O fluxo real de uso esta implementado, testado e suficiente para criacao, edicao, preview/export e validacao de projeto base. |
| `funcional mas limitado` | O fluxo base esta verde, mas ainda precisa stress, cobertura de borda ou validacao de release. |
| `parcial` | Ha UI ou logica util, mas ainda falta comportamento essencial, integracao ou cobertura. |
| `ausente` | O fluxo ainda nao existe ou nao foi validado na trilha Electron. |
| `bloqueador` | Impede usar o projeto real/base no app para criar, editar, exportar ou testar um jogo real. |

## Matriz de paridade

| Area | Status | Leitura honesta | Proximo gate |
| --- | --- | --- | --- |
| Shell e arquivos de projeto | `funcional` | O `.app` macOS prova abrir, validar, salvar como `.gba-project`, reabrir, preservar dados e rejeitar manifesto split Swift. | Manter Project I/O P0 no gate permanente. |
| Editor / Rooms | `funcional` | P0 provou room, tilemap, colisao, ator, trigger, conexao, preview e ROM. | Stress com rooms maiores, tilesets autorais e comparacao Preview/ROM em sessoes longas. |
| Eventos | `funcional` | P0 provou evento integrado ao fluxo jogavel, incluindo dialogo/choice/troca de room e comandos OK ROM. | Expandir comandos e validacao contextual sem quebrar `auditPreviewRomParity`. |
| Sprites / Animador | `funcional mas limitado` | Sprite importado/metasprite/idle+walk ja chega na ROM e no Preview; ainda falta stress de sheets maiores, limites OAM/VRAM e polish do animador. | Validar sheets autorais maiores e warnings de hardware. |
| Dialogos | `funcional mas limitado` | Dialogo, choices, speaker, portrait/UI e sons por linha estao ligados ao export/engine no P0. | Exercitar textos maiores, variacoes de UI, retratos/emotes e localizacao. |
| Audio | `funcional mas limitado` | Tracker composto e audio importado entram no contrato/export; falta playtest audivel mais amplo no hardware. | Validar timing, canais, SFX e musica autoral em ROM observavel. |
| Arquivos / Assets | `funcional mas limitado` | Assets sao importados, agrupados e usados por editor/sprites/dialogos/audio/export. | Stress com imagens, tilesets, sprites, audio, fontes e assets quebrados. |
| Ajustes | `funcional` | Settings do P0 refletem em runtime/export/preview. | Manter cobertura ao mexer em presets, paths e plataformas. |
| Exportacao ROM | `funcional` | Projeto autoral/base exporta pelo Engine Pack e gera ROM pelo fluxo atual. | Playtest visual/manual da ROM real-base antes de chamar o projeto de referencia autoral principal. |
| Preview / Playtest | `funcional` | Ha evidencia de preview/playtest rapido e P0 observavel. | Manter smoke visual/preview no gate integrado. |
| macOS `.app` | `funcional mas limitado` | Pacote macOS valida UI P0, Project I/O, preview e gates locais. Distribuicao publica ainda depende de Developer ID/notarizacao. | Fechar assinatura, notarizacao, DMG/ZIP final e smoke no pacote assinado. |
| Windows / Linux | `ausente` para validacao real | Scripts, alvos e CI estao declarados/auditados, mas a decisao atual e adiar validacao real. | Retomar somente na finalizacao, depois do macOS Electron estar pronto. |

## Backlog atual

### Fechado para P0 macOS

1. Projeto novo/base com room, tilemap, colisao, ator, trigger, evento, dialogo, sprite, audio, settings e assets.
2. Salvar, fechar e reabrir preservando dados.
3. Play reconstrói e executa a ROM real diretamente no app Electron.
4. Export Engine Pack e ROM P0/real-base no fluxo atual.
5. Gate `audit:functional-parity -- --strict` verde.
6. Gate `gate:electron` verde no checkout local.

### Proximo foco

1. Gerar/validar release macOS como app final local: pacote assinado, notarizado e verificavel.
2. Rodar smoke do projeto real/base no `.app` final e registrar evidencia.
3. Estressar assets autorais maiores, audio audivel, ROM real-base e limites de hardware.
4. Retomar polish visual fino e UX de criacao depois dos gates funcionais continuarem verdes.
5. Reabrir Windows/Linux somente na etapa de finalizacao cross-platform.

## Criterios de regressao critica

- `npm run audit:functional-parity -- --strict` falhar.
- `npm run gate:electron` falhar.
- Play deixar de reconstruir a ROM ou a ROM perder movimento, colisao, dialogo, acao ou troca de room no P0.
- Export ROM deixar de gerar projeto/ROM pelo Engine Pack.
- `.app` macOS deixar de abrir/salvar/reabrir projeto real/base.

## Relacao com documentos anteriores

`migration-readiness.md` continua valido como registro de evidencias tecnicas. `backlog-priorizado.md` continua sendo a lista de produto, mas deve ser lido com esta regra: P0 funcional macOS esta fechado; P1/P2 e distribuicao publica ainda seguem como backlog aberto.
