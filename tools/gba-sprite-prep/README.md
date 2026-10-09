# GBA Sprite Prep

Ferramenta interna de desenvolvimento para preparar imagens e spritesheets para o GBA Studio.
Ela não é compilada pelos comandos de empacotamento do editor nem incluída
no aplicativo distribuído. PNG/GIF já preparados continuam sendo importados
pelo editor; o Engine Pack mantém a conversão dos assets para a ROM.
Ela usa o algoritmo do Sprite Fusion Pixel Snapper para reconstruir a grade de imagens geradas por
IA e, em seguida, aplica um contrato específico do GBA:

1. separação de uma faixa horizontal em frames antes do snapping;
2. uma única escala compartilhada por toda a animação;
3. alinhamento por uma âncora compartilhada;
4. canvas determinístico por perfil, sem colapsar o tamanho final;
5. staging visual preservado antes da redução; o orçamento de até 15 cores
   visíveis compartilhadas, convertido para RGB555 mais transparência, só é
   aplicado ao candidato OBJ de runtime depois da revisão;
6. metadata de animação compatível com o schema atual do GBA Studio;
7. relatório JSON com custo 4bpp, VRAM/OAM, compatibilidade atual e avisos de metasprite;
8. preview nearest-neighbor sobre fundo quadriculado;
9. importação em uma cópia autocontida do projeto, sem alterar o projeto original;
10. export pelo contrato atual do app, `assetc`, `gbsdoctor`, `gbsbuild` e smoke do mGBA.
11. pacotes multiestado com nome, estado, direção, FPS e modo de loop preservados.
12. presets por tipo de ator e processamento em lote com aprovação explícita.
13. Inspector com estimativa de economia por frames idênticos ou espelhados.
14. contrato v2 que associa automaticamente estados, direções e frames de uma grade 2D.
15. validador separado de backgrounds que diferencia preparação 4bpp, otimização de tiles e pack global.

O Sprite Fusion Pixel Snapper está fixado no commit
`586836f38b107ba530c4014767cc05e4c70336ac`. A atribuição e a licença MIT original estão em
`LICENSE-SPRITEFUSION`.

## Regra de preservação visual

Antes de usar a CLI, leia
`.codex/skills/prepare-gba-visual-assets/references/visual-preservation.md`.
Toda fonte deve gerar primeiro uma prévia nearest-only, sem quantização global,
para comparação em 1× e ampliada. A fonte original, essa prévia e o candidato
de runtime ficam separados.

Reduzir uma imagem grande para 240×160 e uma paleta global de 16 cores pode
destruir detalhe funcional. Para backgrounds, não aplicar automaticamente o
limite de 15 cores de OBJ: usar o consumidor BG e o `assetc`, com tiles e
bancos de paleta. Para atores, medir o alpha antes de escolher o limiar e usar
uma paleta adaptativa que preserve famílias funcionais de cor; não escolher
somente as cores mais frequentes. Um pacote que passa estruturalmente ainda
precisa ser rejeitado se perder silhueta, contraste ou cores importantes.

## Uso

### Piloto com assets reais

O piloto versionado usa três assets CC0 de Kenney para validar NPC top-down, player platformer e
inimigo no perfil livre. Ele materializa projetos-base próprios e não altera os fixtures originais:

```bash
tools/gba-sprite-prep/gba-sprite-pilot \
  tools/gba-sprite-prep/pilot/output
```

O resultado consolidado fica em `pilot/output/pilot-summary.json` e `pilot-summary.md`. Cada caso
também preserva PNG preparado, preview, relatório, projeto autocontido, export do Engine Pack, ROM e
evidência do smoke. As fontes e licenças estão em `pilot/SOURCES.md`.

O caso platformer liga uma sheet 16×32 ao ator configurado como jogador. O export resolve o
`metasprite` no contrato, ancora a arte pelos pés sobre a colisão 16×16 e reserva os índices OAM
ocupados pelas duas partes antes de desenhar inimigos e plataformas móveis. O runtime seleciona
animações canônicas `idle`, `walk`, `jump` e `fall` a partir do estado físico do ator. Quando o
projeto possui somente uma animação, ela é usada como padrão para os quatro estados; quando não
possui animação, o `metasprite` estático continua sendo o fallback.

