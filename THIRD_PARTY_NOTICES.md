# Avisos de terceiros

A MIT do projeto aplica-se ao código de sua autoria. Não substitui licenças ou
avisos de componentes e recursos de terceiros.

| Componente | Uso | Licença / fonte |
| --- | --- | --- |
| [GB Studio](https://github.com/chrismaltby/gb-studio) | Referência para conceitos, nomes e organização da autoria de eventos | MIT; [aviso preservado](apps/desktop-electron/default-assets/licenses/gb-studio-events-MIT.txt) |
| [mGBA 0.10.5](https://github.com/mgba-emu/mgba/tree/26b7884bc25a5933960f3cdcd98bac1ae14d42e2) | Core WebAssembly do Play | MPL-2.0; [texto](apps/desktop-electron/static/WebPlayer/licenses/mGBA-MPL-2.0.txt) |
| [Model Context Protocol TypeScript SDK 2.4.0](https://github.com/modelcontextprotocol/typescript-sdk) | Servidor MCP e biblioteca core | Transição entre Apache-2.0 e MIT; [licenças e aviso originais](apps/desktop-electron/default-assets/licenses/model-context-protocol-2.4.0.txt) |
| [SpriteFusion Pixel Snapper](https://github.com/Hugo-Dz/spritefusion-pixel-snapper/tree/586836f38b107ba530c4014767cc05e4c70336ac) | Dependência da ferramenta opcional de preparação visual | MIT; [aviso](tools/gba-sprite-prep/LICENSE-SPRITEFUSION) |
| [Kenney](https://kenney.nl/assets) | Três recortes usados no piloto da ferramenta de sprites | CC0-1.0; [fontes individuais](tools/gba-sprite-prep/pilot/SOURCES.md) |

## mGBA e disponibilidade do código-fonte

O manifest do core registra o commit upstream e o SHA-256 do WASM.
O wrapper do projeto está em
`apps/desktop-electron/third_party/mgba-web/mgba_web.c`, e o comando
`npm run build:mgba-web` em `apps/desktop-electron` obtém a versão upstream
indicada e compila o core com Emscripten e CMake.

As partes cobertas pela MPL permanecem sob MPL-2.0. Os links de código-fonte,
o wrapper e a receita de compilação acompanham a distribuição do core;
alterações em arquivos cobertos precisam preservar seus avisos e obrigações.

## Dependências instaladas

O pacote macOS Universal inclui CPython/Pillow (PSF/MIT-CMU e avisos das
bibliotecas incorporadas), xPack GNU Arm (GPL e exceções dos componentes) e
GNU make 4.4.1 (GPL-3.0). São executáveis independentes usados para gerar ROMs;
mantêm suas licenças e não recebem a MIT do editor. Versões, URLs e SHA256
ficam em `apps/desktop-electron/scripts/portable-runtime-sources.json`.
As receitas de montagem estão em `prepare-macos-support-runtime.mjs` e
`prepare-macos-universal-toolchain.mjs`. O pacote preserva os avisos upstream,
os links de acesso às fontes, a fonte/receita do gbafix e a fonte do GNU make.

Dependências npm e Cargo são obtidas pelos lockfiles; não são vendorizadas neste
repositório. Seus textos de licença acompanham os respectivos pacotes.
Ao empacotar uma distribuição, confira os avisos do Electron, dos modelos de
tradução, do compilador e de qualquer ferramenta embarcada. Um build local do
editor não é uma auditoria de licença do instalador completo.

Tonc e Butano são referências técnicas. Nenhuma referência autoriza copiar
assets ou retirar os avisos de código eventualmente incorporado. A lista
acima registra os componentes e recursos identificados nesta preparação,
sem substituir a revisão de novas contribuições.
