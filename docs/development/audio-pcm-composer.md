# Compositor PCM no workspace Áudio

Em **Áudio → Criar áudio**, escolha **Música PCM**, **Efeito PCM** ou
**Importar áudio**. Em **Mais opções**, **Música PSG** e **Efeito PSG** mantêm
o compositor de síntese existente. Nenhum áudio anterior é convertido
automaticamente.

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

## Frequência de mixagem PCM

Em **Exportar → Áudio → Frequência de mixagem**, escolha 10.512, 21.024 ou
31.536 Hz. O padrão permanece em 31.536 Hz. Esse ajuste define a saída PCM da
engine e da prévia do workspace Áudio; **Sample rate** continua definindo a
conversão dos WAVs. Frequências menores reduzem a banda de áudio e o custo de
processamento. Não há redução automática da frequência.

O evento **Definir frequência de mixagem**, em **Música e efeitos sonoros →
Mixagem**, aplica `set_audio_mixing_rate 21024`, por exemplo, ao próximo bloco.
A troca preserva a posição e a afinação dos samples ativos, incluindo os SFX,
e não altera os canais PSG. A frequência permanece nas transições entre cenas;
um novo início da ROM reaplica o valor salvo nos ajustes do projeto.

## Editar MOD e S3M importados

Selecione uma música MOD ou S3M da biblioteca e use **Criar cópia editável** em
um projeto salvo no aplicativo desktop. A cópia recebe outro nome e identidade;
o item importado, o arquivo de origem e os vínculos existentes continuam iguais.
Associe a cópia às cenas ou aos eventos em que deseja ouvir a versão modificada.

O **Piano Roll** insere e seleciona notas nos canais PCM do módulo, até 16.
O **Tracker** mostra as 64 linhas de cada padrão e permite editar nota,
instrumento, efeito e parâmetro. Os instrumentos são os samples incorporados
ao arquivo de origem. Os comandos e parâmetros usam hexadecimal; no S3M,
o Tracker também mostra a coluna de volume e o corte de nota `OFF`.
O campo de efeito usa o número hexadecimal do comando S3M; a célula mostra
sua letra, por exemplo `01` / parâmetro `06` aparece como `A06`.

Confirme campos de texto com Enter ou ao sair do campo. **Limpar nota** mantém
instrumento e comandos; **Limpar célula** remove todos os dados daquele passo.
Mover uma célula transporta também seus comandos. A aba **Sequência** permite
duplicar, remover e renomear padrões e organizar sua ordem de reprodução.
Adicionar ou remover um canal aplica a mudança a todos os padrões do módulo.
As operações usam desfazer/refazer e são salvas no próprio `.gba-project`.

No MOD, velocidade e andamento permanecem nos comandos `Fxx` do Tracker;
o controle superior de BPM fica desabilitado. No S3M, o BPM inicial pode ser
editado, preservando os comandos de andamento existentes. Esta edição não
inclui desenho de ondas, troca dos samples incorporados ou síntese OPL.

Módulos **XM e IT** também podem receber cópias editáveis no Piano Roll e no
Tracker. A reprodução segue o perfil PCM, os envelopes e os efeitos suportados
pela engine, descritos no [contrato de integração](../../packages/GBAStudioEngine/docs/INTEGRATION_CONTRACT.md).
Esse perfil não representa suporte irrestrito a todas as extensões desses
formatos. A fonte permanece preservada, como nos módulos MOD e S3M.

A prévia e a exportação geram um novo módulo nativo em sua pasta de trabalho,
preservando os samples e comandos originais. O arquivo de origem nunca é
reescrito. Se ele for substituído externamente, a exportação informa a mudança
em vez de aplicar a edição sobre outro arquivo. Crie uma nova cópia editável
a partir da nova fonte para continuar.

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

A prova específica de módulos recebe o snapshot salvo pelo teste visual e o
arquivo original `qa_native_source.s3m` no mesmo diretório. Ela compara o PCM
do original com uma cópia sem edições, confirma que notas editadas mudam a
reprodução, verifica a invalidação do cache e executa as cópias MOD/S3M na
exportação normal de Porto Lúmen:

```sh
GBA_TRACKER_UI_SNAPSHOT=/caminho/qa/project-snapshot.json \
GBA_TRACKER_ROM_PROOF=/caminho/evidencias \
npx vitest run src/main/trackerModuleRom.integration.test.ts
```

Use `TMPDIR` exclusivo com orçamento de espaço e remova os builds descartáveis
ao finalizar. O teste conserva apenas medições e hashes no diretório de evidências.