O caso livre usa um frame lógico 96×64. O pipeline o decompõe automaticamente em OBJ 64×64 e
32×64, empacota os tiles de cada parte de forma contígua e mantém o conjunto centralizado pelos pés
sobre a caixa de colisão do ator.

### Pipeline completo em um comando

A pasta de saída deve estar vazia. O comando abaixo prepara a sheet, cria uma cópia do projeto,
liga o ator, exporta o Engine Pack, gera a ROM e grava a evidência auditável:

```bash
tools/gba-sprite-prep/gba-sprite-pipeline \
  sheet-gerada-por-ia.png resultado-sprite \
  --project caminho/jogo.gba-project \
  --actor actor-player \
  --sprite-name hero_walk.png \
  --profile topdown \
  --frames 6 \
  --animation-name walk_down \
  --state walk \
  --direction down \
  --fps 10
```

Para uma sheet que já está pixel-perfect, acrescente `--no-snap`. O resultado contém:

```text
resultado-sprite/
├── prepared/
│   ├── hero_walk.png
│   ├── hero_walk.animation.json
│   ├── hero_walk.preview.png
│   └── hero_walk.report.json
├── project/
│   ├── jogo.gba-project
│   └── Assets/
└── engine-export/
    ├── build/<alvo>.gba
    ├── export_project.json
    ├── mgba_smoke_report.md
    └── sprite_pipeline_evidence.json
```

O `sprite_pipeline_evidence.json` confirma o ator, a sheet, o nome da animação, a quantidade de
frames, o asset OBJ exportado, a versão do Engine Pack, o resultado do doctor/build, tamanho e SHA-256
da ROM.

### Pacote completo de animações

### Fonte nativa GBA: preflight sem perda

Use o contrato opt-in `"sourceContract": "gba-native"` quando a arte já foi
criada na grade final do sprite. Antes de qualquer preparação, ele exige:

- células iguais, em uma grade declarada pelo `layout`;
- cada célula em resolução nativa ou múltiplo inteiro uniforme dela;
- alpha binário (`0` ou `255`), sem bordas suavizadas;
- no máximo 15 cores RGB555 visíveis para o contrato OBJ 4 BPP atual;
- gutters, margens e espaçamentos inteiramente transparentes.

O caminho estrito não recorta nem recentraliza a arte: reduz a célula completa
somente com nearest-neighbor e preserva sua âncora visual. Audite o candidato
antes de empacotá-lo:

```bash
tools/gba-sprite-prep/gba-sprite-audit caminho/sprite-pack.json
```

Exemplo para quatro poses de um jogador SHMUP de 64×64 desenhadas em escala 4×:

```json
{
  "schemaVersion": 1,
  "name": "player-flight",
  "source": "player-flight-1024x256.png",
  "preset": "shmup-player-large",
  "sourceContract": "gba-native",
  "layout": { "mode": "horizontal", "columns": 4 },
  "animations": [
    { "name": "fly_right", "state": "walk", "direction": "right", "fps": 8, "frames": [0, 1, 2, 3] }
  ]
}
```

### Staging de candidato gerado

Quando um gerador entregar uma prévia grande, com matte quadriculado e sem
alpha, não trate a imagem como fonte nativa nem aplique automaticamente a
paleta 4 BPP. Primeiro declare os recortes de cada pose e faça o staging na
grade lógica:

```bash
tools/gba-sprite-prep/gba-sprite-stage-candidate conceito.png staging.png \
  --size 64x64 \
  --region 0,160,512,512 --region 512,160,512,512 \
  --matte-min 240 --matte-spread 8 \
  --report staging-report.json
```

O comando remove somente pixels claros e neutros conectados à borda, preserva
brilhos internos, aplica `nearest-neighbor` nos recortes declarados e informa
quantas cores RGB555 restaram. Por padrão ele preserva a paleta da prévia:
isso permite revisar a versão 1× antes de escolher a paleta OBJ.

