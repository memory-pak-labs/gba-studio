# Arena de Arrancada — assets aprovados

Arte própria assistida por OpenAI ImageGen e composições PSG originais do projeto. Sem sprites ou pixels de jogos comerciais. Licença: project-owned artwork/compositions.

Aprovação explícita em 2026-10-17: BG com retoque discreto de microdetalhes e HUD modular corrigida; integrar a cena preservando os demais assets. A faixa de 5% a 10% é direção visual, não uma medida matemática.

## Fontes preservadas

- bg: `exec-1a990c2c-c29c-49ab-8981-82c19ce0f197.png`, SHA256 `5703875280581b8f43c7101e6d61dc569f9b55157aa689591437ec6ecb2a068c`.
- nara: `exec-dbd77ed7-2b02-4eda-9a81-c5242104fa47.png`, SHA256 `0538885b66c3704d308a659a313c0d38e51482faab23d10534ea1b52eb0ac59c`.
- rival: `exec-bc8297a4-f1a6-4f2b-9571-68d02e7b0d3e.png`, SHA256 `03c9c4fda84b9d2d113394dbf1f78c707acef774950f041f05671025f042291e`.
- hud-v2: `hud-v2-raw.png`, SHA256 `3ba27504c12746a39b36b387b28f744659818ea47a79f284fcac831771a6a83e`.
- Retoque do BG: `exec-f393c24f-6f9c-4d6b-b245-e866fdbd1923.png`, SHA256 `4e5fed8eba6fc57ce5870ecfc0d63d84495af6dadeefce268f12678ec690c808`.

## Preparação aprovada

- BG: nearest 240 × 160 e a mesma referência de 12 bancos 4bpp da revisão. Sem fusão destrutiva de tiles.
- Atores: mesmos PNGs 64 × 64, 16 quadros cada, paleta 8bpp compartilhada e streamFrames. Pés e âncoras preservados.
- HUD: recortes técnicos da moldura náutica, 15 cores visíveis; textos nativos em avanço de 8 px dentro das janelas. Barras P1/P2 com imagens mutáveis independentes.
- Marcadores de rounds: template em branco próprio, recoloridos para a paleta da HUD revisada.
- Música e efeitos: faixa de combate editável em canais PSG, ligada na entrada. Quatro efeitos PSG aprovados estão ligados aos resultados reais das ações: impacto, defesa, especial e golpe no ar. As duas vinhetas de resultado permanecem no arquivo de revisão e não são adicionadas ao template.

O manifesto contém os hashes dos PNGs efetivamente integrados. A aprovação dos PNGs preparados não autoriza recriação de outros assets. As fontes de geração e os relatórios de revisão ficam no arquivo privado; não são dependências do aplicativo.

## Caminhada, salto e especial — conclusão autorizada em 2026-10-17

O usuário autorizou ligar as poses já aprovadas, os gauges e os sons sem alterar o desenho. As folhas completas concatenam os 16 quadros integrados com os oito quadros de movimento da fonte `exec-d5ffd84b-a186-4967-89be-b69eb1d92507.png` (SHA256 `1b9c939b8c2100f61d143b9056d30a5dd9f5f8dec31e6c4167fc411d879e1021`). Não houve redimensionamento, nova máscara ou quantização; todos os pixels dos dois recortes são preservados. A folha anterior continua na biblioteca.

- Quadros 16–19: caminhada, 10 fps, loop enquanto há deslocamento real.
- Quadros 20–23: antecipação, subida, ar e pouso; poses seguem a física e o pouso dura quatro quadros. Ataques, guarda e dano têm prioridade.
- Gauges: duas imagens independentes de 64 × 8 para cada jogador, preenchimento de 60 × 3 dentro das molduras aprovadas. Reutilização exata dos PNGs da barra de vida, sem redesenhar as molduras. Valores de 0–100 e preenchimento invertido para P2.
- SFX: composições PSG originais da revisão, sem troca da música. O canal de defesa explicita Pulse 1, o timbre já consumido pelo compilador de SFX, corrigindo a indicação anterior de Pulse 2 na autoria.

O manifesto registra as hashes das fontes preparadas e das folhas completas. A paleta compartilhada dos atores permanece a mesma; origem, escala, BG e HUD anteriores são preservados. A engine agora aceita quatro barras dinâmicas, sete estados visuais e índices de SFX PSG por resultado de ação.
