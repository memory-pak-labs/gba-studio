# Orçamento de vídeo compilado por cena

Radar técnico: núcleo puro, relatório de exportação e leitura no Editor. O visual,
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

O escopo é linked_asset_symbols: objetos reconhecidos dos assets e prefixos
nativos declarados pelo compilador (interface, superfícies paginadas e atlas do
dungeon). Código, dados sem associação comprovada e padding continuam
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
`basis: native_reservation`. Recursos que unem alocações de assets às reservas
da interface recebem `compiled_and_native`; os demais mantêm
`compiled_allocation`. Isso não é telemetria por frame
nem contagem de todo o atlas ROM como VRAM. A reserva fixa da interface e,
quando aplicável, do bloco afim ou do cache de visão do dungeon também conta.

### Reservas dinâmicas da interface

`dynamic_reservations` descreve arenas nativas de endereços, incluindo paletas,
texto em pixels/compacto, imagens de HUD, campo de nome, teclado, retratos,
relógio e textos de eventos em sobreposição. O HUD padrão de luta também conta.
Texto alinhado que usa BG não recebe tiles de texto OBJ. O HUD avançado ainda
reserva OAM 96..127 porque sua rotina de início limpa toda essa faixa, inclusive
quando só desenha em BG. Scripts chamados
pela cena são percorridos; o relógio habilitado por scripts é tratado como estado
compartilhado. A faixa completa conta quando as rotinas limpam/ocultam seus slots.

Os intervalos são unidos aos assets sem duplicar os mesmos endereços. O modelo
reserva a arena de glyphs 900..1023, as faixas OAM 64..95/96..127 conforme o
renderer e a faixa própria do teclado 40..79. Ícones usam tiles já alocados;
sua reserva dinâmica acrescenta o intervalo OAM. A aba de retrato opt-in ocupa
12 KiB de OBJ e oito entradas OAM. Isso não é um pico de sprites por frame.

Uma sobreposição entre payload OBJ e glyphs privados bloqueia a exportação.
A exceção exige prova compilada de tiles integralmente fora da tela: frame
estático 4bpp, um quadro/OBJ, geometria confirmada pela alocação e sem outro
consumidor na cena. `nonvisible_obj_ranges` não reduz o total alocado; só permite
compartilhar endereços sem pixels visíveis. Reuso visível, outro asset sobreposto,
frames omitidos ou formatos sem essa prova não recebem a exceção. Esse caso
ocorre no canto fora da tela da imagem de chegada em corrida_resultados.
O recorte é reconhecido sem mover, converter ou redesenhar a arte.


### Cobertura restante

O modo solicitado na composição do Editor pode diferir do modo nativo. O plano
é emitido pelo compilador que conhece o caminho de renderização, em vez de o
Editor presumir que sejam iguais. O plano também cobre composições afins dos modos 1/2, páginas bitmap 3/4/5,
superfícies isométricas 4bpp, composições isométricas compiladas, fundos
estáticos e páginas táticas exclusivas. Mapas afins usam entradas de um byte
no screenblock 0 e tiles no CBB2; bitmaps usam o stride nativo e a página em
0xA000, sem screenblocks. A composição isométrica compilada reserva a arena
limitada a 768 tiles, não o atlas de origem inteiro. São envelopes conservadores,
não contagens de tiles visíveis.

Assets avançados não resolvidos ou dimensões sem contrato continuam pendentes.
Trocas de vídeo por background do Shmup emitem `video_states`. Cada background
selecionável pelo runtime é verificado com modo e endereçamento OBJ próprios;
sem background ativo, vale a composição da cena. A seleção respeita o vínculo
por onda ou o índice fixo, sem atribuir estados de backgrounds não utilizados.
Um estado inválido bloqueia a cena inteira e identifica seu ID no diagnóstico. A união de endereços permanece um envelope conservador; quando os
modos variam, o Editor mostra os limites de cada estado em **Reservas por estado**.
O vídeo global do Shmup vem de `shmup_project.video`, conforme o consumidor nativo;
`composition.enabled` controla sua ativação. O relatório registra razões pendentes
em `nativeLayout.notes`, sem substituir dados ausentes por zero.
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

Após **Gerar ROM**, a mesma seção apresenta o tamanho total medido, a **ROM
atribuída à cena**, bytes exclusivos/compartilhados e o restante não atribuído
do projeto. A lista **Reservas dinâmicas da interface** identifica as arenas
que contribuíram para o orçamento. Faixas compartilhadas contam uma vez, e as
reservas não são apresentadas como picos medidos por frame.

O resultado só é associado à versão do projeto que iniciou a operação;
trocar de projeto, editar dados ou alterar assets invalida resultados atrasados.
Navegar entre cenas preserva o relatório, pois não altera o conteúdo compilado.
O tamanho total não é apresentado como tamanho individual de cada cena.