`--matte-min` é uma operação de limpeza de matte, não um limiar universal de
alpha. Em fontes RGBA, medir o histograma e revisar a máscara antes de fixar o
valor; um limiar alto pode remover partes reais do ator.

Use `--reduce-to-4bpp` apenas depois da revisão visual explícita da prévia
preservada. Essa é uma seleção adaptativa de até 15 cores visíveis mais
transparência; não é a compressão de dados da ROM e não pode eliminar cores
funcionais para fazer o relatório passar. A compressão opcional do `assetc`
ocorre somente na exportação e não pode ser usada para alterar a aparência
aprovada.

Esse exemplo corresponde a quatro células de `256×256`, que se reduzem
deterministicamente para quatro frames de `64×64`. Caso o preflight falhe, a
fonte deve ser reconstruída ou gerada novamente; o empacotador não a adapta
silenciosamente.

O comando `gba-sprite-pack` recebe um manifesto versionado, prepara todos os estados em uma única
sheet e gera `PNG`, relatório, metadata consolidada e preview. Com `--project`, importa todas as
animações em uma cópia do projeto e liga a primeira animação ao ator escolhido:

```bash
tools/gba-sprite-prep/gba-sprite-pack \
  tools/gba-sprite-prep/fixtures/meta1-sprite-pack.json \
  resultado-pacote \
  --no-snap \
  --project caminho/jogo.gba-project \
  --project-output resultado-projeto/jogo.gba-project \
  --actor actor-player
```

O caminho de `source` é resolvido a partir da pasta do manifesto. A imagem original nunca é
sobrescrita. No contrato v2, `animationGrid` transforma a semântica da grade em animações sem
exigir a enumeração manual dos índices:

```json
{
  "schemaVersion": 2,
  "name": "hero",
  "source": "hero-source.png",
  "profile": "topdown",
  "layout": { "mode": "auto" },
  "animationGrid": {
    "directionAxis": "rows",
    "directions": ["down", "left", "right", "up"],
    "states": [
      { "state": "idle", "frameCount": 1, "fps": 8 },
      { "state": "walk", "frameCount": 3, "fps": 12 },
      { "state": "attack", "frameCount": 2, "fps": 10, "loops": false }
    ]
  }
}
```

Nesse exemplo, cada direção ocupa uma linha e os estados ocupam blocos consecutivos de colunas. A
ferramenta gera `idle_down`, `walk_down`, `attack_down` e as equivalentes das demais direções,
calcula seus índices de origem e grava `sourceFrameIndex` em cada frame do pacote preparado. Use
`directionAxis: "columns"` quando as direções estiverem distribuídas em colunas. `firstRow` e
`firstColumn` deslocam a área semântica dentro de uma tilesheet maior; `offset` em um estado permite
pular células ou selecionar um bloco não consecutivo aos anteriores.

Sheets irregulares continuam podendo declarar `animations` explicitamente. `animationGrid` e
`animations` são alternativas exclusivas para evitar associações ambíguas.

Os estados aceitos nesta versão são `idle`, `walk`, `jump`, `fall`, `attack` e `hurt`. As direções aceitas são
`none`, as quatro cardeais e as quatro diagonais. Cada par estado/direção e cada nome precisam ser
únicos. Para o perfil `free`, o manifesto também deve informar `width` e `height`.

O bloco `layout` aceita `horizontal`, `vertical`, `grid` e `auto`. Em `grid`, `rows` e `columns`
são obrigatórios; `margin` representa a borda externa e `spacing` a distância transparente entre
células. O modo `auto` procura separadores totalmente transparentes e, quando não os encontra,
usa as dimensões inferidas por `animationGrid` para dividir até sheets 2D totalmente opacas. Sem
uma grade semântica, tenta uma divisão horizontal ou vertical uniforme com confiança menor. O relatório registra a
estratégia, confiança e, para cada frame, linha, coluna, retângulo de origem, vazio e referência à
primeira duplicata exata. O bloco manual serve como correção explícita para qualquer detecção
automática inadequada. Sem `layout`, o contrato continua sendo uma faixa horizontal uniforme.

