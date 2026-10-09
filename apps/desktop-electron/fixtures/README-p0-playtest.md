# Electron P0 técnico

Fixture reduzida para testar o contrato técnico de **Play (Cmd/Ctrl+B)** com
rooms, conexão, trigger, eventos, diálogo, choice, sprite, tileset sandbox
top-down (`tiles_topdown_sandbox.png` + tilemap stage_1) e áudio composto.

Esta fixture não é o projeto exemplo nem sustenta o aceite global do editor.
Para o aceite completo, use o template
`default-assets/templates/exemplo-gba/exemplo-gba.gba-project` e o smoke
`npm run smoke:exemplo-template`.

Os comandos `smoke:technical-p0*` são diagnósticos e só devem ser usados para
contratos reduzidos de exportação/runtime. Eles não substituem `smoke:p0` nem
`smoke:p0:scenes`, que são os comandos canônicos do produto.

O E2E técnico exige a marca explícita `--allow-technical-fixture` (já incluída
no script npm) para evitar que a fixture seja usada por engano como aceite P0.

## Abrir no app

```bash
cd apps/desktop-electron
npm run dev:technical-p0
```

Isso regenera `electron-p0-playtest.gba-project` e abre o app com o projeto carregado.

## Teste manual sugerido

1. Confirme **Engine Pack** e **mGBA** em Ajustes > Preview (o fixture ja preenche caminhos locais quando possivel).
2. Clique **Play** na topbar (ou Cmd/Ctrl+B).
3. No emulador, valide:
   - boot da `room_1` com musica/SFX
   - dialogo `intro_001`
   - interacao com o Player → `show_choice`
   - trigger "Door to room 2" → `change_scene room_2`

## Regenerar apenas o arquivo

```bash
npm run materialize:technical-p0
```

Assets ficam em `fixtures/Assets/`; o `.gba-project` em `fixtures/electron-p0-playtest.gba-project`.
