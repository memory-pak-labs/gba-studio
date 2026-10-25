# Desenvolvimento

## Repositório de referência e branches

O desenvolvimento usa uma cópia local de
[memory-pak-labs/gba-studio](https://github.com/memory-pak-labs/gba-studio).
`develop` é a branch de integração. O repositório pessoal anterior é histórico;
não é uma segunda origem de código a ser sincronizada a cada versão.

Antes de começar uma funcionalidade ou correção, confira o estado local e
atualize a base. O exemplo abaixo pressupõe um checkout limpo; preserve ou
conclua alterações existentes antes de trocar de branch.

```sh
git status --short
git switch develop
git pull --ff-only origin develop
git switch -c codex/nome-da-tarefa
```

Faça commits pequenos com Conventional Commits e valide o escopo antes de
enviar a branch. Para colaboradores, use o fork e o fluxo de PR descritos em
[CONTRIBUTING.md](../CONTRIBUTING.md). A integração em `develop` cabe aos
mantenedores; não use force push nem substitua o histórico público pelo privado.

Editar, testar e fazer commits locais não publica o código. `git push` envia os
commits para o GitHub; em uma branch pública, eles podem ser consultados antes
de uma nova beta. Não é necessário esperar uma versão completa para compartilhar
uma alteração revisada. Publicar a Release e seus instaladores é uma etapa
separada, depois das verificações de distribuição.

Credenciais de assinatura e notarização, contexto privado, candidatos e caches
permanecem locais. Um clone público novo pode seguir este guia sem os arquivos
privados dos mantenedores.

## Editor

Use Node.js 22 (a versão principal está em `.nvmrc`). Os comandos npm são
executados em `apps/desktop-electron`, pois a raiz não é um pacote npm.

Os testes de conversão de PNG também precisam de Python 3 e Pillow. Na raiz,
crie e ative um ambiente Python antes dos testes (macOS/Linux):

```sh
python3 -m venv .venv
source .venv/bin/activate
python -m pip install Pillow
```

Esses testes usam o `assetc.py` do código-fonte. As verificações que exigem
um Engine Pack compilado são descritas abaixo.

```sh
cd apps/desktop-electron
npm ci
npm test
npm run typecheck
npm run build
npm run dev
```

A suíte Vitest executa os testes funcionais no projeto `unit` e, ao terminar,
mede a abertura do projeto em `project-open-perf`, com um único worker. Essa
ordem preserva o orçamento de 750 ms sem disputar CPU com os demais testes.
Para executar apenas essa medição, use `npm run test:perf:project-open`.
Evite executar builds ou outras verificações pesadas ao mesmo tempo que ela.

O npm instala as dependências declaradas e o Electron. Nenhuma senha Apple é
necessária para desenvolver, testar ou compilar o editor.

## Instaladores macOS por arquitetura

Em um Mac Apple Silicon com Rosetta 2, Xcode e Node.js 22, depois de compilar
o Engine Pack:

```sh
cd apps/desktop-electron
npm run package:mac:arm64  # aplicativo Apple Silicon para validação
npm run package:mac:x64    # aplicativo Intel para validação via Rosetta
npm run dist:mac:arm64     # DMG e ZIP Apple Silicon
npm run dist:mac:x64       # DMG e ZIP Intel
npm run dist:mac           # os dois conjuntos separados, sem publicação
```

Cada instalador contém Electron, Python/Pillow, GNU make, gbafix e compilador
GNU Arm da mesma arquitetura. As fontes portáveis têm versões e SHA256 fixados
em `scripts/portable-runtime-sources.json`; não são usadas ferramentas do sistema
do usuário. O backend continua GBAStudioEngine. Receitas, fontes do make/gbafix
e licenças originais acompanham o runtime.

O preparo rejeita Mach-O de outra arquitetura, binários Universal ou mínimo
superior a macOS 12. Antes de empacotar, importa Pillow, verifica o Engine Pack
e gera uma ROM com a toolchain embarcada. As evidências ficam em
`artifacts/macos-runtime/arm64` e `artifacts/macos-runtime/x64`.

Os smokes do aplicativo empacotado aceitam `GBA_STUDIO_PACKAGED_APP_PATH` e
`GBA_STUDIO_SMOKE_ARCH=arm64` ou `x86_64`. Informe também
`GBA_STUDIO_MAC_ARCH=arm64` ou `x64` no smoke do bundle para verificar todos
os Mach-O, inclusive as ferramentas embarcadas.

O pacote gera ROMs sem Python ou devkitPro externos. Assinatura Developer ID,
notarização, tickets e Gatekeeper precisam ser verificados em cada DMG/ZIP
final. O teste Intel por Rosetta é registrado separadamente de um Mac Intel
físico. Utilitários Universal antigos permanecem disponíveis para reproduzir
builds históricos; a distribuição atual usa instaladores separados.

No macOS, a detecção `app.runningUnderARM64Translation` aplica uma política de
compilação aos renderers x64 executados pelo Rosetta: JavaScript usa Sparkplug
sem mudanças posteriores de tier, e WebAssembly é compilado antecipadamente no
tier otimizado. Isso evita a tradução repetida de código JIT durante o Play.
Apple Silicon nativo, Mac Intel nativo, Windows e Linux mantêm a configuração
padrão do Electron. Mudanças na versão do Electron exigem revalidar essa política.

O bridge mGBA copia gameplay, profiler e rastro de eventos em um snapshot de
100 palavras, reduzindo a coleta a uma chamada JavaScript/Wasm por frame. O
buffer pertence ao host e não ocupa a RAM emulada do GBA. A regressão
`scripts/mgba-native-telemetry.test.mjs` executa ROMs ARM autorais no core
compilado e compara o resultado com a leitura por palavras, incluindo o limite
da EWRAM. O relógio PCM começa no primeiro bloco disponível; retomar áudio por
uma tecla não altera o relógio nem encobre um underrun real.

A inspeção visual calcula o histograma RGB888 completo e a assinatura FNV no
bridge nativo, mantendo a mesma ordenação e os mesmos critérios do cálculo JS.
`scripts/mgba-native-frame-analysis.test.mjs` compara todos os campos no core
compilado, inclusive para pixels RGBA arbitrários e limites da memória Wasm.
As tabelas e o buffer temporário usam cerca de 1 MiB no host, sem reservar RAM
do GBA. Snapshots preferem os codecs Base64 nativos de `Uint8Array` quando
disponíveis; o formato salvo e o fallback de navegador permanecem os mesmos.
Os decodificadores de diagnóstico são preparados antes dos relógios de cadência e
áudio, para evitar compilação tardia sob Rosetta. A preparação usa dados locais
do host: não avança frames, não escreve na memória do GBA nem publica telemetria
sintética. A regressão de ciclo de vida confirma início sem frames executados,
sem estados salvos e sem dados de preparação nos callbacks do Player.

O smoke de cenas mede uma janela fixa de quatro amostras depois de confirmar a
cena em execução e antes das auditorias de pixels, menus e save/load. As três
últimas compõem a cadência, com os mesmos limites de 55 FPS e 10% de descarte.
As quatro amostras ficam na evidência; todas devem pertencer ao runtime e à cena
selecionados, com frames avançando. Uma queda não é substituída por amostras
posteriores de outro menu ou de uma ROM reiniciada. O contador de underruns é
lido novamente ao final dessa janela, sem zerar seu histórico.
A captura de framebuffer e a serialização do estado nativo pelo CDP também
acontecem depois dessa leitura: são auditorias que bloqueiam o renderer e não
podem interferir na medição de reprodução contínua. Se a identidade ou a
sequência de frames for rejeitada, o smoke preserva as amostras brutas e o
escopo em `cadence-rejected-<windowID>.json` antes de fechar o Player.
O início da janela usa o relógio do Player (`performance.timeOrigin` somado a
`performance.now()`), preservado pelo IPC. Amostras produzidas antes desse
marcador não entram na janela, mesmo quando chegam atrasadas ao editor. Um
contador abaixo do frame observado, ou um reinício dentro da janela, reprova
o teste; amostras lentas posteriores ao marcador continuam na medição.

Em Penedos do Vento, o smoke também executa `smoke-platformer-cadence.mjs`
na ROM mista exportada. O contador de vídeo do mGBA é comparado ao contador
de gameplay em repouso, caminhada nos dois sentidos e salto. Cada janela deve
sustentar pelo menos 55 atualizações por segundo, sem trocar de cena ou reiniciar
o contador. Os FPS de apresentação do Player, sozinhos, não comprovam essa
cadência: o emulador pode apresentar quadros repetidos enquanto a ROM está lenta.

A plataforma preserva os OBJ reservados de uma HUD composta por imagens e
contadores quando os valores e a visibilidade continuam iguais. Troca de cena,
fonte ou tiles invalida essa reutilização; HUDs com BG ou comportamentos dinâmicos
seguem o desenho completo. As consultas frequentes de colisão executam em ARM na
IWRAM, enquanto a memória de comportamento dos componentes fica na EWRAM. O
relatório pós-link e a reserva de pilhas verificam o espaço estático resultante.

## Motor

Os testes host precisam de C++17, make e Python 3. São independentes de ROM e de
hardware GBA; as ferramentas de assets também precisam de Pillow quando usam PNG.

```sh
cd packages/GBAStudioEngine
make host-test
make package
```

`make package` gera `dist/GBAStudioEnginePack`; o build da biblioteca ARM
precisa da toolchain GBA. Instale [devkitPro/devkitARM](https://devkitpro.org/wiki/Getting_Started)
e configure `DEVKITPRO` / `DEVKITARM` conforme sua instalação. No editor,
`npm run check:toolchain` verifica a descoberta das ferramentas.

O editor permite selecionar o Engine Pack nas configurações. Para o layout
deste monorepo, a saída é `packages/GBAStudioEngine/dist/GBAStudioEnginePack`.
Não copie caminhos absolutos de outro computador.

## Substituição de tiles em Aventura e Plataforma

`replace_tile X Y TILE bg2 COLISAO` altera um tile de 8×8 do piso.
`replace_tile_sequence X Y TILE QUANTIDADE bg2 COLISAO` altera uma sequência
horizontal, limitada à linha atual. `COLISAO` é opcional: `keep` preserva a
colisão atual; `free`, `solid`, `up`, `down`, `left`, `right`, `water`, `damage`
e `ladder` definem explicitamente o novo terreno. Uma colisão explícita também
remove a rampa anterior. BG0 é o alias histórico do piso BG2 nos eventos;
colisão explícita só se aplica ao piso. As outras camadas alteram apenas o visual.

As alterações são locais à visita à cena, com até 256 células modificadas e
coordenadas de 0 a 511. Entrar novamente na cena ou carregar um save restaura
o mapa original; reaplique o estado desejado no evento de entrada a partir das
variáveis salvas. Mapas paginados conservam o atlas na ROM e atualizam somente
os tiles visíveis afetados. Os projetos e PNGs originais permanecem intactos.

Para reproduzir a regressão com cores procedurais, gerar ROMs pelo Pack e
conferir pixels, colisão e retorno da câmera no mGBA Web, execute no aplicativo:

```sh
node scripts/smoke-replace-tile.mjs /caminho/GBAStudioEnginePack /caminho/evidencias
```

O smoke cobre mapas por tiles, residentes, paginados, coordenadas acima de 63,
Plataforma e preservação da colisão quando o argumento é omitido. A validação
de um GBA físico continua separada.

## Estados de mapa e visibilidade

Em cenas Topdown e Plataforma, o inspetor **Estados de mapa** agrupa tiles do
piso BG2, colisões explícitas e uma variável salva. Cada estado possui de 2 a
8 variantes; uma delas usa valor 0. As variantes cobrem as mesmas células,
sem sobreposição com outros estados. O limite conjunto da cena é de 8
operações e 256 células. IDs de estado usados por comandos devem ser únicos
no projeto. As definições são salvas no `.gba-project`.

```text
set_map_state porta open
lantern player 80 64 75 240
reveal_area Guide 24 24 100 120
clear_visibility
```

`set_map_state` troca a variável, o visual e a colisão. A entrada na cena e o
carregamento de save reaplicam a variante salva sem repetir os eventos de
inicialização do usuário. Um valor sem variante mantém o mapa original na
entrada. Antes de reduzir a cena ou mudar para outro runtime, remova definições
que ficariam inválidas.

Os presets de visibilidade usam uma área retangular que acompanha o centro do
jogador (`player`) ou do ator indicado, considerando a câmera. Largura e altura
aceitam 8–240 e 8–160 pixels; escuridão, 0–100%; duração, 1–3600 quadros. A
revelação expande a área inicial durante esse tempo. Fade e transições têm
prioridade sobre a lanterna. A troca de cena e o fim da duração limpam o efeito.

As regressões abaixo exportam comandos reais do editor, compilam fixtures
procedurais com o Pack e executam a ROM no mGBA Web:

```sh
node scripts/smoke-map-states.mjs /caminho/GBAStudioEnginePack /caminho/evidencias-estados
node scripts/smoke-visibility-graphics.mjs /caminho/GBAStudioEnginePack /caminho/evidencias-graficas
```

Os casos cobrem Topdown residente, paginado e Plataforma. O primeiro confere
save, reboot, colisão e retorno à cena. O segundo confere pixels, câmera, atores,
expiração, máscara completa, fade parcial, modos de sprites em movimento e
troca de cena. Os assets procedurais pertencem somente às fixtures de teste.

## Diagnóstico de execução e compilação

No Depurador, o profiler recebe medidas nativas de scripts, áudio, renderização,
streaming e interrupções, com picos por cena. O contador usa 262144 ticks por
segundo; a UI apresenta microssegundos. Escopos podem se sobrepor, portanto
seus valores não devem ser somados. Subsistemas sem amostra ficam fora dos
picos exibidos. A extensão de telemetria preserva o bloco principal existente.
O áudio mede o mixer de VBlank; seu tempo também está contido no total de
interrupções. A coleta na IRQ usa contadores separados, sem alterar o registro
de escopos.
Os cinco subsistemas usam um estado fixo de até 128 bytes; o registro opcional
de 16 labels da API `ProfilerScope` permanece separado para não ocupar a IWRAM
de toda ROM exportada.

Após uma compilação ou Play, **Relatório compartilhável de build** permite
revisar e copiar JSON com versões do editor, Pack e compilador, configuração,
resultado e causa provável. O relatório usa uma lista explícita de campos e
exclui caminhos, comandos e logs brutos. A causa provável depende da evidência
disponível; versões não obtidas permanecem nulas.

## Margem estática de RAM

O relatório pós-link `memory_report.json` usa o schema 2. Ele separa bytes
vinculados (união dos endereços, contando overlays uma vez), alinhamento e
lacunas, reservas e margem estática. O fim de EWRAM vem de `__ewram_bss_end`;
em IWRAM, a margem é o intervalo entre `__bss_end` e `__stack_bottom`. As
reservas de sistema, IRQ, supervisor e o slot final da IRQ permanecem ocupadas.
Mapas sem os símbolos obrigatórios não produzem uma estimativa de margem.
O relatório sinaliza uso a partir de 90% e estouro acima da capacidade.

Essa margem permite avaliar novas alocações estáticas; ela não mede quanto
das pilhas foi consumido em execução. O painel **Testes e diagnóstico** mostra
essas parcelas após compilar ou executar a ROM.

Os pools de recursos mantêm 1024 posições por meio de mapas de bits de 128
bytes. Snapshots continuam sendo cópias independentes e preservam rollback,
alinhamento e contagem. Os buffers de retomada de save ficam na EWRAM comum,
fora do overlay reutilizado entre runtimes; a capacidade de save não muda.
Para verificar a seção e os tamanhos reais do objeto ARM, execute no motor:

```sh
make runtime-save-memory-test
make resource-manager-stack-test
```

## Verificação completa

O projeto canônico é
`apps/desktop-electron/default-assets/templates/exemplo-gba/exemplo-gba.gba-project`.
Depois de configurar o Pack e a toolchain, execute em `apps/desktop-electron`:

```sh
npm run verify:mgba-web
npm run gate:complete-project
```

O gate completo agrega verificações do editor, Pack, exportação e Play.
Fixtures e testes host não substituem esse gate. Para QA visual, confira a tela
e o fluxo real; para uma ROM, confira a execução no emulador. Validação física
do GBA permanece uma etapa separada.

O Guardião do Relé usa BG 240×160, atores de batalha 64×64 com frames em
streaming, efeitos PSG e HUD de PV/comandos reais. O pacote aprovado está em
`fixtures/asset-provenance/relay-approved-manifest.json`. Exporte com início de
desenvolvimento em `guardiao_rele` e execute em `apps/desktop-electron`:

```sh
node scripts/smoke-relay-approved.mjs /caminho/exemplo.gba /caminho/exportacao /caminho/evidencias
```

O smoke usa somente botões para atacar, usar técnica, consultar a equipe e
os itens, tentar fugir, vencer, receber as recompensas e perder/reiniciar.
RAM, ELF e OAM são oráculos de leitura; o teste compara os pixels do BG,
atores, efeitos, molduras, fonte e barras de PV com as fontes aprovadas.
A apresentação opcional fica em `runtime.config.presentation`; os clips em
`actor.battleAnimations`. Atores sem esse vínculo conservam a apresentação
estática. O estado visual é transitório e não altera o formato do checkpoint.
A fonte opaca da HUD usa uma cópia com `metadata.preserveOpaqueColors`, de modo
que os outros consumidores da fonte aprovada permaneçam iguais.

A abertura ilustrada possui uma regressão de pixels e tempo. Exporte uma ROM
do exemplo com o início de desenvolvimento em `abertura`, preservando o início
canônico em `logo`, e execute em `apps/desktop-electron`:

```sh
node scripts/smoke-cutscene-local-animation.mjs /caminho/abertura.gba /caminho/evidencias
```

O teste compara os 480 frames com os assets aprovados e verifica a conclusão
e o botão Start até o título. A pasta de evidências é opcional.

A cena `logo` usa o fade clássico A aprovado em
`fixtures/asset-provenance/startup-fade-a-manifest.json`: 216 ticks nominais,
53 imagens nativas sem reamostragem, um banco BG 4bpp e imagem estável como
prévia no Editor. Atores, diálogos e scripts permanecem fora do caminho
otimizado de reserva residente para sequências compostas somente por fundos.
Para verificar pixels, tempo, passagem para Abertura/título e B/Start:

```sh
node scripts/build-racing-playtest.mjs /caminho/logo-export logo
node scripts/smoke-startup-fade.mjs /caminho/logo-export/build/exemplo.gba /caminho/logo-export /caminho/evidencias
```

O smoke compara os 216 quadros e os headers do `assetc` contra os PNGs
aprovados em RGB555. Usa entradas reais do emulador para pular a vinheta em
três momentos. A origem, autorização, hashes e transformações ficam no
manifesto e em `fixtures/asset-provenance/startup-fade-a-sources.md`.

A cena `mapa_rota` usa o mapa paginado480×320, o Dirigível Lumen em um único
OBJ64×64 e a carta compacta aprovados em
`fixtures/asset-provenance/world-map-lumen-manifest.json`. A viagem mantém a
inclinação e a escala affine. `runtime.config.hudLabels` configura os textos
de disponibilidade, travessia e bloqueio; mapas sem essa configuração conservam
os textos padrão. A trilha “Mar Aberto” é uma composição PSG de84BPM.

Para conferir os pixels aprovados, a matriz OAM affine, os acentos, a música e
o fluxo dos oito destinos, execute em `apps/desktop-electron`:

```sh
node scripts/build-racing-playtest.mjs /caminho/mapa-export mapa_rota
node scripts/smoke-world-map-lumen.mjs /caminho/mapa-export/build/exemplo.gba /caminho/evidencias-visuais
node scripts/verify-route-map-rom.mjs /caminho/mapa-export/build/exemplo.gba /caminho/evidencias-fluxo
```

O início de desenvolvimento não altera o início canônico em `logo`. Os
smokes dirigem botões reais no mGBA; estado e OAM são oráculos somente de
leitura. Pausa, retomada, cancelamento e bloqueios da campanha são preservados.

A Arena de Arrancada usa o BG com retoque discreto, os dois lutadores e a HUD
modular aprovados em `fixtures/asset-provenance/arena-approved-manifest.json`.
O promotor preserva as regras da luta, a vitória, a revanche e os demais
assets. Exporte com início de desenvolvimento em `arena_arrancada` e execute:

```sh
node scripts/smoke-arena-approved.mjs /caminho/arena.gba /caminho/export /caminho/evidencias
```

O smoke confere BG, atores, molduras, nomes e quatro barras independentes por
entradas reais no mGBA. Caminhada usa os quadros 16–19 das folhas completas;
salto usa 20–23, seguindo subida, queda e pouso. O primeiro bloco de 16 quadros
permanece idêntico às folhas anteriores. A trava de ataque também vale para
golpes no ar, evitando reiniciar animações e sons em entradas rejeitadas.

Os bindings `p1-super` e `p2-super` recebem os valores reais da luta. Acertar
carrega `superGaugeGainOnHit`; receber carrega `superGaugeGainOnReceive`.
L dispara o especial de P1 quando cheio; R usa o contra-ataque durante dano
quando há meia barra. A CPU também usa seu gauge cheio. `actionSounds` no
config da cena associa `hit`, `guard`, `special` e `miss` a SFX PSG do projeto;
a exportação rejeita referências ausentes ou de outro tipo de áudio.
O teste compara áudio PCM de execuções equivalentes com e sem um golpe no ar,
além de verificar os quatro efeitos selecionados, carga, consumo, pausa,
vitória, derrota e revanche. A trilha de combate permanece ativa.

A Arena Tática usa mapa paginado768×512, grade16×16, tiles48×24 e câmera
no centro do seletor. Os pixels aprovados, retratos e peças da HUD compacta
estão registrados em `fixtures/asset-provenance/tactical-arena-manifest.json`.
A origem Y68 representa o topo do losango; somar12px mantém os pés no centro
Y80 da composição aprovada. Atores64×64 usam pivot32,62 e offset−32,−50.

A revisão do piso de20/10/2026 usa juntas alinhadas aos módulos48×24 e
conserva os pixels aprovados fora das superfícies de piso. O manifesto também
materializa os dois percursos de escada: o esquerdo varia Y com rampas
`IsoRampDownLeft`; o direito varia X com `IsoRampDownRight`. Colisões e níveis
são dados editáveis da cena, preservados ao reconstruir o exemplo. A validação
estreita de bytes, geometria e conectividade está em
`scripts/tactical-arena-grid.test.mjs`.

A HUD contextual mostra a unidade sob o seletor, HP real e três ações. O avanço
7px da fonte preserva suas seis colunas de tinta. BG/foreground compartilham
paleta, sem reduzir tiles; o viewport carrega somente a janela necessária.
As imagens e regras das outras cenas, a música e os cues existentes permanecem.
Para validar o projeto exportado com início de desenvolvimento em `arena_tatica`:

```sh
node scripts/smoke-tactical-arena.mjs /caminho/arena.gba /caminho/evidencias
```

O smoke usa entradas reais no mGBA, verifica as quatro direções, limites da
câmera, bloqueios, cancelamento, limite de movimento por turno, dano em ambos
os lados, vitória, derrota, pausa/retorno e saída para o Mercado. Os textos
e HP são conferidos no framebuffer com a fonte aprovada em RGB555; não há
escrita em memória de jogo ou saves para fabricar resultados.

Os seis menus in-game usam os pixels aprovados do livro e da mala, registrados
em `fixtures/asset-provenance/book-menu-manifest.json`. A promoção por
`scripts/book-menus-promotion.mjs` preserva ações, flags, slots e retorno da
partida. Os títulos fixos aprovados estão em português; a seleção de idioma e
as traduções de diálogos existentes permanecem disponíveis.

Para verificar seleção, páginas, áudio, três saves e retorno à partida, exporte
o projeto completo com início de desenvolvimento em `porto_lumen` e execute:

```sh
node scripts/smoke-book-menus.mjs /caminho/porto.gba /caminho/evidencias
```

O smoke compara cada estado com as camadas aprovadas em RGB555. Os dados de
revisão não substituem valores da partida. `hudFeedbackInDetails` opta por
confirmação e resultado de save em três linhas de contexto. Slots não usados
da HUD mantêm espaços explícitos, evitando o fallback de texto entre campos.

Carregar jogo e créditos usam os dois livros aprovados registrados em
`fixtures/asset-provenance/load-credits-book-manifest.json`. A promoção mantém
os três slots reais, a proteção contra carregamento sem save, os dois diálogos
de créditos e o retorno ao título. Recursos substituídos sem uso são retirados da biblioteca.
Para conferir o fluxo completo, exporte com início de desenvolvimento em
`titulo` e execute:

```sh
node scripts/smoke-load-credits.mjs /caminho/titulo.gba /caminho/evidencias
```

O smoke cria seus próprios saves por inputs de jogo, testa os três
carregamentos, slots vazios indisponíveis, detalhes de créditos e retorno ao
carrossel. Compara BG, texto e cursor em RGB555. Os saves são exclusivos da
pasta de evidências; não são partidas do usuário. O formato existente persiste
posição X/Y e variáveis, sem campo de orientação do personagem.

O core Web distribuído possui fonte e hash identificados. Para recompilá-lo,
instale Emscripten e CMake e use `npm run build:mgba-web`. A licença MPL-2.0
e a receita estão em [Avisos de terceiros](../THIRD_PARTY_NOTICES.md).

As cenas `escolha_genero` e `nome_jogador` usam os seis assets aprovados em
`fixtures/asset-provenance/traveler-entry-manifest.json`: retratos de 64 × 64
na escolha e 48 × 48 no nome, com título fixo no BG e teclado dinâmico. A
promoção preserva os eventos e mantém somente os assets usados pelo projeto.
Exporte o projeto completo com início de desenvolvimento em `escolha_genero`:

```sh
node scripts/smoke-traveler-entry.mjs /caminho/escolha.gba /caminho/evidencias
```

O smoke verifica os dois retratos, os 29 focos do teclado, letras maiúsculas e
minúsculas, DEL, o limite de oito caracteres e a confirmação até o prólogo,
comparando os pixels da ROM com as camadas aprovadas em RGB555. Ao completar
o nome, o cursor fica após a última letra; novas letras são ignoradas até DEL.

O prólogo usa os três backgrounds aprovados de
`fixtures/asset-provenance/prologue-clean-manifest.json`. A paginação usa a fonte e o layout da cena antes de
calcular a primeira página. A percorre o texto completo antes de trocar o
quadro; B e Start mantêm a ação de pular para Porto Lumen.

Exporte o projeto completo com início de desenvolvimento em `prologo` e execute:

```sh
node scripts/smoke-prologue.mjs /caminho/prologo.gba /caminho/engine-export /caminho/evidencias
```

O smoke confere os três backgrounds contra os PNGs aprovados, todos os glyphs
das páginas visíveis, a continuação do segundo texto e o salto com B/Start em
cada quadro. A passagem para Porto Lumen também é verificada. O teste host
`make cutscene-dialogue-runtime-test` cobre paginação, layout, typewriter e
etapas com espera ou avanço automático.

O `farol_interior` usa o mapa top-down paginado aprovado de 384 × 256,
os atores de 48 px e a HUD B de Porto Lumen. A origem, licença, aprovação e
os hashes ficam em `fixtures/asset-provenance/farol-interior-manifest.json`.
O promotor mantém as duas rotas de regeneração, a entrada de Porto Lumen,
as colisões na grade de 8 px e os diálogos existentes.

Exporte o projeto completo com início de desenvolvimento em `farol_interior`:

```sh
node scripts/smoke-farol-interior.mjs /caminho/farol.gba /caminho/engine-export /caminho/evidencias
```

O smoke usa inputs nativos, compara cenário, atores e HUD com os pixels
aprovados em RGB555 e testa direções, bloqueios, diálogos e a ida e volta por
Porto Lumen. A primeira visita a Porto inicializa os valores da HUD pela
lógica da campanha; o teste usa somente sua própria instância de emulação.

## Ferramenta de sprites

Opcional, em `tools/gba-sprite-prep`; usa Rust/Cargo e possui lockfile:

```sh
cargo test --locked
```

Leia o README da ferramenta antes de preparar ou importar assets.
Preparação técnica não substitui revisão visual nem licença de redistribuição.

## CI e releases

A CI executa `npm run test:all`, tipos e build no Linux e Windows, além dos
testes host do motor nos dois sistemas. Confira o resultado da execução;
ter um job configurado não significa que os testes passaram.

O workflow manual **Desktop packages** compila a biblioteca ARM em uma imagem
devkitPro identificada pelo digest e gera candidatos x64: NSIS/ZIP no Windows,
AppImage/DEB/TAR.GZ no Linux. Ele verifica os arquivos e executa smokes do editor
empacotado e do projeto completo, incluindo exportação, ROM e abertura do Play.
Os artefatos e evidências ficam disponíveis por um dia; não cria uma Release.

Os candidatos Windows/Linux incluem **Python com Pillow, GNU Arm GCC, make e
shell**. O aplicativo usa as cópias em seus recursos, sem instalar Python ou
devkitPro no computador do usuário e sem download ao gerar ROMs. Versões e
SHA256 ficam em `scripts/portable-runtime-sources.json` e no manifesto embutido
`Runtime/runtime.json`; licenças originais são preservadas. O compilador xPack
GNU Arm é uma ferramenta independente; o backend continua GBAStudioEngine.
O instalador Windows não possui assinatura digital, etapa separada dos testes.

O smoke da instalação remove `PATH`, Python e devkitPro externos do ambiente
do aplicativo (`GBA_STUDIO_OFFLINE_SMOKE=1`) e exporta o exemplo completo. O
preparo dos instaladores requer conexão apenas no build para baixar os arquivos
fixados e conferir seus hashes; a geração de ROM pelo usuário funciona offline.

Se o Docker Hub limitar downloads, o campo opcional `engine_pack_run_id` aceita
uma execução anterior com o artefato `ARM-Engine-Pack`. O workflow só reutiliza
o pack quando o commit é ancestral da revisão atual e não há diferenças em
`packages/GBAStudioEngine`; a instalação e os smokes continuam obrigatórios.

Para reproduzir o empacotamento após compilar o Pack, em `apps/desktop-electron`:

```sh
npm run dist:win    # na máquina Windows
npm run dist:linux  # na máquina Linux
```

O gate completo local, o teste da instalação, o Play renderizado e o hardware
possuem limites distintos de evidência. Consulte as evidências do run antes
de distribuir um candidato como versão validada.

Instaladores oficiais são publicados por mantenedores após validação própria.
Assinatura e notarização usam credenciais privadas fora do repositório; PRs de
contribuidores não precisam dessas credenciais.

## Missão opcional — O sinal perdido

A mecânica do cais leste inicia a missão ao entregar a estrutura. O cartógrafo
oferece viagens ao Armazém e ao Observatório. No Armazém, examine a carta antes
do baú; no Observatório, examine o telescópio e depois a mesa da maré. A leitura
de leste para oeste revela **314**. A porta do Observatório permite voltar ao
Farol. Durante a viagem, segure R e pressione A na porta para voltar ao Porto a partir dos dois interiores; as
saídas normais da campanha continuam disponíveis fora da viagem da missão.

No Farol, converse com o guardião junto à lente: esquerda/direita seleciona o dígito,
cima/baixo altera, A confirma e B cancela. Combinações incorretas e cancelamento
preservam a peça. O acerto instala o relé e executa a timeline `signal_repair`,
com câmera, áudio e pausa temporária do movimento. Volte à mecânica para receber
duas moedas uma única vez. O diário, em **Missões → OBJETIVO**, informa o estado
da missão antes do objetivo da campanha.

Carta, peça, pista e conclusão usam variáveis e inventário persistidos no save
universal. Coletas e etapas relevantes salvam no slot automático 0; o menu
Salvar mantém os três slots manuais. Novo jogo reinicia apenas os dados da missão
e os campos já reiniciados pela campanha. A promoção idempotente em
`scripts/lost-signal-mission.mjs` é reaplicada ao regenerar o exemplo.

Nenhuma imagem é recomposta: backgrounds, atores/cursor e HUD continuam nos
recursos aprovados e nas respectivas camadas. Os testes da missão verificam
essas invariantes, ordem das pistas, consumo da peça, recompensa única e exportação:

```sh
npx vitest run scripts/lost-signal-mission.test.mjs
node scripts/build-racing-playtest.mjs /caminho/sinal-export titulo
node scripts/smoke-lost-signal-mission.mjs /caminho/sinal-export/build/exemplo.gba /caminho/sinal-export /caminho/sinal-rom
node scripts/smoke-lost-signal-play.mjs /caminho/sinal-play
```

Os dois smokes percorrem a missão por controles nativos, reiniciam o core,
carregam o save parcial pelo menu, voltam ao Porto pela porta com R+A,
retomam a missão, rejeitam/cancelam o cadeado, concluem o reparo e verificam a
recompensa única antes e depois de salvar/carregar manualmente no slot 2.
O Play usa uma instância descartável do Electron e um relógio de teste para
entradas determinísticas; isso valida fluxo e pixels renderizados, sem medir
desempenho em tempo real. Snapshots do emulador são apenas diagnósticos de leitura;
o progresso é restaurado pelo carregamento da SRAM no jogo.

## Armazém das Marés frontal

O cursor aprovado `white-hand-cursor-32x32.png` usa a ponta do dedo como ponto
de interação, em um quadro de 32 × 32 px com 15 cores e transparência. O PNG
é preservado byte a byte; idle e hover compartilham o mesmo desenho aprovado.
Cada cena exporta seu próprio cursor. Armazém e Observatório usam a mão
aprovada. Origem, aprovação e hashes constam em
`fixtures/asset-provenance/warehouse-white-hand-manifest.json` no aplicativo.

O exemplo usa o fundo aprovado `warehouse-frontal-bg-240x160.png`, com carta,
baú e porta ligados aos hotspots da cena. As versões anteriores sem uso foram
retiradas da biblioteca. A saída mantém a progressão atual,
sem exigir que todos os objetos sejam examinados.

Em `apps/desktop-electron`, execute:

```sh
npx vitest run scripts/warehouse-frontal-promotion.test.mjs scripts/point-click-scenes.test.mjs
npm run smoke:exemplo-scenes -- --scene=armazem_das_mares --exercise-point-click-input
```

No Play, mova o cursor com o direcional, examine carta e baú com A, feche os
diálogos e use a porta para chegar ao Observatório. A promoção também é aplicada
quando o exemplo é regenerado. A preparação BG usa 600 tiles e 14 bancos de
paleta; as reservas de tile transparente e interface permanecem separadas.

## Observatório do Farol frontal

O fundo aprovado `observatory-frontal-bg-240x160.png` é preservado byte a byte,
com 598 tiles e 14 bancos de paleta. A aprovação visual e da paleta preparada,
os hashes e a origem constam em `fixtures/asset-provenance/observatory-frontal-manifest.json`.
A promoção também é aplicada ao regenerar o exemplo. A cena frontal usa o cursor de mão
branca separado, com a ponta em 13,6. Telescópio, mesa da maré e porta têm
hotspots próprios, mantendo os diálogos e a saída para Mercado Suspenso/flag11.

Exporte o projeto completo com início de desenvolvimento em `observatorio_do_farol`:

```sh
node scripts/smoke-observatory-frontal.mjs /caminho/observatorio.gba /caminho/evidencias
```

O smoke compara fundo e cursor em RGB555, testa as quatro direções, bordas,
clique vazio, os dois diálogos, a suspensão do cursor durante a leitura,
restauração do fundo e a saída. Não acessa saves do usuário. Para Editor/Play:

```sh
npm run smoke:exemplo-scenes -- --scene=observatorio_do_farol --exercise-point-click-input
```

## Biblioteca de arquivos do exemplo

A reconstrução final usa `scripts/lib/example-asset-usage.mjs` para manter
apenas os recursos referenciados pelas cenas, atores, animações alcançáveis,
quadros, eventos, áudio, diálogos, HUDs e ajustes globais. Animações e estados
sem consumidores não mantêm uma sheet aposentada na biblioteca. Referências
explicitamente marcadas como arte anterior preservada saem das cenas; guias
normais de autoria continuam sendo referências válidas.

O snapshot `scena` acompanha sua entrada em `rooms`, evitando que uma seleção
antiga mantenha um fundo substituído. O registro de retirada, hashes e fontes
compartilhadas está em `fixtures/asset-provenance/example-library-cleanup.json`.
Cinco PNGs também atendem aos defaults de novos projetos e permanecem no pacote,
sem aparecer na biblioteca do exemplo. Os pixels dos recursos ativos não mudam.

## Tempestade · Voo livre

A Tempestade usa o BG aprovado de 768 × 160, nave e inimigos animados em
8bpp, a HUD Voo livre e sete faixas/cues PSG originais. Os hashes, a aprovação
e a origem ficam em `fixtures/asset-provenance/tempestade-approved-manifest.json`.
O promotor altera somente a Tempestade e mantém os PNGs anteriores preservados.
A patrulha e o farol ocupam duas ondas. A derrota aguarda a explosão e o evento `onDefeat`
antes de reiniciar; a vitória mantém o módulo de escudo, o save e a ida ao Guardião.

Exporte o exemplo completo com início de desenvolvimento em `tempestade`:

```sh
node scripts/build-racing-playtest.mjs /caminho/tempestade-export tempestade
node scripts/smoke-tempestade-approved.mjs /caminho/tempestade-export/build/exemplo.gba /caminho/tempestade-export /caminho/evidencias
```

O smoke usa somente botões para mover, frear, disparar, receber dano, vencer e
reiniciar após a derrota. Confere em RGB555 os atores, rotores, BG, ícones e
números reais da HUD, incluindo a sombra da fonte. Compara PCM com e sem
disparo sobre a música; saves e instâncias de QA ficam separados das partidas.
Os resultados no emulador não substituem uma validação em GBA físico.

## Penedos do Vento · direção costeira V2

A plataforma conserva o mundo de 960 × 320 e a câmera de 240 × 160. A paisagem fica em
BG3, o terreno em BG2, os sete atores em OBJ e a HUD em peças OBJ independentes.
A abertura e as colisões seguem a composição V2: ponte contínua, penedos orgânicos,
escada e checkpoint. A câmera mantém y=160; entrada e retorno por dano acompanham
o novo layout. As habilidades, o áudio e a progressão de campanha permanecem. A origem,
aprovação e transformações estão em
`fixtures/asset-provenance/platformer-approved-sources.md` no aplicativo.

Em `apps/desktop-electron`, exporte e confira os pixels e o percurso real:

```sh
node scripts/build-platformer-playtest.mjs /caminho/penedos-export
node scripts/smoke-platformer-approved.mjs /caminho/penedos-export/build/exemplo.gba /caminho/penedos-evidencias
node scripts/verify-platformer-v2-hud.mjs /caminho/penedos-evidencias /caminho/penedos-export
npm run smoke:exemplo-scenes -- --scene=penedos_vento
```

O verificador de HUD compara molduras, ícones, corações e glifos em cinco
estados de vida/fichas com o framebuffer real. Use a interface em português
na instância isolada de QA do Play. A validação física do GBA
continua separada.

### Contratos, restauração e regressões de ROM

`eventExecutionContract.ts` centraliza a interpretação inicial, duração de espera
em frames (0–32767), recursos declarados e planos de entrada/restauração. Comandos
com semântica específica de cena continuam explicitamente `runtime-defined`.
O Preview executa `attach_button`/`remove_button` e condições `if_button` no
contexto do botão. O evento de cena `onRestore` existe para Topdown e Platformer;
é síncrono, expande chamadas e rejeita esperas/trocas de cena. Estados de mapa
são reaplicados antes dele. Inicialização de missão legada permanece explícita
na política de carregamento; objetos novos usam `restore-only`.

O painel de prefabs cria objetos interativos usando eventos existentes e mostra
as instâncias afetadas. Edições de instância registram `prefabOverrides`, que
prevalecem durante sincronização. Plataforma ativada move o ator por evento;
transporte automático do jogador não é uma capacidade adicionada por esse preset.

Em Testes e diagnóstico, habilite a origem dos eventos antes de compilar. O build
escreve `event_source_map.json` com endereços nativos, IDs dos passos e hash da
ROM. Ao copiar a ROM para a raiz do projeto, preserva o mapa em
`<nome>.gba.events.json`. O Play só associa o mapa à ROM com hash correspondente. O rastro circular
nativo armazena quatro passos (80 bytes em EWRAM); `debug_set_event_trace_enabled`
permite suspender a coleta. A UI permite abrir o evento correspondente.

A fila DMA expõe fences Pending/Complete/Canceled. Buffers mutáveis de decode e
reservas de destino esperam o último upload antes de reutilizar memória. Essas
barreiras de carregamento podem aguardar vários VBlanks; a publicação de render
continua sob o protocolo existente do motor. `visibility_render_status` informa
quando transições ou efeitos concorrentes suspendem a visibilidade.

O launcher separa entradas C/C++/headers de logs e relatórios. Declare dados
binários e outros arquivos autorais em `build.inputs`, com caminhos relativos.
Dependências do compilador continuam verificadas por conteúdo. Cada build gera
`build_decisions.json`, indicando entradas alteradas, fontes recompiladas e
reutilização direta ou de variante.

Execute em `apps/desktop-electron`:

```sh
node scripts/smoke-event-replay.mjs ../../packages/GBAStudioEngine/dist/GBAStudioEnginePack /caminho/qa-replay
node scripts/smoke-map-states.mjs ../../packages/GBAStudioEngine/dist/GBAStudioEnginePack /caminho/qa-map
node scripts/smoke-visibility-graphics.mjs ../../packages/GBAStudioEngine/dist/GBAStudioEnginePack /caminho/qa-graphics
node scripts/smoke-hardware-diagnostic.mjs ../../packages/GBAStudioEngine/dist/GBAStudioEnginePack /caminho/qa-hardware
```

A CI normal executa essa seleção de ROMs ARM no mGBA, além dos testes host e do
editor. O replay compara checkpoints estáveis após cada sequência de entrada;
não certifica equivalência de cada frame de todos os comandos/runtimes. O gate
canônico completo continua obrigatório. O [roteiro físico de versão](hardware-release-validation.md)
registra a fronteira que o emulador não cobre.

## Farol · relé persistente

O relé auxiliar da V2 aprovada ocupa a área livre à direita da lente do Farol.
É um ator independente de 48 × 48 pixels, com os estados avariado, instalação
e funcionando. A interação reutiliza os requisitos, a peça de inventário e a
fechadura de código da missão “O sinal perdido”. O reparo toca os efeitos
existentes e salva no slot 0; não cria outra recompensa.

`var_farol_relay` acompanha a apresentação: 0 avariado, 1 instalação e
2 funcionando. Ao entrar ou restaurar a sala, o progresso da missão determina
o estado estável. O `onRestore` mantém o watchdog da calibração. O novo jogo
reinicia o relé. A passarela foi retirada: mapa, colisão, escada, fundo aprovado,
personagens existentes e HUD permanecem preservados em suas camadas.

`scripts/farol-relay.mjs` aplica a promoção de forma idempotente. A origem,
aprovação da V2 e preparação do sprite estão em
`fixtures/asset-provenance/farol-relay-v2.json`. O atlas de três estados usa
15 cores visíveis, alpha binário e quatro objetos por frame. Na ROM, o ator
reutiliza a paleta OBJ de 8 bpp já aprovada dos NPCs; isso evita reservar outro
banco e mantém as cores dos personagens e da interface. O resultado final,
incluindo a conversão de cores, foi aprovado no Play e na ROM em 24/10/2026.

Execute em `apps/desktop-electron`, usando diretórios externos para os artefatos:

```sh
node scripts/build-racing-playtest.mjs /caminho/farol-export titulo
node scripts/smoke-lost-signal-mission.mjs /caminho/farol-export/build/exemplo.gba /caminho/farol-export /caminho/farol-rom --relay
node scripts/smoke-lost-signal-play.mjs /caminho/farol-play --relay
node scripts/verify-farol-relay-pixels.mjs /caminho/farol-rom
node scripts/verify-farol-relay-pixels.mjs /caminho/farol-play
```

O percurso usa entradas de controle para completar a missão, cancelar a
fechadura, errar e acertar o código, observar os três estados e revisitar o relé.
Salva antes e depois do reparo, reinicia, carrega e verifica a peça real e o
progresso; também troca e restaura os três idiomas. Diagnósticos são somente
leitura e os saves vêm do próprio jogo. O Play usa relógio de teste para
sincronizar as entradas; esse smoke não mede desempenho em tempo real.
O verificador compara o framebuffer com o fundo aprovado e com os pixels do
relé na paleta compilada, incluindo a região da escada. Play e ROM direta usam
o núcleo mGBA, mas exercitam caminhos de integração distintos. O teste em GBA
físico permanece uma verificação separada.
