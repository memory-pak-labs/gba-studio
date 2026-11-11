# Mensagens multiplayer

`gbs/multiplayer.hpp` oferece uma conexão com filas para dois a quatro GBAs.
O transporte padrão usa SIO Multiplayer com conclusão por IRQ; cada atualização
faz no máximo dezesseis polls e prepara um lote de até quatro palavras. Não há espera ocupada,
alocação dinâmica ou execução de roteiros no interrupt handler.

A IRQ guarda até dezesseis snapshots em ordem, inclusive clocks recebidos entre o
poll e o próximo envio. Um resultado de entrada não avança a palavra de saída;
somente a conclusão do envio local faz isso. Se o filho prepara uma palavra
enquanto a transferência do pai está ocupada, a IRQ carrega essa palavra para
o próximo clock. Overflow do buffer solicita recuperação em vez de sobrescrever
dados ainda não lidos. Palavras intermediárias repetidas mantêm a fase do parser
e continuam sujeitas ao CRC do pacote completo.

No GBA, a submissão copia o restante do pacote atual para um buffer fixo na EWRAM,
preservando a reserva de pilhas da IWRAM. A IRQ
avança somente essas palavras preparadas e inicia no máximo quatro clocks por
submissão, sem interpretar eventos ou calcular CRC. O último clock encerra o
lote; não há laço de espera pelo cabo. A aplicação só avança o cursor de saída
nas conclusões correspondentes, incluindo lotes completados em updates distintos.
Uma conclusão parcial renova o timeout; ele só avança em updates sem progresso.
Transports de teste podem fornecer `begin_batch`; sem ele, o envio continua
palavra por palavra. Uma confirmação completa libera imediatamente a próxima
mensagem, sem herdar o prazo de retransmissão da mensagem já entregue.

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

## Editor e roteiros

Habilite **Link** em **Exportar → Runtime Universal**. Na biblioteca de eventos,
em **Diversos → Multijogador**, estão disponíveis cinco ações de **Conexão com
filas**:

| Ação | Configuração e resultado |
| --- | --- |
| Abrir | 2–4 jogadores, velocidade do cabo e timeout de 1–600 quadros. |
| Enviar mensagem | Lê uma variável (16 bits inferiores); escreve 1 na variável de aceitação quando enfileirou, ou 0 se fechado/cheio. Aceitação não significa entrega. |
| Receber mensagem | Retira uma mensagem e escreve valor, remetente (0–3) e indicador 1 em variáveis distintas. Sem mensagem, escreve apenas o indicador 0. |
| Consultar estado | Escreve estado (0 fechado, 1 conectando, 2 conectado, 3 recuperando), jogador local e quantidade de envios pendentes. |
| Fechar | Limpa as filas e libera a conexão. |

O serviço global é atualizado uma vez por quadro pela engine, inclusive durante
esperas de eventos. Não exige um módulo separado em cada cena e preserva a fila
durante a troca entre runtimes. A abertura da API raw encerra a conexão com filas;
não misture os dois protocolos em uma partida.

```text
set_variable net.message 65535
multiplayer_queue_open 2 115200 30
multiplayer_queue_send net.message net.accepted
multiplayer_queue_receive net.value net.sender net.received
multiplayer_queue_status net.state net.local net.pending
multiplayer_queue_close
```

O simulador de scripts representa a conexão sem cabo: pode aceitar um envio na
fila, mas não inventa outro jogador, eco local ou confirmação de entrega. A ROM
usa o transporte SIO real. O teste de exportação verifica os comandos e o valor
65535 na memória da ROM; `SetVariable` preserva constantes assinadas de 32 bits
sem alterar o tamanho do comando nativo.

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
- O framing prioriza confirmação e integridade. O lote nativo de até quatro
  palavras não promete sincronização de mundos completos a 30/60 Hz.
  Transmita eventos compactos; a cadência real depende dos participantes,
  velocidade do cabo, atualizações da aplicação e confirmação de todos.
- CRC-8 detecta corrupção acidental; não autentica participantes.

## Verificação

`make multiplayer-async-test multiplayer-queue-test` verifica a fronteira MMIO,
papéis determinados pelo pino SI, conclusão por IRQ, filas, backpressure,
sequência circular, perda/corrupção e recuperação com dois/quatro participantes,
incluindo terminais que atualizam em cadências diferentes.
O cabo desses testes é um modelo determinístico, não emulação de dois GBAs.

