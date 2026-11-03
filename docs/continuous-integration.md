# Matriz de integração contínua

`.github/workflows/ci.yml` configura as seguintes verificações em pushes e PRs
para `develop`, além da execução manual. A configuração não é evidência de run
aprovado; consulte os resultados do commit que será integrado.

| Camada | Linux | Windows | macOS |
| --- | --- | --- | --- |
| Testes do Editor, tipos e build | ubuntu-24.04 | windows-2022 | macos-15 |
| Editor renderizado: criar, salvar, conferir reabertura | Xvfb | Desktop do runner | Desktop do runner |
| Testes host da engine | clang | MSYS2 UCRT64/clang | clang do Xcode |
| Compilação ARM e roteiros funcionais das 14 ROMs | devkitPro fixado por digest | — | — |
| Replay das mesmas ROMs e comparação de 28 frames | Node/core mGBA fixado | Node/core mGBA fixado | Node/core mGBA fixado |

## Editor e logs

Os jobs usam `.nvmrc`, Python 3.11/Pillow e `npm ci`, sem mudar versões no lock.
O instalador do binário da versão fixada de Electron é executado explicitamente:
a presença do pacote JavaScript não comprova que o executável foi baixado.

Em `apps/desktop-electron`, a sequência principal é:

```sh
npm ci
node node_modules/electron/install.js
npm run test:all -- --exclude src/shared/projectOpenPerf.test.ts --reporter=default --reporter=json --outputFile=artifacts/ci-tests/results.json
npm run test:perf:project-open
npm run build
npm run verify:mgba-web
node scripts/smoke-electron-welcome.mjs
```

A auditoria funcional das 36 cenas roda em `project-integration`, com um worker,
depois dos testes unitários. Seu limite de 60 segundos e as verificações de
todas as cenas permanecem iguais; a separação evita concorrência de fixtures
grandes no Windows. A medição de abertura roda separada dos demais testes e
antes do build, sem
outra carga pesada no mesmo job. O build já inclui typecheck. Não existe lint
dedicado do aplicativo.

No Linux, o último comando usa `xvfb-run -a`. Antes do teste, o runner prepara
o helper `chrome-sandbox` da cópia de Electron baixada como
`root:root`, modo `4755`, conforme exigido pelo Chromium. Isso fica restrito ao
checkout descartável do CI e não desliga o sandbox.
O fluxo abre uma instância isolada, confere o primeiro uso em inglês, muda para
português, cria/salva o exemplo e
confere a leitura do projeto salvo pela ponte do aplicativo. Não é um teste
dos diálogos nativos de arquivo ou da instalação final. A instância e seu
perfil temporário são encerrados ao terminar.

`GBA_STUDIO_SMOKE_OUTPUT_DIR` escolhe a pasta de evidência. O smoke conserva as
capturas da abertura e do Editor, stdout/stderr e, quando o renderer responde,
uma captura da falha antes de fechar a conexão. A captura de falha tem timeout;
um renderer morto não deve deixar a coleta esperando indefinidamente.

O upload `CI-editor-<plataforma>` roda inclusive em falhas e contém JSON dos
testes, capturas/logs disponíveis e o build quando ele foi produzido. Os logs
host ficam em `CI-engine-<plataforma>`. Falha anterior ao build pode impedir
a produção de imagens ou binários; isso não é convertido em aprovação.

## Produtor ARM e consumidores

O job Linux existente `rom-regressions` compila o Pack e executa os cinco
roteiros descritos em [regressões de ROM](rom-regressions.md). Conserva a saída
do container e os resultados em `ARM-ROM-regressions`, inclusive em falhas.
Quando passa, publica também `CI-ROM-Engine-Pack` como artefato desta execução.

Os três jobs `rom-replay` dependem desse produtor e baixam os dois artefatos
da mesma execução, sem selecionar runs anteriores. Exigem que a revisão
declarada pelo produtor seja exatamente `${{ github.sha }}`. O produtor marca
somente o checkout `/work` como seguro no Git do container temporário, para
registrar seu SHA sem alterar a configuração Git do host.

O consumidor não instala npm, Python ou compilador. Ele verifica o catálogo
completo, recibos contra os arquivos, hashes do Pack, core e baseline, e
executa as mesmas 14 ROMs nos frames de emulação 180 e 240. Os 28 PNGs e o
relatório ficam em `CI-ROM-replay-<plataforma>`, também em falhas.

Essa comparação verifica a reprodução do mesmo binário/core em hosts
diferentes. Os controles, colisão, áudio e save dos roteiros funcionais são
testados no produtor; o replay declara `functionalReplay: false` e não atribui
ao Windows/macOS uma compilação ou um roteiro que não executou.

## Limites de aprovação

Os artefatos permanecem por sete dias. As Actions continuam fixadas por SHA e
o workflow tem apenas `contents: read`. Não assina, publica, integra ou distribui
uma release. O workflow manual de instaladores continua separado.

Uma execução local em macOS não valida Windows/Linux nem os runners hospedados.
O próximo gate remoto é executar esta revisão e conferir todos os jobs e
artefatos. Um run falho, cancelado, ausente ou parcial não fecha a matriz.
O gate global do projeto, instaladores, compatibilidade de outras arquiteturas
e testes em GBA físico são evidências adicionais, separadas desta configuração.
