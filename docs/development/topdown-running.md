# Corrida do player por evento

Nas cenas top-down, o evento de início do player pode configurar:

```text
set_player_speed_profile 100 170 r 0
```

Os dois números são percentuais da velocidade autorada: caminhada a 100% e
corrida a 170%. O terceiro argumento é o botão mantido pressionado (A, B, L ou
R). O último argumento é o campo de custo de energia, atualmente apenas
armazenado pelo evento; não há consumo de energia neste caminho. O exemplo usa zero.
A configuração não altera a velocidade de plataforma, corrida de veículos ou
outros runtimes.

O player continua usando o mesmo resolvedor de colisão e o acumulador de passos
fracionários. A normalização da diagonal permanece ativa. Segurar apenas R
mantém a pose parada; soltar R durante o deslocamento seleciona a caminhada.

Além dos oito slots direcionais de idle/walk, o exportador aceita quatro
animações adicionais, nesta ordem: `run_down`, `run_right`, `run_up`, `run_left`.
As quatro precisam pertencer ao estado de animação do player. Um conjunto
incompleto gera erro de exportação. Sem essas poses, o perfil pode acelerar o
deslocamento usando a caminhada existente.

No Exemplo GBA, `nara_configurar_corrida` é um evento editável ligado ao início
da Nara e chamado pelas entradas/restaurações do Porto, Farol, Galeria e Maré
Vazante. Assim, carregar uma partida reaplica a configuração; o estado de um
botão físico não é salvo. A folha anterior permanece preservada, e seus pixels
de caminhada são copiados sem alteração para a folha com corrida.

Regressões relevantes: `make topdown-run-test` no motor, `topdownRunExport.test.ts`
no Electron e `--topdown-running` nos dois scripts de smoke da missão. O smoke
usa controles comuns e lê posições/animações para diagnóstico; não injeta
posição, flags de progresso ou memória de save.
