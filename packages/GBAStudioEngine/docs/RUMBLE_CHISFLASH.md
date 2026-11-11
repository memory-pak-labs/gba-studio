# Vibração no ChisFlash v1.2

O SDK oferece um driver **experimental**, ativado explicitamente para a placa
ChisFlash v1.2. Não é um driver genérico de GPIO, não detecta cartuchos e não
executa escritas de controle no perfil padrão.

No app, escolha **Exportar → Hardware GBA → Vibração do cartucho**.
O padrão é **Desativada**. Escolher **ChisFlash v1.2 · experimental** instala
o provider após inicializar cada runtime; os eventos Ligar, Desligar e Vibrar
por quadros usam esse provider. A escolha é salva no projeto e não modifica
o modelo original usado para criar a cópia.

```cpp
gbs::init();
gbs::rumble_configure_cartridge(gbs::RumbleCartridge::ChisFlashV12);
gbs::rumble_on_for(12);
// gbs::wait_vblank() já avança o temporizador uma vez por update.
// Para desativar e retirar o provider:
gbs::rumble_configure_cartridge(gbs::RumbleCartridge::None);
```

Selecione esse perfil somente para a placa identificada. Em um cartucho
desconhecido, mantenha `None`. O retorno true informa que a configuração foi
instalada; `rumble_available()` reflete o provider escolhido, não uma detecção
física. `rumble_init()` desliga o provider anterior antes de removê-lo.

## Protocolo e implementação

A referência primária é o [payload publicado por ChisBread](https://github.com/ChisBread/ChisFlashGBARumbleCollect/blob/main/patcher/payload.c),
consultado em 10/11/2026. O protocolo usa seis escritas de controle de 16 bits
na região do cartucho e o bit 1 de um registro de 8 bits em `0x08001000`.
O driver executa a configuração e as alterações do motor na IWRAM, preservando
o IME durante a sequência de configuração. Não acessa a área de save.

A implementação deste SDK preserva o modelo de provider do GBAStudioEngine;
não incorpora o patcher de ROMs nem modifica instruções de jogos externos.
Não altera a configuração do gravador e não grava cartuchos automaticamente.

## Evidências e fronteiras

- `make rumble-cartridge-test`: temporizador, seleção/remoção do provider,
  ausência de escritas no perfil padrão, sequência e largura das escritas em
  um barramento de teste, preservação de IME e falha de configuração.
- `verify-multiplayer-queue-rom.mjs`: compila o driver para ARM, confere os
  símbolos na IWRAM e executa seleção, duração e desativação em uma ROM no mGBA.
- O mGBA não comprova o acionamento desse motor. Ainda é necessário verificar
  ligar, desligar, duração, troca de cena e save no ChisFlash v1.2 em um GBA.
- `cartridgeRumble.test.ts`, `rumble_project_export_tests.py` e
  `cartridgeRumbleRom.integration.test.ts` cobrem configuração, exportação e
  ligação do hook. Reexportar como Desativada sobre a mesma pasta substitui
  a configuração anterior, impedindo que um driver antigo continue ligado.

O driver continua experimental até a validação na placa física. Outros
cartuchos precisam de providers específicos e de identificação própria.
