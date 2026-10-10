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

O core Web distribuído possui fonte e hash identificados. Para recompilá-lo,
instale Emscripten e CMake e use `npm run build:mgba-web`. A licença MPL-2.0
e a receita estão em [Avisos de terceiros](../THIRD_PARTY_NOTICES.md).

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
