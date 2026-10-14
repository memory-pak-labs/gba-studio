# Backgrounds paginados no top-down

Uma sala top-down em Mode 0 pode usar um background com `metadata.kind:
"paged_bg"` e `colorMode: "8bpp-indexed"`. O exportador vincula o atlas por
`paged_source_tiles`, usa o layout `source_asset` e mantém os tiles completos
na ROM. As dimensões da fonte devem coincidir com as dimensões lógicas da sala
em células de 8 × 8; a colisão e os eventos continuam separados da imagem.

O `assetc` permite até 65.535 tiles fonte e reserva 224 cores de BG. Os bancos
14 e 15 permanecem disponíveis para HUD e diálogo. O requisito
`topdown_runtime.paged_background` bloqueia Engine Packs que não implementem
esse consumidor.

| Recurso | Disposição |
| --- | --- |
| Janela de pixels | 31 × 21 slots 8bpp, 41.664 bytes, character block 0 |
| Mapa da janela | 32 × 32 entradas, 2.048 bytes, screenblock 27 |
| UI | Character block 1, tiles 896..1023; início em byte 45.056 |
| Colisão | Grade lógica em ROM; independente do cache visual |

As transferências de slots adjacentes são agrupadas. Mudanças grandes de
câmera recarregam a janela completa. Câmera negativa causada por efeitos na
borda é limitada antes do acesso ao atlas. Ao voltar a uma sala estática, o
runtime restaura o modo 4bpp, o screenblock e o character block da UI.

O BG paginado ocupa o espaço de caracteres de BG2. Não combine esse caminho
com `foreground_tiles` não vazios, affine/bitmap ou compressão de tiles/mapa:
o atlas precisa de acesso direto aos dados. As salas estáticas mantêm o
orçamento de 895 tiles de arte mais o tile transparente; esse limite não foi
aumentado.

Porto Lumen usa o mapa aprovado de 1008 × 688, com 199 cores e 10.609 tiles
fonte. A deduplicação do atlas não muda pixels RGB555. A origem, aprovação,
hashes e autoria da colisão estão em
`apps/desktop-electron/fixtures/asset-provenance/porto-lumen-paged-v16.json`.
O arquivo do fundo anterior permanece na biblioteca do exemplo.

Verificações focadas:

```sh
cd packages/GBAStudioEngine
make paged-background-test
python3 tests/host/assetc_paged_background_tests.py
```

Os testes host cobrem a janela, índices acima de 1023, bordas e reentrada.
O fechamento da integração também exige exportação, `gbsdoctor`, build de ROM,
Editor/Play e comparação de framebuffer no mGBA. Esses checks não comprovam
execução no GBA físico.