### Inspector de Animação

Todo pacote também gera `resultado/inspector/` com:

- `numbered.png`: frames numerados por animação;
- `idle_down.gif`, `walk_down.gif` etc.: GIFs com o FPS e o modo de loop do manifesto;
- `preview.gif`: sequência consolidada preservando a duração própria de cada animação;
- `hardware.png`: canvas, decomposição em OBJs, pivô e caixa de colisão;
- `onion-skin.png`: frame anterior em vermelho e atual em verde;
- `before.png`, `after.png` e `comparison.png`: comparação estática;
- `inspector.html`: comparação interativa antes/depois por slider;
- `inspector.json`: orçamento e diagnósticos auditáveis.

O relatório classifica VRAM, OAM total, pior caso por scanline e paleta como `safe`, `attention` ou
`impossible`. Também registra deslocamento entre frames, quantidade de pixels alterados, halos de
alfa, cortes nas bordas e frames duplicados. A deriva de escala agora é calculada dentro de cada
animação, com a deriva da âncora separada; diferenças de largura entre direções não são tratadas
como erro global. A antiga métrica `paletteFlickerFrames` é representada como
`paletteSetVariationFrames`: ela informa quando uma pose usa um subconjunto diferente do banco
global, sem alegar troca de paleta de hardware. Use
`--scene-actors`, `--collision-width` e `--collision-height` para simular o custo da cena e o
overlay de colisão.

O bloco `optimization` de `inspector.json` lista frames exatamente repetidos, frames que podem
reutilizar outro frame com `hflip` e a economia estimada de VRAM. O campo `resource` registra o
otimizador estrutural OBJ: tiles 8×8 idênticos antes/depois, bytes economizados e invariantes
`visualErrorPixels`, `anchorAdjustments` e `paletteChanges`. Esses valores devem permanecer zero:
o otimizador não quantiza cores, não redimensiona, não recorta e não move a âncora.

No Engine Pack, o `assetc` deduplica blocos OBJ idênticos e espelhados preservando a contiguidade
dos tiles de cada OBJ. O reuso de frames espelhados no Inspector é conservador por padrão porque
atores podem carregar bolsas, ferramentas ou outros elementos assimétricos. Um pacote só pode
ativá-lo explicitamente:

```json
{
  "schemaVersion": 2,
  "name": "actor",
  "source": "actor.png",
  "profile": "topdown",
  "optimization": { "allowMirroredFrames": true },
  "animations": []
}
```

Essa opção não autoriza fusão aproximada de tiles nem altera a arte; se a paleta ou a geometria
não couberem no contrato OBJ 4 bpp, a fonte deve ser gerada novamente.

### Presets do projeto

Os presets embutidos são `npc-topdown`, `player-topdown`, `player-platformer`,
`isometric-player`, `racing-player`, `shmup-player`, `shmup-player-large`, `world-map-player`,
`luta-fighter`, `enemy`, `boss`, `item`, `projectile`, `scenery`, `portrait` e `ui`. Eles aplicam
perfil, tamanho, caixa de colisão e quantidade de atores no orçamento do Inspector, além de
registrar estados recomendados. As flags da CLI e os campos globais do lote sobrescrevem esses
orçamentos. Consulte ou exporte um preset-base editável com:

O preset `player-topdown` usa o perfil `topdown-tall`: canvas visual 16×32, âncora nos pés e
colisão 16×16. `npc-topdown` e o perfil `topdown` permanecem 16×16 para preservar a escala dos
placeholders e NPCs compactos.

O preset `player-platformer` usa `platformer-wide`: canvas visual 32×32, um OBJ nativo 32×32,
âncora inferior central e colisão 16×16. O perfil `platformer` original permanece 16×32 para
assets compactos; a variante larga reserva espaço para salto e queda sem reduzir a altura do
personagem.

