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

O npm instala as dependências declaradas e o Electron. Nenhuma senha Apple é
necessária para desenvolver, testar ou compilar o editor.

## Instalador macOS Universal

Em um Mac Apple Silicon com Rosetta 2, Xcode e Node.js 22, depois de compilar
o Engine Pack:

```sh
cd apps/desktop-electron
npm run package:mac:universal  # aplicativo para validação
npm run dist:mac              # DMG e ZIP, Intel + Apple Silicon
```

O preparo Universal baixa as toolchains oficiais xPack GNU Arm para arm64 e
x86_64, verifica os SHA256 fixados em `scripts/portable-runtime-sources.json`
e combina os executáveis com `lipo`. O compilador é uma ferramenta independente;
o backend continua GBAStudioEngine. A receita e as fontes do gbafix ficam no
pacote, junto aos avisos e às licenças originais do compilador.

Python/Pillow são baixados de distribuições com versão e SHA256 fixados.
GNU make é compilado para as duas arquiteturas com alvo macOS 12; sua fonte
e receita ficam no pacote. O runtime não usa cópias de ferramentas do sistema
que exijam um macOS mais recente. `verify:macos-universal-runtime` rejeita
binários incompletos ou com mínimo superior a macOS 12 e
gera a mesma ROM de teste nas duas arquiteturas. No Apple Silicon, o teste
Intel requer Rosetta 2. Para usar toolchains externas, defina o par
`GBA_STUDIO_DEVKITPRO_ARM64_SOURCE` e `GBA_STUDIO_DEVKITPRO_X86_64_SOURCE`.

Os smokes do aplicativo empacotado aceitam `GBA_STUDIO_SMOKE_ARCH=arm64` ou
`GBA_STUDIO_SMOKE_ARCH=x86_64` para forçar a arquitetura testada.

O pacote permite gerar ROMs sem instalar Python ou devkitPro no computador do
usuário. A assinatura Developer ID, notarização, tickets e Gatekeeper devem
ser verificados no DMG/ZIP final. O teste Intel por Rosetta deve ser registrado
separadamente de uma execução em um Mac Intel físico.

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
