# Trilha costeira de O Último Farol

Composições, samples e efeitos originais de Memory Pak Labs, sob a licença MIT
incluída nesta pasta. Não foram usados áudios, melodias, gravações ou samples de
terceiros. `palette.py` contém os sintetizadores determinísticos (seed 7069);
`generate.py` contém as partituras e a descrição de cada efeito. Execute
`python3 generate.py` para reproduzir os 74 arquivos em `sources/`.

A paleta foi aprovada pelo usuário em 9 de novembro de 2026, com autorização para
renovar o restante do banco antes da integração. As duas músicas e seis efeitos
previamente ouvidos foram preservados byte a byte. Essa aprovação da direção
não significa que o usuário tenha ouvido individualmente todos os novos arquivos.

São 16 músicas MOD de 8–12 canais e 58 efeitos WAV mono, 16-bit, 31.536 Hz.
O mixer continua suportando até 16 canais de música; cada composição usa apenas
os canais necessários. Os samples são compartilhados na ROM. Os MOD usam notas,
volume e tempo compatíveis com o importador, sem depender de efeitos não suportados.
`relay_light` é uma resolução sem loop. Os demais temas foram escritos para loop.

`manifest.json` identifica contextos, durações e hashes SHA-256. `bindings.json`
congela os IDs, nomes, exportIDs, tipos e loops anteriores: os vínculos de eventos,
diálogos e cenas continuam válidos. A regeneração do template preserva este banco.
Os seis WAV anteriores continuam em `Assets/audio/`; o Git preserva as partituras
COMPOSED anteriores. O snapshot original completo foi arquivado localmente antes
da renovação; seu caminho e os resultados da ROM estão no relatório de QA local.

Validação reproduzível (em `apps/desktop-electron`, com Engine Pack compilado):

```sh
node scripts/verify-exemplo-coastal-audio-rom.mjs /caminho/para/evidencias
```

O script compila uma ROM ARM, percorre as 16 músicas (incluindo transição de loop),
os 58 efeitos nativos e sua sobreposição à música, e grava o PCM real do mGBA.
Isso não substitui audição em um Game Boy Advance físico.
