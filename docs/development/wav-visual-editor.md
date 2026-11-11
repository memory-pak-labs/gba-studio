# Editor visual de WAV

No workspace **Áudio**, selecionar um efeito WAV importado abre sua forma de
onda. Para um instrumento de música, selecione a faixa com sample e abra
**Editar sample WAV**. No Designer de SFX PCM, escolha **Sample WAV** como fonte.

Arraste sobre a onda ou informe o início e o fim da seleção em milissegundos.
O zoom e o controle de posição ajudam a localizar transientes. Arquivos estéreo
mostram os canais L e R separadamente; a seleção vale para ambos.

- **Recortar à seleção** mantém o trecho selecionado.
- **Fade-in** e **Fade-out** aplicam uma rampa linear no trecho selecionado.
- **Normalizar seleção** ajusta seu pico a 98%, com o mesmo ganho nos dois
  canais para preservar o balanço estéreo. Silêncio continua sendo silêncio.
- **Definir loop pela seleção** cria uma região de repetição. Os marcadores
  podem ser arrastados ou ajustados por números e pelas setas do teclado;
  Shift + seta move 100 amostras. Home e End alcançam os limites permitidos.
- **Remover região de loop** limpa os marcadores. O controle **Repetir** do
  áudio ou da faixa decide se a região será usada durante a reprodução.

As alterações participam do desfazer/refazer do projeto e são preservadas ao
salvar e reabrir. **Remover edições do WAV** restaura o uso da fonte original,
também com possibilidade de desfazer. **Recarregar WAV** lê novamente a fonte.

## Fonte, prévia e exportação

O arquivo WAV original não é regravado. A receita fica em
`assets[].metadata.wavEdit`, vinculada ao SHA-256 da fonte, à frequência e ao
número de frames. A edição afeta todos os usos daquele asset no projeto.
Renomear o asset preserva seu identificador e as referências.

Posições são frames da fonte, com fim exclusivo. O processamento aplica as
operações na ordem autorada e depois recorta; assim, um recorte posterior não
recalcula o ganho de uma normalização anterior. O arquivo gerado mantém PCM
estéreo e grava os pontos de loop no chunk `smpl`, cujo fim é inclusivo.

**Tocar** no aplicativo usa uma ROM da GBAStudioEngine. A exportação normal do
jogo e essa prévia usam o mesmo WAV processado antes da conversão pelo assetc.
Edições invalidam os caches mesmo quando o arquivo original não muda. Uma
fonte substituída externamente é rejeitada até remover as edições ou restaurar
o original. A exportação também rejeita destinos que sejam o próprio original,
inclusive hard links.

No Designer de SFX PCM, início, duração, transposição e envelope são aplicados
depois da edição compartilhada do WAV. O assetc remapeia o loop após a conversão,
o corte e a transposição, conservando a parte que cabe na duração. Um corte que
remove a região inteira com repetição ativa é rejeitado.

O editor aceita WAV PCM sem compressão de 8 ou 16 bits, mono ou estéreo, até
16 MiB, com um loop forward contínuo. Permanecem os limites da engine, incluindo
65.535 amostras PCM por asset após a conversão. Fontes mais extensas precisam
ser recortadas ou ter a frequência de exportação reduzida.

## Verificação

Em `apps/desktop-electron`, os testes focados são:

```sh
npm run test:all -- src/shared/wavEditing.test.ts src/main/wavEditingExport.test.ts src/renderer/WavSampleEditor.test.tsx src/renderer/audioPcmWorkspace.test.tsx src/renderer/audioPreviewPlayback.test.ts
```

A prova optativa de ARM/mGBA exige o Engine Pack local compilado, sua toolchain
e o core mGBA Web. Use uma pasta de QA para as evidências:

```sh
GBA_WAV_EDITOR_QA_OUTPUT=/caminho/qa-wav npm run test:all -- src/main/wavEditingRom.integration.test.ts
```

Ela compara fonte e edição, testa loops nos três usos, exercita o cache da
prévia e da exportação, compila uma ROM de jogo e verifica sua reprodução.
Projetos, gravações e resultados ficam na pasta indicada; compilações e caches
do teste ficam em um subdiretório exclusivo removido ao terminar. A prova em
emulador não substitui teste em GBA físico.
