# Desenvolvimento

## Editor

Use Node.js 22 (a versão principal está em `.nvmrc`). Os comandos npm são
executados em `apps/desktop-electron`, pois a raiz não é um pacote npm.

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

A CI proposta executa os testes do editor, tipos, build e testes host do motor
no Linux. O gate completo local, outros sistemas, empacotamento e hardware
possuem limites distintos de evidência.

Instaladores oficiais são publicados por mantenedores após validação própria.
Assinatura e notarização usam credenciais privadas fora do repositório; PRs de
contribuidores não precisam dessas credenciais.