Em `apps/desktop-electron`,
`node scripts/verify-multiplayer-queue-rom.mjs ENGINE_PACK EVIDENCE` compila e
executa uma ROM no mGBA sem cabo: verifica avanço dos quadros, recuperação,
retenção do envio e liberação de SIO. Remove sua compilação temporária ao sair.
O teste opt-in `multiplayerQueueRom.integration.test.ts`
exporta os eventos do editor, compila e verifica a recuperação sem cabo no mGBA.
Com `GBA_QUEUE_ROM_EXAMPLE=1`, usa uma cópia do Exemplo GBA completo em Porto
Lúmen e confirma também que o buffer serial foi alocado na EWRAM. Essa execução
comprova a exportação e a recuperação sem cabo, não a vazão em cenas exigentes.

### Núcleos nativos conectados

`scripts/verify-multiplayer-linked-rom.mjs ENGINE_PACK MGBA_SOURCE MGBA_NATIVE_BUILD EVIDENCE`
compila ROMs com os eventos do SDK e executa 20 cenários em núcleos nativos do
mGBA 0.10.5, ligados pelo SIO lockstep oficial. Abrange dois/quatro participantes,
9600/38400/57600/115200 bps, pressão na fila, ordem, valores limite, duplicatas,
desconexão/reconexão do último participante no mesmo slot e encerramento com
restauração de IE. Cada terminal envia 64 mensagens; o runner não injeta dados,
ACKs ou alterações na RAM da ROM. Ele usa entrada de botão apenas para encerrar.

As fontes devem estar limpas no commit `26b7884bc25a5933960f3cdcd98bac1ae14d42e2`.
Exemplo de preparo em diretórios temporários novos, com CMake e compilador C:

```sh
mgbaQaRoot=$(mktemp -d)
git clone --depth 1 --branch 0.10.5 https://github.com/mgba-emu/mgba.git "$mgbaQaRoot/source"
cmake -S "$mgbaQaRoot/source" -B "$mgbaQaRoot/build" \
  -DLIBMGBA_ONLY=ON -DM_CORE_GBA=ON -DM_CORE_GB=OFF \
  -DBUILD_STATIC=ON -DBUILD_SHARED=OFF -DBUILD_LTO=OFF \
  -DBUILD_QT=OFF -DBUILD_SDL=OFF -DBUILD_GL=OFF -DBUILD_GLES2=OFF \
  -DENABLE_FFMPEG=OFF -DENABLE_LIBZIP=OFF -DENABLE_SQLITE3=OFF \
  -DENABLE_LZMA=OFF -DENABLE_PNG=OFF -DENABLE_ELF=OFF \
  -DBUILD_TEST=OFF -DBUILD_SUITE=OFF -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_POLICY_VERSION_MINIMUM=3.5
cmake --build "$mgbaQaRoot/build" --target mgba -j 4
# Em apps/desktop-electron; informe um destino persistente para as evidências:
node scripts/verify-multiplayer-linked-rom.mjs \
  ../../packages/GBAStudioEngine/dist/GBAStudioEnginePack \
  "$mgbaQaRoot/source" "$mgbaQaRoot/build" CAMINHO_DAS_EVIDENCIAS
```

Um quinto argumento opcional, `BASELINE_JSON`, compara os casos saturados a
115200 bps. Exige pelo menos 3× mais vazão e 3× menos tempo médio de confirmação
por terminal com dois/quatro participantes, mantendo a mesma carga e o mesmo
commit mGBA. Primeiro gere a baseline com o Engine Pack de referência; depois
execute a candidata passando o `evidence.json` da baseline.

O verificador remove seus executáveis e projetos temporários, inclusive em
falhas; fonte/build mGBA são entradas externas e permanecem intactos. Nesta
validação local, o diretório temporário criado para fonte/build também foi
removido ao terminar. Receita validada no macOS Apple Silicon, sem janelas Qt.

Resultado em fila saturada a 115200 bps: a submissão de pacotes passou de 7,5
para 29,6 broadcasts/s por terminal com dois participantes e de 2,3 para cerca
de 10 com quatro. O tempo médio entre enfileirar e confirmar passou de 60,5
para 15,25 updates com dois, e de 194–200 para 44,9–45,4 com quatro, incluindo
espera atrás de outras mensagens. Esses números medem uma ROM de QA
pequena, não o desempenho do Exemplo completo, áudio ou de um aparelho físico.
O limite de quatro palavras por lote contém o trabalho da IRQ e o uso de RAM;
transmissões mais frequentes ou mensagens maiores exigem medição específica.

A prova de cabo, reconexão e entrega em GBAs físicos continua pendente. Troca
de host/IDs, reinício do console e entrada de outro jogador exigem ressincronizar
a partida; os 20 cenários não comprovam esses fluxos. A seleção de janelas,
atalhos e comandos da interface Qt também não faz parte desta evidência.

Referência de registradores: [GBATEK, SIO Multi-Player Mode](https://mgba-emu.github.io/gbatek/#sio-multi-player-mode).