Os presets `isometric-player`, `racing-player`, `shmup-player` e `world-map-player` usam os
perfis homônimos com os canvases e caixas de colisão do contrato de entidade controlada.
`shmup-player-large` usa canvas centralizado de `64×64`, um OBJ nativo e colisão `24×24`; é indicado
para pilotos e naves detalhadas. `shmup-player` permanece em `32×32` para jogos com muitos atores.
O `luta-fighter` usa o perfil `free` em 32×64, âncora inferior central, colisão 24×48 e orçamento de
dois fighters na cena.

```bash
tools/gba-sprite-prep/gba-sprite-preset list
tools/gba-sprite-prep/gba-sprite-preset show boss
tools/gba-sprite-prep/gba-sprite-preset export boss meus-presets/chefe.json
```

No manifesto de pacote, use `"preset": "boss"` para um preset embutido ou
`"presetFile": "meus-presets/chefe.json"` para um arquivo personalizado. Os caminhos relativos são
resolvidos a partir da pasta do manifesto. O comando `export` não sobrescreve um arquivo existente.

### Processamento em lote

O lote processa todos os manifestos, preserva os erros por item e importa no projeto somente os
assets marcados como aprovados. A saída deve estar vazia:

```bash
tools/gba-sprite-prep/gba-sprite-batch lote.json resultado-lote
```

Formato atual de `lote.json`:

```json
{
  "schemaVersion": 1,
  "snap": false,
  "previewScale": 8,
  "sceneActorCount": 12,
  "collisionWidth": 16,
  "collisionHeight": 16,
  "assets": [
    {
      "manifest": "sprites/goblin.json",
      "approved": true,
      "project": "jogo.gba-project",
      "actor": "actor-goblin"
    },
    {
      "manifest": "sprites/chefe.json",
      "approved": false
    }
  ]
}
```

Cada item gera PNG, metadata, relatório, preview e Inspector em uma pasta própria. O
`batch-report.json` consolida sucessos, falhas e importações; um item inválido não interrompe os
demais. O lote também cria `inspector/index.html` e `inspector/batch-inspector.json`, com situação de
hardware, quantidade de animações/frames, erros e links para os Inspectors individuais. Fontes,
projetos e arquivos de saída existentes nunca são sobrescritos.

### Fixtures permanentes de regressão

`fixtures/regression/expected.json` versiona o contrato da suíte gerada por código. Ela reúne grade
2D com margem e espaçamento, transparência parcial, corte, mais de 15 cores, frame duplicado e frame
espelhado. O teste confere o PNG preparado, metadata, relatório, preview, todos os artefatos do
Inspector e canvases livres representativos entre 8×8 e 128×128:

```bash
cargo test --manifest-path tools/gba-sprite-prep/Cargo.toml --test regression_fixtures
```

O fixture `meta1-sprite-pack.json` também mantém quatro estados que reutilizam o mesmo frame. Ele é
usado no fechamento ponta a ponta para confirmar que o `assetc` reduz os 16 tiles originais para 4
tiles, sem perder os quatro metasprites, e que a ROM real continua compilando e passando pelo smoke.

### Somente preparação

```bash
cargo run --manifest-path tools/gba-sprite-prep/Cargo.toml -- \
  entrada.png saida.png \
  --profile topdown \
  --frames 4
```

Para uma spritesheet que já está pixel-perfect:

```bash
cargo run --manifest-path tools/gba-sprite-prep/Cargo.toml -- \
  entrada.png saida.png \
  --profile platformer \
  --frames 8 \
  --no-snap
```

Perfil livre:

```bash
cargo run --manifest-path tools/gba-sprite-prep/Cargo.toml -- \
  chefe.png chefe-preparado.png \
  --profile free \
  --width 96 \
  --height 64
```

Ao lado do PNG são gravados `saida.report.json`, `saida.animation.json` e `saida.preview.png`. Use
`--report`, `--metadata` e `--preview` para escolher outros locais.

### Enriquecimento de backgrounds

O `gba-bg-enrich` transfere materiais de uma imagem de estilo para um background existente sem
alterar suas dimensoes ou alpha, reduz a saida para RGB555 e respeita o limite de 16 cores BG:

