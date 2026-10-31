# Mercado Suspenso — aventura aprovada em 20/10/2026

Arte original gerada com image_gen a partir da direção visual própria de Porto
Lumen, do Mercado anterior e da Arena Tática aprovada. Referências comerciais
serviram à pesquisa de perspectiva e encenação; nenhum pixel comercial entrou
nos arquivos distribuídos. Licença: arte própria gerada para o projeto.

O mantenedor aprovou o candidato completo e autorizou a integração ao exemplo.
Após o consumidor real detectar a reserva compartilhada de OBJ, aprovou também
a comparação da paleta compatível: “Aprovar a paleta compatível (Recomendado)”.
O registro, os hashes e a configuração estão em `market-approved-manifest.json`.

- BG: fonte 1536 × 1024, preparada por nearest em 768 × 512 e 208 cores RGB555,
  com famílias de cor separadas. O PNG aprovado foi copiado sem qualquer mudança.
- Frente: máscara técnica de pixels já existentes nos postes das pontes e bancas.
  Recomposta sobre o fundo, mantém todos os pixels da imagem aprovada; 61 tiles
  residentes, abaixo da reserva de 117. Não são novos pedaços de cenário.
- Nara: 20 quadros de repouso/caminhada copiados da arte tática aprovada,
  quatro direções, canvas 64 × 64 e pivô nos pés (32,62). Nenhum pixel ou cor de
  Nara mudou na adaptação de paleta.
- NPCs: mercador e guarda autorais, quatro poses cada, mesma escala e pivô.
  Alpha preparado a partir do histograma bimodal; recorte de margem transparente
  de 80 para 64, sem corte de pixels visíveis. As poses entram no ciclo ambiente
  de repouso, leitura/observação, gesto e piscar do runtime da aventura.
- OBJ: banco de 28 quadros, streaming e 160 cores visíveis compartilhadas;
  50 cores de Nara foram fixadas. Comparado à primeira paleta aprovada, mudaram
  tons de 1642 dos 7894 pixels opacos dos NPCs, RMSE RGB 2,765 em escala 0–255;
  formas e transparência ficaram idênticas. A comparação foi aprovada explicitamente.
- HUD: molduras, corações e fonte Porto B previamente aprovados; caixa de entrega
  técnica autoral de 10 × 9 em canvas 16 × 16. Vida usa `porto_player_health` e o
  contador usa `var_market_shortcut`, com total `/1` separado da parte variável.
- Áudio: `farol_falesias` e `farol_sfx_dialogo` próprios já existentes, mantidos.

A grade de autoria é 52 × 52, com células lógicas de 24 × 12, origem (384,-4),
altura de 12 pixels por nível e terraço no nível 3. A área caminhável é separada
da imagem: água, falésias e bancas ficam bloqueadas. As três subidas da escada
usam rampas para o eixo lógico -Y. O mapa paginado continua no modo aventura;
o seletor e as regras de combate pertencem à Arena Tática separada.

Fontes técnicas: [Tonc](https://gbadev.net/tonc/), o consumidor `assetc` e o runtime
`GBAStudioEngine`. A paginação usa 651 slots BG e a frente residente; os tiles de
origem ficam na ROM. Aprovação isolada de PNG não substitui exportação e mGBA.
Os assets anteriores ficam preservados no disco; somente seus registros sem
consumidores saem da biblioteca ativa.
