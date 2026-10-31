# NPCs de Porto Lumen em 48 px

Capitão, Viajante, Cartógrafo, Pescador mirim e Guardião do farol usam folhas
`porto-*-body48.png`, com quatro quadros de 32 × 48 na ordem baixo, cima,
esquerda e direita. Os adultos têm 47–48 px de altura visível; a criança tem
43–44 px no mesmo canvas. Cada quadro usa dois OBJs (32 × 32 e 32 × 16),
âncora inferior central, colisão de 16 × 16 e streaming de 1536 bytes.

As quatro poses são de repouso. O estado `four_direction` reutiliza a pose
correspondente ao movimento; não há novos ciclos de caminhada nesses cinco
NPCs. Nara e a mecânica conservam suas animações anteriores.

## Desenho e paleta aprovados

Os PNGs v21 aprovados foram copiados byte a byte. A fonte, os hashes, a licença
sob direção do usuário e as duas aprovações estão em
`apps/desktop-electron/fixtures/asset-provenance/porto-lumen-npcs48.json`.
Nenhum pixel de jogo de terceiros foi usado como fonte distribuível.

A paleta inicial de 256 entradas excedia o contrato atual de OBJ do motor,
que preserva bancos para texto, UI e fallback. A alternativa compatível foi
comparada em quatro vistas e em capturas reais da ROM e aprovada explicitamente
pelo usuário: “ok aprovado as paletas compativeis”.

Os cinco assets configuram uma paleta de exportação de 176 entradas RGB555,
com o prefixo de 163 entradas anterior intacto. O exportador reorganiza essas
cores no banco compartilhado, junto à HUD, sem nova quantização implícita.
Essa conversão aprovada altera tons de 6644 dos 17075 pixels opacos nas vinte
poses. Silhueta, alpha e resolução permanecem idênticos. Nara, mecânica e HUD
mantêm seus valores de cor; não confundir a fidelidade ao resultado de paleta
aprovado com identidade de cor ao PNG fonte dos cinco NPCs.

## Escopo e regeneração

Somente os cinco vínculos de Porto Lumen foram substituídos. Posições, eventos,
colisões, BG, HUD e entrada normal da campanha foram preservados. Os sprites,
animações e estados antigos continuam na biblioteca; os que perderam o último
consumidor estão marcados como reutilizáveis. O guardião de Farol Interior
continua com seu sprite anterior.

`promoteApprovedPortoLumenPaged` preserva os vínculos, estados e metadados
aprovados na regeneração do exemplo. O catálogo canônico contém os hashes dos
cinco novos PNGs.

## Verificação

Execute em `apps/desktop-electron`:

```sh
VITEST_MAX_WORKERS=2 npx vitest run scripts/porto-lumen-npcs.test.mjs
npm run audit:p0-sources:strict
npm run gate:complete-project
```

O teste cobre fontes, dimensões, alpha binário, paleta, quatro vistas sem
espelhamento, vínculos, regeneração, exportação 8bpp e streaming. A confirmação
do framebuffer na ROM permanece uma evidência separada dos testes host. O gate
completo valida o exemplo inteiro; hardware físico exige seu próprio teste.

A auditoria de atores aplica a conversão declarada somente quando
`runtimePaletteReviewStatus` é `approved`. Em seguida, compara os pixels RGB555
exatos com o export, sem tolerância adicional de cor. Os hashes RGBA das vinte
poses aprovadas estão na proveniência e têm regressão própria; cores inesperadas
no resultado compilado continuam fazendo a verificação falhar.
