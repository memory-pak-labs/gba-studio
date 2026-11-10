# Ondulação e gradiente por cena

No Editor, abra uma cena e escolha **Mais → Fundo → Composição avançada**.
Ative a composição e configure **Ondulação e gradiente**. Os efeitos ficam
salvos no projeto e são exportados com a cena; os modelos originais permanecem
inalterados ao trabalhar em uma cópia.

- **Ondulação:** escolha BG1, BG2 ou BG3, intensidade, tamanho, velocidade e
  intervalo vertical. O deslocamento soma-se à câmera e não altera colisões,
  atores ou o arquivo de imagem. A velocidade zero mantém a onda estática.
- **Gradiente de fundo:** escolha duas cores e o intervalo de transição. Ele
  altera a cor de fundo vista nas áreas transparentes, mantendo pixels opacos
  e sprites. Um cenário opaco pode esconder completamente o gradiente.
- **Prévia:** o painel usa um padrão demonstrativo de água e céu em 240 × 160,
  com a quantização RGB555 e a onda da engine. **Testar cena** confere a arte e
  a distribuição real das camadas na ROM.

Os efeitos são opcionais. A ondulação exige uma camada regular: em modo Affine,
use BG1; no modo tiled, BG1–BG3. A tabela HBlank avançada não pode controlar a
mesma composição com ondulação. O gradiente exige tiled ou affine. Corrida com
perspectiva usa o modo 1; escolha BG1 para ondulação.
Intervalos inválidos ou modos incompatíveis produzem diagnóstico na exportação.

A engine calcula as tabelas ao trocar parâmetros e publica durante VBlank. A
fase avança na fronteira do quadro, independentemente do ritmo das atualizações
do jogo. O serviço HBlank usa ARM em IWRAM; durante mixagem de áudio, somente
esse serviço pode interromper o mixer. Callbacks HBlank externos mantêm o fluxo
normal de interrupções e não recebem essa prioridade especial.

Validação reproduzível, com um Engine Pack construído da mesma revisão:

```sh
# Em apps/desktop-electron; os dois diretórios devem ser temporários próprios.
GBA_SCENE_RASTER_ROM_QA=/tmp/owned-raster-export \
GBA_TRACKER_ENGINE_PACK=/path/to/EnginePack \
  npx vitest run src/main/sceneRasterRom.integration.test.ts
node scripts/verify-scene-raster-rom.mjs /path/to/EnginePack /tmp/owned-raster-pixels
```

O primeiro teste percorre projeto salvo → exportador → assetc → ROM. O segundo
compara os pixels em mGBA, testa câmera e ativação/desativação e combina os
efeitos com 16 vozes PCM. Esses testes não substituem validação em um GBA
físico. Remova apenas os diretórios temporários criados para a execução.
