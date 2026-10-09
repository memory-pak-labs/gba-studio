# Fontes dos players padrão roxos

## Correção técnica autorizada em 8 de outubro de 2026

As tabelas abaixo conservam os hashes das integrações originais. Os defaults
atuais de plataforma, luta e aventura isométrica substituem somente as poses
de caminhada por cópias deslocadas horizontalmente por pixels inteiros.
Nenhum pixel opaco é redesenhado; canvas, paleta, alpha, demais frames e
timing são preservados. Os hashes atuais são:

| Arquivo | SHA-256 atual |
| --- | --- |
| neutral-player-platformer.png | `60c1a6a750719b17fa7e977005ceedee99748d9a62a7b695c68c2ac99bff9692` |
| neutral-player-fighter.png | `3674f7fb1fb173a5c2f3eb895cd56e6d68251427cd2c938c8400fbd47a23d173` |
| neutral-player-isometric-adventure.png | `565d011fd895a6893c88271caea109b9cb3e3c764a0f2ef08afe436ce4462b21` |

Sete painéis de HUD também tiveram os recortes isolados: vida, energia e item
Dungeon Crawler; grupo RPG; voltas, posição e velocidade da corrida. Bordas
completas recuperadas e fragmentos vizinhos removidos, com a mesma paleta e
preparação aprovadas. As composições completas 240×160 continuam idênticas.

Autorização específica: **“pode corrigir esses”**. Fontes, cópias anteriores,
hashes dos sete painéis e reprodução estão em
`tools/gba-sprite-prep/production/blank-default-assets-correction-2026-10-08/`.
Proveniência `Project-owned` mantida. Projetos existentes guardam suas cópias
locais anteriores; esta promoção atualiza os defaults de projetos novos.

## Integração original dos players em 5 de outubro de 2026

Arte original dos pacotes OpenAI Imagegen apresentados e aprovados pelo usuário. As referências de jogos e o template Eris orientam escala e neutralidade; suas imagens não são distribuídas neste pacote.

A implementação foi autorizada em 5 de outubro de 2026 para projetos em branco. A decisão e os hashes completos estão em `tools/gba-sprite-prep/production/blank-player-defaults-v1-approved/approval.json`.

Os PNGs abaixo são cópias binárias das folhas horizontais já preparadas pelo `gba-sprite-prep`. Esta integração não redimensionou, quantizou nem alterou alpha ou pixels. Apenas adaptou metadados de quadros, peças, âncoras, estados e residência. Todos os idles têm um quadro fixo.

| Arquivo | Quadro lógico | SHA-256 da folha preparada/distribuída |
| --- | --- | --- |
| neutral-player-topdown.png | 32 × 32 | `b19bd08db1ea187699f7d720b9193911f52fb0fd5ff4d64401eb1ff067410167` |
| neutral-player-platformer.png | 64 × 64 | `a2c8cfc9d8e465b9c3329871992dd5d99e0995fb5ecb1d01e32c5665534c2fda` |
| neutral-player-fighter.png | 64 × 80 | `647335730481a367a8a514bb817a392c1b56dee432d28626ebeda056dbf53c5d` |
| neutral-player-isometric-adventure.png | 40 × 48 | `2f6745edbd1d1a5a0fe2fbf3942ba979fdc50137678b928219e145194df481cf` |
| neutral-player-isometric-tactical.png | 32 × 32 | `7dcc987d9f34dfdd1faa99823b5d73196e8d9b44ad0c60532c2016d112e7c8c2` |

Fontes preservadas em `/Users/example/Pictures/novo exemplo/player-placeholders-roxo-v2/` e `player-placeholders-roxo-v3-isometricos/`. Os registros de aprovação distinguem a grade visual original da folha horizontal preparada; os dois hashes estão no registro de produção. A auditoria atual conferiu os 307 arquivos V2 e 301 arquivos V3 sem diferenças.

Proveniência/licença interna: arte gerada para o projeto, registrada como `Project-owned`. Nenhum PNG de Zelda, Mega Man Zero, Street Fighter, Boktai ou Tactics Ogre foi copiado para o aplicativo.

Fighter e aventura isométrica usam metasprites de 3 e 4 OBJs. O diagnóstico `attention` dos Inspectors originais permanece válido; as folhas usam streaming de quadros e bancos por cena no consumidor real. Os ensaios locais não constituem validação física de GBA.


## Nave horizontal e efeito aprovados em 6 de outubro de 2026

A autorização específica foi “aprovado pode integrar para cenas shoot-up em projeto em branco”. O pacote original permanece em `/Users/example/Pictures/novo exemplo/player-shmup-horizontal-roxo-v2/`; seus 65 arquivos auditados continuam iguais aos hashes da preparação.

| Arquivo | Quadro / folha | SHA-256 distribuído |
| --- | --- | --- |
| neutral-player-shmup-horizontal.png | 32 × 32 / 384 × 32 | `64d96d4e5bbf35adbc5d4e37f46b380432af8b4acb9671e19a642e258a6d9743` |
| neutral-shmup-explosion.png | 32 × 32 / 128 × 32 | `bcc9924ff886fa72afcfa66abbc7e6b54538af0c4c1f3f66af561cfcd5310309` |

A nave possui idle de um quadro, voo horizontal, inclinações cima/baixo, tiro e dano, todos com a nave voltada à direita. A explosão de quatro quadros é um asset separado na biblioteca; nenhuma entidade ou evento de explosão é colocado automaticamente na cena.

As imagens são cópias binárias da preparação aprovada. O único ajuste de âncora é em metadados: origem Animator −8,−24 para o consumidor SHMUP, que posiciona o canvas pelo canto superior esquerdo. `originSpace: animator` converte essa origem para a prévia da imagem completa no Editor. Os idles, slices e poses continuam iguais. O segundo quadro de tiro ocupa a coluna preparada 9 (retorno ao idle); o quadro 9 da grade bruta foi descartado na preparação e não é distribuído.

Registro de promoção: `tools/gba-sprite-prep/production/blank-shmup-horizontal-v2-approved/approval.json`. O modo SHMUP nativo atual desenha a pose fixa; o acionamento automático das animações nomeadas e da explosão não foi adicionado por esta integração. A seleção por cena e a configuração `settings.shmup.playerSprite` só são adicionadas ao template público em branco.