```bash
cargo run --manifest-path tools/gba-sprite-prep/Cargo.toml --bin gba-bg-enrich -- \
  origem.png estilo.png candidato.png \
  --shades-per-class 4 \
  --texture-block 2 \
  --report candidato.report.json
```

Quando uma mesma cor da origem representa materiais diferentes, use uma mascara PNG opaca com uma
cor exata por regiao semantica. Cada pixel visivel da origem precisa estar classificado:

```bash
cargo run --manifest-path tools/gba-sprite-prep/Cargo.toml --bin gba-bg-enrich -- \
  origem.png estilo.png candidato.png \
  --semantic-mask regioes.png \
  --shades-per-class 4 \
  --texture-block 2
```

A mascara e apenas uma entrada de preparacao e nao deve ser promovida como asset do jogo. Todo PNG
resultante continua sujeito a aprovacao visual, auditoria pelo `assetc` e verificacao contra a grade
de colisoes antes de substituir a arte canonica.

Para uma fonte grande ou uma ilustração detalhada, essa saída de 16 cores não
é a primeira prévia visual. Gere e revise antes a versão nearest-only preservada
e valide depois o background pelo pack real do `assetc`, com tiles, bancos e
erro de remapeamento registrados.

### Validador de backgrounds e tilesets

O `gba-background-validate.mjs` não substitui o `assetc`: ele consolida os
relatórios produzidos pelo `assetc` e impede que uma preparação 4bpp seja
confundida com validação de produção.

Preparação de paleta/formato apenas:

```bash
node tools/gba-sprite-prep/gba-background-validate.mjs \
  --preparation-report caminho/background-preparation.json
```

Validação completa de um asset, depois de executar o `assetc` no projeto
materializado:

```bash
node tools/gba-sprite-prep/gba-background-validate.mjs \
  --preparation-report caminho/background-preparation.json \
  --tile-report caminho/background-tile-report.json \
  --pack-report caminho/asset_pack_report.json \
  --asset-id scene_background \
  --tile-budget 800 \
  --palette-banks 16 \
  --output caminho/background-validation.json
```

O resultado usa os estados `palette-prepared`, `pack-validated`, `attention` e
`impossible`. O processo retorna código zero somente para `pack-validated`;
`palette-prepared` e `attention` exigem revisão, e `impossible` bloqueia a
promoção. O relatório registra erro de remapeamento, orçamento do asset,
pressão global de `bg_tiles`/paletas, overflow e asset ausente no pack.

Quando o fluxo `engine-workflow` ou `gba-sprite-pipeline` materializa um
projeto, essa coleta também é executada automaticamente para cada BG com
`optimize_background_tiles: true`. O export precisa conter `export_project.json`,
`asset_pack_report.json` e os PNGs copiados; os artefatos são gravados em
`background-validation/` e consolidados em `background-validation.json`. Essa
etapa é evidência diagnóstica e não bloqueia `gbsdoctor`/`gbsbuild` por um
resultado `attention`; a promoção continua exigindo a revisão do mapeamento,
editor/Play, mGBA e aprovação visual.
de colisoes antes de substituir a arte canonica.

## Escopo deste marco

O pipeline aceita canvas de `8x8` a `128x128`, alinhados em múltiplos de 8. Os 12 formatos OBJ
nativos do GBA são preservados como uma única parte; os demais tamanhos são decompostos
automaticamente no menor conjunto de OBJ nativos possível, com orçamento de OAM registrado no
relatório. A importação como ator aceita até 4 OBJs por frame; canvases que excedem esse orçamento
continuam disponíveis para preparação e auditoria, mas são bloqueados no export do ator.

Quando a sheet possui uma única animação nomeada, o exporter agora preserva seu nome, as durações
derivadas do FPS e o modo `loops`; ela deixa de ser rebaixada silenciosamente para
`sheet-default`. O fallback embutido da sheet continua disponível apenas quando o projeto realmente
não fornece metadata de animação. Com mais de uma animação, os nomes continuam sendo exportados e a
evidência registra explicitamente se o runtime usou animação nomeada ou fallback.
