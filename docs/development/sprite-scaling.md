# Escala e estiramento por eventos

A escala de jogo é um estado visual da **instância do ator**, separado da imagem,
da animação e da colisão. Os controles foram retirados do animador de sprites.
Em **Eventos → Ator → Aparência**, escolha Definir, Animar ou Restaurar escala.
O alvo aceita Player ou um ator da cena; os dois eixos usam porcentagens:
100/100 é o tamanho original, 150/75 deixa a imagem mais larga e mais baixa.

```text
animate_actor_scale Player 150 75 12
wait 12
animate_actor_scale Player 100 100 8
```

Definir aplica imediatamente. Animar faz uma transição linear em 1–32767 quadros,
sem bloquear o roteiro. Use Aguardar para encadear efeitos; um novo comando
interrompe a transição anterior e começa no valor visual atual. Restaurar volta
imediatamente a 100/100. Escala persiste ao trocar o clipe ou estado de animação,
mas reinicia ao entrar em outra cena. A escala não é gravada no save: defina o
estado visual desejado nos eventos de restauração, conforme as variáveis do jogo.
Não há mudança no formato do save. PNGs, tiles e caixas de colisão mantêm suas
dimensões.

O consumidor nativo de atores está ligado a Aventura, Plataforma, Isométrico,
Dungeon Crawler, Corrida, SHMUP, Point and Click, Menu, Cutscene, Batalha RPG e
Luta. Visual Novel e Mapa-múndi têm apresentações próprias; esses blocos não são
anunciados como comandos de seus retratos/cursor. Em menus, o alvo mantém seu
slot mesmo quando filtros de tela ocultam outros atores.

## Backgrounds

A composição da cena continua definindo a preparação física e a transformação
inicial do fundo. Em **Eventos → Cena → Fundo**, os blocos equivalentes atuam
sobre BG2 ou BG3, relativamente à composição inicial, em torno do centro da tela:

```text
animate_background_scale BG2 200 100 30
wait 30
reset_background_scale BG2
```

100/100 preserva a composição inicial; Restaurar retorna a ela, inclusive à
rotação e ao posicionamento configurados. O evento não converte um tilemap
regular nem aumenta o mundo/colisão. A exportação rejeita uma camada que não
esteja preparada para affine, inclusive quando o comando está em um evento
chamado por outro roteiro. HBlank autorado não pode disputar esse controle.

O caminho nativo atende os 13 tipos de cena. O fluxo é preparar o fundo no
inspetor da cena, escolher sua pose inicial e aplicar os blocos nos eventos de
entrada, interação ou estado. Os renderizadores mantêm suas responsabilidades:

| Tipo de cena | Aplicação e limite de uso |
| --- | --- |
| Aventura, Plataforma e SHMUP | Composição affine já suportada pelo perfil; movimento, atores e colisão continuam independentes. |
| Menu, Cutscene e Visual Novel | Imagem de fundo transformada; escolhas, diálogo, retratos e interface ficam fixos. |
| Batalha RPG e Luta | Imagem de fundo transformada; combatentes, HUD e regras de combate mantêm suas coordenadas. |
| Point and Click | Só a imagem de fundo muda. Props, cursor e hotspots mantêm suas coordenadas. Para um efeito temporário, use Aguardar e Restaurar antes de devolver o controle. |
| Mapa-múndi | O mapa e a posição dos marcadores seguem a mesma matriz e a câmera. Ícones mantêm o tamanho; navegação pelo grafo, textos e botões continuam próprios do perfil. |
| Corrida vista de cima | Imagem affine preparada substitui o desenho visual da pista; física e checkpoints permanecem no espaço do circuito. |
| Corrida em perspectiva | BG2 é o piso affine nativo, preparado em `pseudo3dVisuals.floorTilemapId`; não adicione outra camada BG2. A escala compõe com o raster existente, preservando o horizonte. A pista linear repete o piso; circuitos conservam suas bordas finitas. |
| Isométrico e Dungeon Crawler | Modo opcional de **imagem plana**: a camada affine substitui a vista do terreno e sua oclusão. Grade, colisão, atores e lógica permanecem nativos. Não amplia a projeção do terreno ou a geometria de paredes. |

Nos dez perfis ampliados, o fundo de imagem plana usa **BG2 no Modo 1**, com
asset `affine_bg` de até **512×512 pixels e 224 cores**, para preservar BG0/BG1 e
a paleta da interface. BG3 e bitmap são recusados nessa composição. O piso
nativo da Corrida em perspectiva conserva seu próprio orçamento e raster;
o limite de imagem plana não o redefine. Não é possível disputar BG2 ou
adicionar um segundo consumidor HBlank.

O asset precisa passar pelo pipeline `affine_bg`, com seu próprio formato de
tiles, mapa e paleta, e pelas validações do Engine Pack. O pack anuncia a
capacidade `events.background_scale_profiles`; um pack anterior não recebe
silenciosamente comandos sem consumidor. O GBA permite BG2 affine no Modo 1 e
BG2/BG3 no Modo 2; BG0/BG1 regulares não recebem escala, e o Modo 2 remove os
planos regulares usados pela interface desses perfis.

Point and Click e Mapa-múndi agora encadeiam os roteiros em quadros: Aguardar
mantém a animação visual ativa e suspende a interação normal até o roteiro
terminar. Isométrico agenda também os roteiros de escala, além dos movimentos.
Visual Novel usa o mesmo avanço em quadros na exportação isolada e mista.
O efeito continua transitório; não há novo formato de save ou persistência de
um roteiro em execução nesses perfis. Reaplique a pose desejada ao restaurar
uma cena usando as variáveis salvas do jogo.

## Limites

Os blocos limitam atores a 50–200% e fundos a 50–400% em cada eixo, quantizados em
8.8. São limites conservadores do editor; não representam a faixa matemática
completa das matrizes do GBA. O GBA tem 128 entradas OAM e 32 matrizes OBJ
compartilhadas. A escala usa até 16 matrizes automáticas (16–31), deduplicadas;
0–15 ficam disponíveis para os efeitos nativos. Não há escrita fora da tabela
ou substituição de uma matriz automática em uso. Se esse orçamento esgotar,
o OBJ excedente fica oculto naquele desenho. Evite muitos valores/interpolações
simultâneos, espelhamentos e rotações diferentes; valide a densidade na ROM.

Double-size amplia o canvas de recorte, sem mudar os tiles. Escala combinada
com zoom/rotação pode exceder esse canvas e sofrer recorte. Tempo de desenho
por linha, VRAM e OAM continuam sendo limites separados. Projetos desta tarefa
que já armazenavam escala na animação preservam essa base; os eventos compõem
sobre ela. Novos efeitos são autorados pelos blocos, por instância.

Referências: [OBJ affine no Tonc](https://gbadev.net/tonc/affobj.html) e
[backgrounds affine no Tonc](https://gbadev.net/tonc/affbg.html).
