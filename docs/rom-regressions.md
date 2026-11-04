# Regressões determinísticas da ROM

O comando reúne as cinco famílias de regressão nativa existentes, compila suas
fixtures pelo Engine Pack e executa as ROMs no core mGBA fixado do aplicativo.
Não altera o projeto aberto nem as imagens dos jogos.

Em `apps/desktop-electron`, com Engine Pack e devkitARM disponíveis:

```sh
npm run verify:rom-regressions -- --engine-pack ../../packages/GBAStudioEngine/dist/GBAStudioEnginePack --output artifacts/rom-regressions
```

Cada execução cria um diretório `run-*` exclusivo, sem apagar ou reutilizar
evidências anteriores. `report.json` informa o resultado, versão e hash da
biblioteca da engine, hashes dos conversores e do emulador, tamanho/hash de cada
ROM, logs, verificação funcional e capturas. Falhas continuam com código de
saída diferente de zero, mesmo quando outras famílias passam.

| Família | ROMs | Contratos exercitados |
| --- | ---: | --- |
| replace-tile | 6 | Tiles, sprites, paletas, colisão, câmera e mapa paginado grande |
| event-replay | 1 | Eventos, colisão e restauração de estado |
| hardware-diagnostic | 1 | Dez botões, áudio nativo e save após reboot do emulador |
| map-states | 3 | Estado visual/colisão, revisita, save e perfis Top-down/Plataforma |
| visibility-graphics | 3 | Sprites, paletas, câmera, máscaras, luz e composição de efeitos |

## Identidade e comparação visual

O pipeline confere `build/rom_build_report.json` contra o arquivo `.gba` real e
a biblioteca do Pack selecionado. Recibo ausente, bloqueado ou divergente não
vale como sucesso. A verificação funcional deve ter observado o mesmo hash.

Depois de cada fixture compilada, um boot novo sem save ou injeção de estado
captura o framebuffer nos frames **180 e 240 de emulação**, sem botões. A fixture
`visibility-graphics/resident` usa **181 e 241**: a instrumentação nativa acrescenta
um frame à carga inicial, preservando os mesmos pixels de referência e a cadência
posterior. Esses timestamps são fixos; não há espera adaptativa nem tolerância
para divergências. Os 28 hashes RGBA aprovados continuam iguais. Esses
frames não equivalem a ticks de simulação ou a uma medição de desempenho. A
comparação exata usa SHA-256 dos pixels RGBA 240×160 com alpha opaco, não dos
bytes comprimidos do PNG. A referência fica em
`apps/desktop-electron/fixtures/rom-regressions/frame-baselines.json`, junto à
revisão/hash do mGBA correspondente.

As referências são das fixtures técnicas existentes. As capturas de boot não
substituem as asserções de pixels, colisão, áudio e save durante os roteiros de
controle, que continuam sendo executadas pelos testes de cada família. Tampouco
substituem a revisão visual do Exemplo GBA completo ou do projeto de um usuário.

Uma divergência mantém o PNG atual e os hashes esperado/obtido no relatório.
Não há opção de atualizar ou aprovar referências automaticamente. Para uma
mudança intencional, primeiro examine a captura, o contrato funcional e a causa;
depois revise os hashes separadamente. Trocar a engine não autoriza trocar as
referências; trocar o core exige também revisar sua identidade fixada.

## Iteração e CI

Para executar uma família durante a investigação:

```sh
npm run verify:rom-regressions -- --case hardware-diagnostic --output artifacts/rom-regressions
```

`--case` pode se repetir, sem IDs duplicados. O relatório identifica o escopo
`selected_cases` e mantém `complete: false` para uma seleção parcial. O catálogo
inteiro aprovado recebe `full_catalogue` e `complete: true`; isso se refere
somente a esta suíte técnica, nunca ao produto inteiro.

`--baseline CAMINHO` permite verificar uma referência explicitamente escolhida,
sem modificá-la. `--engine-pack` seleciona o Pack; o padrão é o `dist` da engine
no mesmo checkout. `--output` escolhe apenas a pasta pai de novas execuções.

O job `rom-regressions` compila e executa a suíte no CI Linux. Depois, os jobs
`rom-replay` recebem as mesmas ROMs e o mesmo Pack da execução e comparam os
frames no Linux, Windows e macOS. O replay exige o SHA exato do commit, relatório
completo aprovado, hashes da biblioteca/conversores, recibos e baseline do
mesmo core. Não recompila nem repete os roteiros funcionais nesse segundo host.
Os relatórios distinguem essa camada com `functionalReplay: false`.

Para reproduzir um artefato sem toolchain ou dependências npm, na raiz do app:

```sh
node scripts/replay-rom-regressions.mjs --input /caminho/artefato-roms --engine-pack /caminho/pack --expected-revision SHA_DO_PRODUTOR --output artifacts/rom-replay
```

A pasta de entrada precisa conter exatamente um `run-*` produzido pelo runner.
O comando não segue caminhos arbitrários declarados no JSON. Um artefato de
outro commit, alterado ou incompleto falha; tentativas anteriores e os artefatos
de entrada são preservados. Veja [a matriz de CI](continuous-integration.md).
Uma execução local não comprova que o workflow remoto passou.

O comando é uma suíte de desenvolvimento/CI. Ele não adiciona execução de
emulador a todas as exportações do usuário nem altera a experiência de exportar.
O gate completo, instaladores e testes em GBA físico continuam separados.
