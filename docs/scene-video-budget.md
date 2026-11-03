# Orçamento de vídeo compilado por cena

Primeira etapa do radar técnico: núcleo puro e relatório de exportação. O visual,
os assets e os formatos 4bpp/8bpp existentes permanecem iguais.

## Núcleo independente da UI

`apps/desktop-electron/src/shared/sceneVideoBudget.ts` recebe um
`CompiledSceneVideoPlan` com o modo efetivo de vídeo e intervalos compilados.
Não recebe PNGs, dimensões do editor nem estimativas de compressão.

- VRAM e paletas usam offsets e quantidades em **bytes**.
- OAM e screenblocks usam offsets e quantidades em **entradas**.
- Os offsets de VRAM OBJ são relativos à região OBJ disponível naquele modo.
- BG VRAM inclui tiles **e mapas** na mesma região; screenblocks não concedem
  uma segunda reserva de memória.
- Intervalos compartilhados contam uma vez. O fim do endereço também é validado:
  buracos na alocação não permitem ultrapassar a região.
- Campo ausente significa desconhecido; `[]` significa explicitamente sem uso.
- `romAssetBytes` é o payload compilado atribuído à cena. Não equivale ao tamanho
  da ROM inteira nem deve ser somado entre cenas que compartilham assets.

Os limites vêm do [mapa de memória da libtonc](https://gbadev.net/libtonc/group__grpMemmap.htm)
e da seção GBA LCD da [GBATEK](https://mgba-emu.github.io/gbatek/).
Nos modos de tiles, o teto BG/OBJ é 64/32 KiB; em bitmap, 80/16 KiB.
Cada paleta tem 512 bytes; há 128 entradas OAM e 32 screenblocks de 2 KiB
na região de BG tiled. O teto de endereçamento da ROM é 32 MiB.

O resultado separa cobertura (`complete`) e bloqueio (`blocked`). Recursos
conhecidos recebem `ok`, `attention` (80%), `not_recommended` (95%) ou `blocked`
(acima do limite). Recursos sem dados suficientes recebem `unknown`.
Chegar exatamente ao limite é permitido, com recomendação de reduzir pressão.
Os diagnósticos estruturados identificam cena, recurso, consumo, limite e excesso.

## Integração com o compilador atual

`assetPackVideoBudget.ts` converte as alocações do `asset_pack_report.json`:
considera grupos compartilhados/globais, exclui assets omitidos e une intervalos
de paleta compartilhados. Slots OBJ já são unidades de 32 bytes no assetc,
inclusive em 8bpp; não se deve multiplicá-los novamente por 64.

Cada exportação com asset pack grava `scene_video_budget.json` e devolve
`videoBudget` no resultado de exportação e na análise de orçamento. O relatório
é recalculado também em cache hits, antes de retornar sucesso. Um excesso
comprovado de paleta ou OAM bloqueia a exportação com
`SceneVideoBudgetExportError`; o JSON fica disponível para diagnóstico.
Relatórios compilados ausentes, malformados ou com alocações inválidas falham
explicitamente. O veredito derivado de um cache antigo não é aceito como prova.

### Cobertura desta etapa

O assetc atual não fornece o modo **efetivo** de todos os runtimes, a colocação
residente de todos os mapas/screenblocks, nem o tamanho final da ROM vinculada.
O modo solicitado na composição do Editor pode diferir do modo nativo.
Por isso, o adaptador marca:

- VRAM BG, screenblocks, payload ROM por cena e ROM vinculada como pendentes;
- bytes OBJ alocados como conhecidos, mas seu limite dependente do modo como
  pendente;
- paletas e OAM como alocações verificáveis do grupo, sem equivaler a uma medição
  de execução de cada frame.

`complete: false` e `blocked: false` **não aprovam o orçamento físico inteiro**.
Mesmo com o modo desconhecido, ultrapassar o teto de qualquer modo possível
(por exemplo, mais de 32 KiB OBJ) é um excesso comprovado e bloqueia a exportação.
`maximumCapacity` registra esse teto; `capacity: null` mantém o limite efetivo
pendente, sem aplicar recomendações de pressão sobre um modo presumido.
O bloqueio de pools que já existia no assetc continua ativo. Esta etapa acrescenta
um contrato comum testado; não substitui o planejamento residente dos runtimes.

As próximas etapas são emitir esse planejamento no compilador, ligar os bytes
finais da ROM após o linker e apresentar os campos no Editor. O painel atual não
foi redesenhado. A conversão de assets aprovados para 4bpp, a ampliação da matriz
CI e novos testes visuais de ROM não fazem parte deste commit.

## Validação focada

Em `apps/desktop-electron`:

```sh
npx vitest run src/shared/sceneVideoBudget.test.ts src/shared/assetPackVideoBudget.test.ts src/main/sceneVideoBudgetExport.test.ts src/main/engineProjectExport.test.ts src/main/projectBudgetAnalysis.test.ts
npm run build
```

Os testes cobrem limites exatos e excedidos, bitmap, união de intervalos,
compartilhamento de paletas, grupos por cena, entradas inválidas, campos pendentes,
exportação com subprocesso, não promoção de falhas para cache e revalidação de
snapshot íntegro produzido antes da nova checagem.
