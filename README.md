# GBA Studio

[![CI da branch develop](https://github.com/memory-pak-labs/gba-studio/actions/workflows/ci.yml/badge.svg?branch=develop)](https://github.com/memory-pak-labs/gba-studio/actions/workflows/ci.yml)

GBA Studio é um editor visual de código aberto para criar jogos de Game Boy
Advance. No editor, você pode montar cenas, posicionar atores e gatilhos, criar
eventos, importar gráficos e áudio e exportar uma ROM `.gba`.

O aplicativo desktop usa Electron e o motor próprio GBAStudioEngine, escrito
em C/C++. É um projeto da Memory Pak Labs.

[Site oficial](https://gbastudio.dev.br/) · [Guia de uso](https://gbastudio.dev.br/guia) · [Memory Pak Labs](https://github.com/memory-pak-labs)

## Instalação

Escolha o pacote para seu sistema operacional na página oficial de downloads.
Consulte as notas de cada versão para ver os requisitos e as instruções do pacote.

[Downloads do GBA Studio](https://gbastudio.dev.br/download) · [Releases no GitHub](https://github.com/memory-pak-labs/gba-studio/releases)

## Desenvolvimento

Use Git, npm e a versão do Node.js indicada em [`.nvmrc`](.nvmrc).

```sh
git clone --branch develop https://github.com/memory-pak-labs/gba-studio.git
cd gba-studio/apps/desktop-electron
npm ci
npm run dev
```

O guia de desenvolvimento explica como configurar a toolchain, compilar o
Engine Pack e executar as verificações. [Guia de desenvolvimento](docs/development.md)

| Diretório | Conteúdo |
| --- | --- |
| [`apps/desktop-electron`](apps/desktop-electron) | Editor, exportação e Play |
| [`packages/GBAStudioEngine`](packages/GBAStudioEngine) | Motor, compilador de assets e ferramentas |
| [`packages/project-contract`](packages/project-contract) | Contrato e operações de leitura e escrita de `.gba-project` |
| [`packages/scene-contracts`](packages/scene-contracts) | Contratos compartilhados dos tipos de cena |
| [`tools/gba-sprite-prep`](tools/gba-sprite-prep) | Preparação e validação de sprites e fundos |

## Contribuição e suporte

Use as Discussions para dúvidas e ideias e as Issues para relatar bugs ou propor
melhorias específicas. O guia de contribuição descreve o fluxo de revisão para
`develop`.

[Discussions](https://github.com/memory-pak-labs/gba-studio/discussions) · [Issues](https://github.com/memory-pak-labs/gba-studio/issues) · [Contribuir](CONTRIBUTING.md) · [Suporte](SUPPORT.md)

## Licenças e créditos

O código do editor e do motor usa a licença MIT. Os recursos visuais e as
dependências de terceiros têm seus termos registrados separadamente.

[Licença MIT](LICENSE) · [Licenças dos assets](ASSET_LICENSES.md) · [Avisos de terceiros](THIRD_PARTY_NOTICES.md)

O fluxo do editor tem como referência o GB Studio. Tonc e Butano são
referências técnicas para o desenvolvimento no Game Boy Advance.

[GB Studio](https://github.com/chrismaltby/gb-studio) · [Tonc](https://github.com/gbadev-org/tonc) · [Butano](https://github.com/gvaliente/butano)
