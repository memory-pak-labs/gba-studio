# Mensagens multiplayer

`gbs/multiplayer.hpp` oferece uma conexão com filas para dois a quatro GBAs.
O transporte padrão usa SIO Multiplayer com conclusão por IRQ; cada atualização
faz no máximo um poll e inicia uma transferência. Não há espera ocupada,
alocação dinâmica ou execução de roteiros no interrupt handler.

```cpp
gbs::MultiplayerQueue connection;
gbs::MultiplayerConfig config;
config.players = 2;
config.session_id = 42; // Mesmo protocolo; IDs locais podem ser diferentes.
gbs::multiplayer_queue_open(connection, config);
gbs::multiplayer_queue_send(connection, 0xFFFF);

// Uma chamada por quadro, fora da IRQ:
gbs::multiplayer_queue_update(connection);
gbs::MultiplayerMessage message;
while (gbs::multiplayer_queue_receive(connection, message)) {
    // message.player_id identifica a origem; message.value tem 16 bits.
}
```

Há oito posições de envio e dezesseis de recebimento. `send` retorna false
quando fechado ou cheio, preservando os dados aceitos anteriormente. True
significa enfileirado. O envio só sai da fila após confirmação de todos os
outros participantes configurados. Não há eco local. Quando o recebimento
está cheio, o receptor retém a confirmação e o emissor tenta novamente.

Os valores 0 e 65535 são suportados. Cada mensagem é enquadrada em quatro
palavras de transporte, com ID de sessão, sequência e CRC-8; a confirmação usa
três palavras. Uma falha parcial ressincroniza no próximo cabeçalho. Duplicatas
de uma retransmissão são confirmadas sem reaparecer na fila do jogo.
`config.baud` permite 9600, 38400, 57600 ou 115200 bps.

`Connecting`, `Connected` e `Recovering` permitem mostrar o estado ao jogador.
Timeout e ausência de participantes reinicializam o transporte automaticamente;
as filas e a detecção de duplicatas são preservadas. `retry_frames` regula a
retransmissão e novas tentativas após falha de inicialização. Os intervalos são
medidos em chamadas de update, portanto o jogo deve atualizar regularmente.
`close` encerra a sessão, limpa suas filas e libera apenas o bit serial de IE,
preservando os demais interrupt sources e o IME anterior.

## Limites

- Todos os GBAs precisam executar este protocolo, com a mesma quantidade de
  participantes e baud rate. Não é compatível com o protocolo raw `link.hpp`.
- Uma conexão nativa detém a porta SIO. Não misture conexões raw, acessórios seriais
  ou outra instância nativa enquanto estiver aberta. O endereço da conexão
  deve permanecer estável, sem copiar/mover a estrutura aberta.
- A configuração preserva os dados durante uma interrupção temporária da mesma
  partida e dos mesmos slots do cabo. Não é um protocolo de entrega persistente
  após desligar o console. Use outro `session_id` (1–4095) ao reiniciar um jogo.
- Reconectar o cabo não recompõe o mundo do jogo: posições, inventário,
  autoridade e entrada de um novo jogador exigem sincronização da aplicação.
- O framing prioriza confirmação e integridade; uma palavra por update não
  promete envio de estados completos a 30/60 Hz. Transmita eventos compactos;
  maior throughput exige agendamento adicional validado no cabo.
- CRC-8 detecta corrupção acidental; não autentica participantes.

## Verificação

`make multiplayer-async-test multiplayer-queue-test` verifica a fronteira MMIO,
papéis determinados pelo pino SI, conclusão por IRQ, filas, backpressure,
sequência circular, perda/corrupção e recuperação com dois/quatro participantes.
O cabo desses testes é um modelo determinístico, não emulação de dois GBAs.

Em `apps/desktop-electron`,
`node scripts/verify-multiplayer-queue-rom.mjs ENGINE_PACK EVIDENCE` compila e
executa uma ROM no mGBA sem cabo: verifica avanço dos quadros, recuperação,
retenção do envio e liberação de SIO. Remove sua compilação temporária ao sair.
Entrega com múltiplas instâncias no mGBA e com GBAs físicos permanece uma
validação separada. Esta API de SDK não acrescenta ainda controles ao editor.

Referência de registradores: [GBATEK, SIO Multi-Player Mode](https://mgba-emu.github.io/gbatek/#sio-multi-player-mode).
