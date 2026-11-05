# Importação de SoundFont 2

Em Áudio, **Importar MOD/WAV/SF2** converte um banco `.sf2` em WAVs portáteis
e instrumentos do banco do projeto. Crie uma música e escolha o instrumento
em **Instrumento → Banco do projeto**. O `.sf2` original não é necessário para
reabrir ou exportar o projeto.

A importação lê presets, instrumentos e zonas, combina as faixas de notas e
velocidade, aplica os offsets de sample/loop, a afinação e a atenuação. Cada
zona vira um instrumento independente, identificado pelo nome e pelas faixas.
Selecionar uma zona não troca automaticamente de sample por nota/velocidade
nem ativa as outras camadas do preset. Isso mantém o orçamento de vozes do
compositor. Filtros, efeitos, moduladores e envelopes SF2 são substituídos
pelos controles disponíveis no editor; a importação informa essas adaptações.

São aceitos samples mono PCM16 internos de SF2 2.x. SF3 comprimido, samples ROM,
stereo e samples vinculados exigem conversão prévia para mono. Em SF2 de 24 bits,
são usados os 16 bits principais. Loops de sustentação são adaptados para loops
contínuos com o envelope do compositor. Os loops forward são preservados no
chunk WAV `smpl`, na prévia e na conversão PCM da engine.

O conversor usa até 15.768 Hz, com redução filtrada, e limita cada sample a
65.535 amostras. Samples longos podem usar uma taxa menor, até 4 kHz; acima
disso a importação falha com uma instrução para dividir o instrumento. Cada
banco aceita até 128 MiB de entrada, 512 zonas e 8 MiB de WAVs convertidos.
Isso é um limite do importador, não uma garantia de caber no projeto completo.
A exportação mantém os orçamentos de ROM e do mixer da GBAStudioEngine.

Os metadados conservam o nome e SHA-256 da fonte, o copyright informado no
banco, preset, banco e faixas da zona. Esse registro não concede uma licença:
o autor do jogo precisa ter permissão para distribuir os samples escolhidos.

Referências: [especificação SoundFont](https://www.synthfont.com/sfspec24.pdf)
e [Direct Sound do GBA](https://gbadev.net/gbadoc/audio/directsound.html).
