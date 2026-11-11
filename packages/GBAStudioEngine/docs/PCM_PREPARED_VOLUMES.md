# Volume e samples PCM longos

O mixer pode reutilizar mapas pré-pan preparados com os volumes Music e
PcmMusic em 15 ao alterar esses volumes durante a execução. O mapa preserva
o valor após ganho do sample e volume da nota; os volumes dos buses e o pan
são aplicados depois, na mesma ordem e com os mesmos truncamentos do caminho
escalar. A frequência de mixagem, os samples e as vozes permanecem iguais.

O `assetc` mantém o mapa específico do volume configurado e, para samples
longos, também prepara um mapa pré-pan com os buses em 15. O mapa específico
continua oferecendo intervalos mais compactos no volume original. Os mapas
adicionais ocupam ROM, entram no orçamento do asset e não reservam um novo
buffer na RAM do GBA. Quando não há um mapa compatível, o mixer usa o caminho
escalar; isso preserva a saída, mas pode exceder o orçamento de CPU.

`audio_tests.cpp` compara as saídas preparadas e escalares nos volumes de 0 a
15, com pan, transposição e retorno do loop. A regressão de exportação em
`assetc_tracker_replay_tests.py` exige os dois mapas para um volume nativo 12.

Em `apps/desktop-electron`, a comparação ARM pode ser executada com:

```sh
GBA_TRACKER_SAMPLE_LENGTH=16384 GBA_AUDIO_MAP_VOLUME=15 \
  node scripts/verify-audio-prepared-interpolation-rom.mjs ENGINE_PACK EVIDENCIAS
```

Ela reproduz XM/IT com 16 vozes, compara 360 blocos PCM diretamente na ROM
antes da reamostragem do emulador e exige avanço do jogo. O volume de execução
é 12. O resultado não garante 30 atualizações/s em qualquer cena, volume ou
conjunto de assets; a carga do jogo e o cabo exigem medições separadas.