## Política de cores e preservação visual

Novos sprites/portraits e backgrounds regulares usam 4bpp por padrão. Um OBJ
4bpp usa uma paleta de 16 entradas, com índice zero transparente. Backgrounds
regulares podem usar vários bancos: a regra de 15 cores de OBJ não limita o
background inteiro a 15 cores. O `assetc` continua validando bancos compartilhados,
reservas da interface e os limites reais de cada grupo de cena.

Cada alocação gráfica agora inclui `color_policy`: formato, razão e quantidade
de cores usadas na fonte em RGB555. A contagem ignora entradas não usadas da
paleta PNG e variantes RGB888 que viram a mesma cor no GBA. Não é o consumo de
paleta RAM: esse consumo vem dos intervalos compilados e das reservas nativas.

O compartilhamento de paletas BG também verifica os índices visíveis compilados.
As mesmas cores no PNG não bastam: o 4bpp pode realocar uma cor para reservar
índice zero transparente. Bancos incompatíveis recebem faixas distintas;
compartilhamentos compatíveis com fundos afins/indexados continuam permitidos.

8bpp tem razões distintas: OBJ com mais de 15 cores, seleção explícita do autor,
background afim, superfície indexada, cache paginado ou modo bitmap. A política
marca um OBJ 8bpp com até 15 cores como **Revisar uso de 4bpp**. Isso é uma
indicação de revisão, não prova de conversão segura: é preciso conferir bancos,
transparência, variantes de paleta, animações e a cena inteira na ROM.

O inspetor mostra a política e os formatos dos assets em uma lista expansível.
Dados antigos sem política ficam pendentes até nova análise. A política é
recalculada também quando alocações compiladas vêm de cache; uma decisão antiga
não muda a classificação atual. O relatório não converte arquivos, não muda o
formato selecionado, não reduz cores e não retira avisos de memória.

## Medição durante a ROM

O painel **Testes e diagnóstico → Medição nativa por frame** complementa o
orçamento compilado. A engine publica, a cada frame concluído, bytes e chamadas
de DMA imediato, bytes ainda na fila, transferências descartadas, trabalho de
publicação em VBlank e entradas de OAM habilitadas. DMA transferido e fila pendente
são medidas distintas; a espera ociosa pela interrupção não conta como trabalho.
O tempo de publicação/flush pode exceder a janela de VBlank e não prova, por si só,
a ausência de tearing. O relógio tem 262.144 ticks por segundo.

Picos de DMA, trabalho de VBlank e OAM guardam o valor e o frame de origem na
engine. Reiniciam ao entrar em outra cena/runtime; o Editor pode consultá-los com
menos frequência sem perder um pico. O contador de frames desse trecho nativo é
separado da quantidade de amostras coletadas pelo Editor. Dados ausentes ou de
outro frame/cena ficam pendentes, em vez de aparecerem como zero medido.

A extensão de telemetria ocupa 96 bytes após os 400 bytes existentes, sem mudar
o ABI anterior. A ponte mGBA lê os 24 words em um único snapshot, sem avançar a
simulação. A ocupação de OAM usa um mapa de 128 bits atualizado pelo renderer,
sem varrer a memória de vídeo a cada frame. Apenas os trechos de OAM usam
`-O2` no GCC nativo, para preservar a cadência de Penedos sem ampliar a RAM estática;
a ROM continua sujeita ao mínimo existente de 55 Hz. Inclui fallback nativo e OBJ afim de
tamanho duplo; objetos desligados e shapes inválidos não entram na conta.

O escopo é DMA imediato programado pela engine, sem repetições automáticas de
FIFO de áudio/HDMA e sem duração por canal. OAM habilitados não medem o limite
por scanline. A atribuição de código/dados sem símbolos de assets também continua
fora do orçamento por cena. Essas fronteiras não são valores estimados ou
medições de GBA físico. O CI entre três sistemas está descrito em
[Integração contínua](continuous-integration.md).

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

Para verificar a troca Shmup afim → regular em uma ROM técnica gerada, com
Python, toolchain ARM e Engine Pack atualizados:

```sh
npm run smoke:video-budget-states -- /caminho/GBAStudioEnginePack /caminho/evidencias
```

O teste derrota o inimigo pelo botão de disparo e avança a onda. Confere no
mGBA o modo, CBB, screenblock e 4bpp restaurados antes do mapa regular, além
dos dois planos compilados e do recibo da ROM. Compara os pixels dentro e fora
do mapa com uma ROM que entra diretamente no estado regular, cobrindo também
a recarga de tiles, paletas e tile zero após o mapa afim. A arte procedural do teste
não faz parte do projeto do usuário. Não substitui teste em GBA físico.
