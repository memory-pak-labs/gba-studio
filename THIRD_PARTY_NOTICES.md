# Avisos de terceiros

A MIT do projeto aplica-se ao código de sua autoria. Não substitui licenças ou
avisos de componentes e recursos de terceiros.

| Componente | Uso | Licença / fonte |
| --- | --- | --- |
| [GB Studio](https://github.com/chrismaltby/gb-studio) | Referência para conceitos, nomes e organização da autoria de eventos | MIT; [aviso preservado](apps/desktop-electron/default-assets/licenses/gb-studio-events-MIT.txt) |
| [mGBA 0.10.5](https://github.com/mgba-emu/mgba/tree/26b7884bc25a5933960f3cdcd98bac1ae14d42e2) | Core WebAssembly do Play | MPL-2.0; [texto](apps/desktop-electron/static/WebPlayer/licenses/mGBA-MPL-2.0.txt) |
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

Dependências npm e Cargo são obtidas pelos lockfiles; não são vendorizadas neste
repositório. Seus textos de licença acompanham os respectivos pacotes.
Ao empacotar uma distribuição, confira os avisos do Electron, dos modelos de
tradução, do compilador e de qualquer ferramenta embarcada. Um build local do
editor não é uma auditoria de licença do instalador completo.

Tonc e Butano são referências técnicas. Nenhuma referência autoriza copiar
assets ou retirar os avisos de código eventualmente incorporado. A lista
acima registra os componentes e recursos identificados nesta preparação,
sem substituir a revisão de novas contribuições.
