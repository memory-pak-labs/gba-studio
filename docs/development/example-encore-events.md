# Rádio, epílogo e treino opcional

`apps/desktop-electron/scripts/encore-project.mjs` acrescenta três sequências
ao exemplo. A transformação não reescreve os cenários, os lutadores ou as HUDs.
Assets novos passam primeiro pela cópia de revisão e pela aprovação explícita.

- **Armazém:** o rádio é um ator OBJ de 32 × 32 sobre o barril. Clicar nele
  reproduz o indicativo LUME em Morse e abre a transcrição. Um novo clique
  repete a transmissão. O WAV original é sintetizado por
  `generate-radio-pcm.mjs`, sem gravações de terceiros: mono, 16 bits,
  15.768 Hz, quatro segundos (63.072 amostras; limite por PCM: 65.535).
- **Epílogo:** a conclusão do Circuito inicia um passeio de câmera pelo Porto
  e pelo Farol. Timers movem a câmera enquanto o controle do jogador fica
  pausado. B pula; Start conserva o menu de salvar. Carregar durante o
  passeio reinicia o enquadramento da tomada salva. Ao terminar, o jogo
  volta ao título; o save de conclusão permite continuar com controle livre.
  O Capitão oferece a reprise após a campanha, com retorno ao Porto.
- **Arena:** a quarta opção do Viajante abre um treino opcional de dois rounds
  independentes: defesa e golpes em X-ISM; depois especial e contra-ataque em
  A-ISM com a barra cheia. L executa o especial; R contra-ataca durante o
  hitstun, consumindo meia barra. Select sai; Start pausa e retoma. Cada etapa
  salva seu início no espaço 1. Vencer o treino não concede o turbo nem avança
  a campanha. O combate obrigatório mantém sua recompensa e suas regras.

Os quatro estados novos são anexados às variáveis existentes, preservando
seus índices: `var_radio_heard`, `var_epilogue_phase`, `var_epilogue_tick` e
`var_arena_lesson`. O projeto resultante ocupa 63 dos 64 espaços persistentes.
O epílogo usa fases 1/2 para a conclusão, 4/5 para reprise e 3 para finalizado.

## Fronteiras do motor

A exportação de áudio referencia o mesmo nome normalizado usado na cópia do
WAV. O contrato de Luta inclui a tabela de scripts já produzida pelo editor;
o runtime consome os vínculos de botão e mantém os checkpoints desses scripts.
Um vínculo sem script válido não suprime os controles nativos.
Durante os diálogos de Luta, os lutadores usam prioridade OBJ 1 para que a
caixa em BG0 cubra os sprites. O combate retoma a prioridade OBJ 0 ao fechar
a caixa. A validação lê a OAM e confere a imagem nos dois caminhos.

Procedimentos chamados por outros eventos são expandidos pelo exportador.
Entradas de botão e timers usam eventos próprios, que podem chamar esses
procedimentos, para conservar entradas executáveis na tabela de scripts.

## Reproduzir a validação

Execute npm e Node a partir de `apps/desktop-electron`:

```sh
node scripts/prepare-encore-review.mjs /novo/diretorio/externo
```

O diretório deve ser novo, com o pai existente, e ficar fora de todo o checkout,
inclusive por links simbólicos. O script recusa sobrescritas. Por padrão, copia
o projeto canônico sem reescrever seu JSON e confere os dois assets contra o
manifesto aprovado. A cópia fica em `DIRETORIO_QA/project`; seus assets e manifesto
ficam em `DIRETORIO_QA/assets`, e `review.json` identifica o modo e o hash da fonte.

Para preparar uma nova proposta, coloque `recovered-radio.png` e
`radio-lume-pcm.wav` em outra pasta e use explicitamente:

```sh
node scripts/prepare-encore-review.mjs /novo/diretorio/externo --candidate-assets=/pasta/com/os/assets
```

Nesse modo, os novos assets e o manifesto são marcados como candidatos, sem
herdar a aprovação anterior. A origem e a licença dos arquivos novos precisam
ser verificadas antes de uma promoção. Só a cópia de revisão recebe as substituições;
cenários, atores e HUD do template continuam intactos. O script não promove
assets nem altera o catálogo P0.

`smoke-lost-signal-play.mjs SAIDA --project=PROJETO --encore=radio|arena|epilogue`
dirige o Play real com botões. Use os caminhos `romPath` e `exportDir` de seu
`report.json` em
`smoke-lost-signal-mission.mjs ROM EXPORT SAIDA --project=PROJETO --encore=TIPO`
para conferir a mesma ROM em um core novo de mGBA.

O teste de epílogo usa uma cópia explícita de QA: a confirmação do nome leva
à corrida final e fixa a decisão do Conselho. Ele percorre três voltas e os
portões reais antes do epílogo. Essa entrada não vai para o projeto canônico.
Os saves são escritos pelos eventos e menus e carregados após reiniciar o
core; as leituras de memória servem somente para diagnosticar o resultado.
Isso não substitui uma campanha inteira nem um teste em GBA físico.
