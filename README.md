# GBA Studio

Editor visual e motor próprio para criar jogos de Game Boy Advance.
O projeto pertence à [Memory Pak Labs](https://github.com/memory-pak-labs).

**Beta em desenvolvimento.** Esta base comunitária parte do código da beta.3
(`0.1.0-beta.3`, Engine Pack `2.26.0`). APIs e formato de projeto ainda podem
mudar. A experiência lembra o GB Studio; o alvo é GBA e os limites do hardware
fazem parte do desenvolvimento.

## Baixar a beta

Os instaladores da [beta.3](https://github.com/memory-pak-labs/gba-studio/releases/tag/v0.1.0-beta.3)
incluem Python, compilador ARM e Engine Pack para gerar ROMs sem instalar
Python ou devkitPro separadamente.

| Sistema | Download recomendado |
| --- | --- |
| macOS 12+, Apple Silicon | [DMG assinado e notarizado](https://github.com/memory-pak-labs/gba-studio/releases/download/v0.1.0-beta.3/GBA-Studio-0.1.0-beta.3-macOS-arm64.dmg) |
| Windows x64 | [Instalador EXE](https://github.com/memory-pak-labs/gba-studio/releases/download/v0.1.0-beta.3/GBA.Studio.Setup.0.1.0-beta.3.exe) |
| Linux x86_64, testado no Ubuntu 24.04 | [Pacote DEB](https://github.com/memory-pak-labs/gba-studio/releases/download/v0.1.0-beta.3/GBA-Studio-0.1.0-beta.3-linux-amd64.deb) |

A [página da Release](https://github.com/memory-pak-labs/gba-studio/releases/tag/v0.1.0-beta.3)
também oferece ZIP, AppImage, TAR.GZ, checksums, licenças, acesso às fontes e
instruções de instalação. O Windows ainda não tem assinatura Authenticode e
pode exibir aviso do SmartScreen. Esta beta macOS é para Apple Silicon.
Faça uma cópia dos seus projetos antes de testar.

## Estrutura

| Diretório | Conteúdo |
| --- | --- |
| `apps/desktop-electron` | Editor Electron, interfaces, exportadores e Play |
| `packages/GBAStudioEngine` | Motor C/C++, compilador de assets, templates e ferramentas |
| `packages/project-contract` | Leitura, escrita e contrato de `.gba-project` |
| `packages/scene-contracts` | Contratos compartilhados dos tipos de cena |
| `tools/gba-sprite-prep` | Preparação e validação de sprites e backgrounds |
| `docs` | Arquitetura e desenvolvimento |

## Executar o editor

Requisitos: Git, Node.js 22 e npm. Na raiz, `nvm use` seleciona a versão
indicada em `.nvmrc` quando o nvm estiver instalado.

```sh
git clone https://github.com/memory-pak-labs/gba-studio.git
cd gba-studio/apps/desktop-electron
npm ci
npm run dev
```

O motor e a toolchain são necessários para exportar e jogar uma ROM real.
Leia [Desenvolvimento](docs/development.md) para compilar o Engine Pack,
configurar devkitARM e executar as verificações.

## Contribuir

Comece por uma Issue, faça um fork e envie um Pull Request pequeno com a
explicação e as verificações executadas. Contribuições passam por revisão dos
mantenedores. [Guia de contribuição](CONTRIBUTING.md).

A CI verifica a suíte completa de testes, tipos e build do editor, além dos testes
host do motor. O gate completo continua sendo uma verificação distinta de
Editor, exportação e Play; CI, hardware físico e outros sistemas não devem ser
inferidos a partir de uma compilação local.

## Licenças e créditos

O código de autoria do projeto, incluindo editor e motor, usa a
[licença MIT](LICENSE). Dependências e recursos de terceiros mantêm seus próprios
termos: [Avisos de terceiros](THIRD_PARTY_NOTICES.md).

Os assets têm registro separado em [Licenças dos assets](ASSET_LICENSES.md).
A licença do código não altera os direitos sobre assets importados pelos
usuários. Quem cria um jogo escolhe os termos de seu conteúdo e deve respeitar
as licenças de componentes e recursos que distribuir.

GB Studio, mGBA, devkitPro/devkitARM, Tonc e Butano são projetos independentes.
Este repositório não implica afiliação ou endosso desses projetos ou da Nintendo.
