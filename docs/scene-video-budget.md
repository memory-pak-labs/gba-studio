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
Os avisos de pressão usam o total ocupado; o fim do endereço é verificado
separadamente para bloquear um intervalo fora da região. Colocar um mapa no
último screenblock não significa que todos os blocos anteriores estejam ocupados.

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

Após o linker, `gbsbuild` grava `build/rom_build_report.json` com bytes reais,
SHA-256 da ROM, versão do Engine Pack e hash da biblioteca usada. Essa medição
é refeita nas reutilizações verificadas de ROM e de variantes, sem relinkar.
ROMs acima de 32 MiB falham antes da promoção para cache; o relatório registra
o excesso. Um build que falha não mantém um recibo de sucesso anterior.

O aplicativo refaz a análise das alocações compiladas após o build e anexa
`linkedRomBytes` e `linkedRom` ao relatório por cena e ao resumo do build.
Esses campos são globais: o tamanho vinculado não é distribuído entre cenas
que podem compartilhar assets. O hash vem do arquivo materializado, incluindo
quando o build usa um diretório temporário por causa de espaços no caminho.

### Assets de ROM atribuídos à cena

Após o link, gbsbuild lê os objetos do ELF com readelf e associa símbolos dos
assets aos grupos de cena e ao módulo nativo que os contém. Símbolos locais
iguais em módulos diferentes são cópias distintas; objetos inline compartilhados
não pertencem ao último módulo listado no ELF. Aliases e endereços compartilhados
contam uma vez. Tamanhos decimais e hexadecimais do readelf são aceitos.

O recibo inclui sceneRom, com bytes exclusivos/compartilhados por cena, união
atribuída e restante da ROM. O aplicativo confere os hashes da ROM, ELF e
asset_pack_report.json antes de anexar romAssetBytes/romAssets e
romAssetsSummary. A soma de todas as cenas não é o tamanho do jogo.

O escopo é linked_asset_symbols: somente objetos reconhecidos dos assets.
Código, tabelas geradas, padding e cópias sem associação comprovada continuam
no restante não atribuído; não são distribuídos arbitrariamente. A atribuição
fica pendente antes do link e não transforma a cobertura física em completa.

### Plano dos runtimes nativos

O assetc emite `scene_video_layouts` junto ao relatório de alocações. O plano
resolve o modo efetivo do renderer e as reservas de BG e screenblocks nos
caminhos descritos. Ele distingue o modo 1 da corrida com perspectiva, o modo 0
dos runtimes comuns, o cache de viewport dos mapas paginados e as reservas
de interface, mapa e piso afim. As fases de uma cutscene podem compartilhar
os mesmos endereços; o envelope de reservas une esses endereços uma vez.

`nativeLayout.scope` é `reservation_envelope`. As métricas de BG recebem
`basis: native_reservation`; os demais recursos continuam identificados como
alocações de assets (`compiled_allocation`). Isso não é telemetria por frame
nem contagem de todo o atlas ROM como VRAM. A reserva fixa da interface e,
quando aplicável, do bloco afim ou do cache de visão do dungeon também conta.
Reservas adicionais de OBJ/OAM criadas dinamicamente pela interface ainda não
são adicionadas às métricas de assets; o relatório mantém cobertura parcial.

### Cobertura restante

O modo solicitado na composição do Editor pode diferir do modo nativo. O plano
é emitido pelo compilador que conhece o caminho de renderização, em vez de o
Editor presumir que sejam iguais. Caminhos avançados não modelados, como uma
superfície isométrica sem paginação ou certas composições bitmap/afins, mantêm
as reservas correspondentes pendentes e informam a razão em `nativeLayout.notes`.
Nesses casos, o modo efetivo ainda pode ser conhecido, sem aprovar o layout.
O adaptador marca:

- VRAM BG/screenblocks pendentes quando falta plano nativo para aquele caminho;
- assets ROM por cena pendentes antes do link e medidos por símbolos após o build;
- ROM vinculada pendente durante a exportação de fontes e medida após o build;
- bytes OBJ de assets conhecidos, com limite dependente do modo nativo quando
  informado; slots bitmap são relativos à metade superior acessível da VRAM OBJ;
- paletas e OAM como alocações verificáveis do grupo, sem equivaler a uma medição
  de execução de cada frame.

`complete: false` e `blocked: false` **não aprovam o orçamento físico inteiro**.
Mesmo com o modo desconhecido, ultrapassar o teto de qualquer modo possível
(por exemplo, mais de 32 KiB OBJ) é um excesso comprovado e bloqueia a exportação.
`maximumCapacity` registra esse teto; `capacity: null` mantém o limite efetivo
pendente, sem aplicar recomendações de pressão sobre um modo presumido.
O bloqueio de pools que já existia no assetc continua ativo. Esta etapa acrescenta
um contrato comum testado; não substitui o planejamento residente dos runtimes.

## Leitura no Editor

No inspetor da cena, abra **Mais → Orçamento → Analisar orçamento agora**.
A seção **Vídeo compilado** mostra o modo nativo, as reservas de BG e mapas,
as alocações de OBJ, paletas e OAM e a cobertura parcial. Dados ausentes ficam
pendentes. Os cartões distinguem **Reserva nativa** de **Assets compilados**.

Após **Gerar ROM**, a mesma seção apresenta o tamanho total medido do arquivo
final. O resultado só é associado à versão do projeto que iniciou a operação;
trocar de projeto, editar dados ou alterar assets invalida resultados atrasados.
Navegar entre cenas preserva o relatório, pois não altera o conteúdo compilado.
O tamanho total não é apresentado como tamanho individual de cada cena.

As próximas etapas são completar as reservas dinâmicas de OBJ/OAM, ampliar
a atribuição de tabelas geradas e a cobertura dos caminhos avançados. A conversão
de assets aprovados para 4bpp e a ampliação da matriz CI permanecem fora desta etapa.

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
