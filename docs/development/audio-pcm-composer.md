# Compositor PCM no workspace Áudio

Em **Áudio → Criar áudio**, escolha **Música PCM** ou **SFX PCM**. As opções
**Música em loop** e **SFX curto** mantêm o compositor PSG existente. Nenhum áudio
anterior é convertido automaticamente.

## Música

A música PCM começa com quatro faixas e um padrão de exemplo. **Adicionar faixa**
permite chegar a 16 faixas independentes em cada padrão. A lista lateral seleciona
a faixa exibida no piano; o Tracker mostra todas as faixas. Clique na grade para
inserir notas. Selecione uma nota e use Delete para apagá-la. A sequência organiza
os padrões; padrões novos começam vazios.

Cada faixa oferece volume, panorama, mute e solo. Solo afeta somente a prévia.
O seletor de instrumentos reúne timbres PCM, samples WAV da biblioteca e o banco
do projeto. Em **Detalhes**, ajuste a nota original do WAV e salve um instrumento
compartilhado. Afinação, envelope e repetição desse instrumento são compartilhados;
volume e panorama permanecem individuais. Importe WAVs ou um SoundFont pelo botão
de importação já existente para ampliar o banco.

## Efeitos

O designer de SFX PCM oferece cinco formas de onda, varredura de frequência,
mistura de ruído, duração, ataque e finalização. A outra fonte é um WAV da
biblioteca, com início no sample e transposição. Para um WAV, a duração limita o
trecho reproduzido; o efeito também termina se o arquivo acabar antes.

A visualização mostra a forma de onda sintetizada ou o envelope do sample.
Os sliders do designer mantêm um rascunho durante o gesto e registram uma única
alteração ao soltá-los. Desfazer/refazer e salvar/reabrir usam o histórico e a
persistência normais do projeto.

## Prévia e exportação

No aplicativo desktop, **Tocar** compila o áudio selecionado com `assetc` e
`gbsbuild`, executa a ROM na mesma versão do mGBA usada pelo Play e transporta o
PCM emitido pela engine para a saída de áudio. A primeira preparação requer o
Engine Pack configurado e pode levar alguns segundos. A última compilação é
reutilizada quando os dados, samples e SDK permanecem iguais. Parar ou trocar a
seleção cancela a reprodução e descarta respostas atrasadas.

A prévia usa as mesmas notas, samples preparados, afinação, panorama, volumes e
receitas de SFX da exportação. Ela isola o áudio selecionado: a carga gráfica, os
eventos e outros sons simultâneos do jogo precisam ser validados no Play/ROM.
No ambiente de navegador sem o backend desktop, PCM não usa uma aproximação PSG.

## Verificação local

Execute npm em `apps/desktop-electron`:

```sh
npm run typecheck
npx vitest run src/shared/audioPcmComposer.test.ts src/renderer/audioPcmWorkspace.test.tsx src/main/engineAudioPreview.test.ts src/renderer/engineAudioPreview.test.ts
```

A prova ARM/mGBA opt-in compila música de 16 faixas/64 passos e dois efeitos,
grava WAVs e verifica vozes, pausas, estéreo e underruns:

```sh
GBA_AUDIO_PCM_QA_OUTPUT=/caminho/qa npx vitest run src/main/authoredPcmRomProof.test.ts
```

Para validar a exportação normal de uma cópia do Exemplo GBA salva pela UI, crie
uma música PCM com 16 faixas, um SFX sintetizado e outro baseado em WAV. O teste
usa Porto Lúmen e compara a saída com e sem os efeitos, preservando o projeto:

```sh
GBA_AUDIO_PCM_UI_PROJECT=/caminho/copia/exemplo.gba-project \
GBA_AUDIO_PCM_PROJECT_QA=/caminho/qa-rom \
npx vitest run src/main/authoredPcmProjectRom.integration.test.ts
```

Editor, PCM emitido pelo emulador e execução em um GBA físico são verificações
distintas. Nenhum teste de emulação comprova sozinho o hardware físico.
