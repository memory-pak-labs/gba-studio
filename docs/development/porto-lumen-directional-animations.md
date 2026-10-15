# Animações direcionais de Porto Lumen

Nara e Mecânica de Lúmen usam as folhas aprovadas `porto-nara-animations48.png`
e `porto-mechanic-animations48.png`. Cada folha possui 20 quadros em grade de
cinco colunas e quatro linhas: repouso e quatro passos por direção, nas linhas
baixo, cima, esquerda e direita. A pose frontal de repouso contém os mesmos
pixels da referência `body48`, que permanece na biblioteca.

As folhas aprovadas são copiadas sem nova preparação, quantização ou
redimensionamento. Origem, hashes e autorização estão em
`apps/desktop-electron/fixtures/asset-provenance/porto-lumen-animations48.json`.
O BG paginado, a HUD B, as colisões da cena, os demais atores e a interação
`porto_recuperar_estrutura` permanecem preservados.

O canvas é 32 × 48, com altura visível de 47–48 px conforme o passo.
O collider independente continua 16 × 16 em (0, −8). Cada quadro usa dois OBJs:
32 × 32 em (−8, −40) e 32 × 16 em (−8, −8). As animações declaram 8 FPS;
a duração inteira de oito ticks aproxima essa cadência no runtime de 60 Hz.

O estado `four_direction_movement` preenche os oito slots
`idle_down/right/up/left` e `walk_down/right/up/left`, com
`mirrorLeftFromRight: false`. A esquerda possui desenho próprio.
O exportador já resolve os espelhamentos declarados; o runtime top-down não
aplica um segundo hflip à orientação selecionada.

As folhas usam o banco 8bpp aprovado e `streamFrames: true`.
Cada ator mantém somente 24 tiles de 64 bytes residentes (1536 bytes,
48 unidades nativas de endereço OBJ), com regiões separadas. Os 20 quadros
permanecem na ROM e cada troca carrega os tiles correspondentes à pose.

A mecânica conserva seu ponto inicial e percorre uma área pequena diante da
oficina com o movimento nativo `wander_box`. `topdownMovement.bounds` usa tiles
de 8 px; x=92, y=47, largura=4 e altura=4 viram (736, 376, 32, 32) no export.
Com collider de 16 px, o percurso tem 16 px por eixo. O intervalo de dois
ticks permite completar os quatro passos antes da curva. A animação continua
durante a espera entre passos e retorna ao repouso na parada ou cancelamento.
As colisões nativas continuam válidas; diálogos e menus suspendem o movimento.

O player usa as novas animações ao entrar/retornar a Porto. O Farol mantém seu
sprite próprio. A regeneração do exemplo conserva folhas, estados, configurações
de movimento e bindings aprovados.

A auditoria de captura considera a posição atual e, quando disponível, a
publicação imediatamente anterior da telemetria no mesmo cômodo. Isso trata
a fronteira entre o scanout nativo e a publicação da CPU, sem procurar posições
arbitrárias nem aceitar pixels divergentes. `inspectPresentedRuntime().state`
mantém seu contrato; `previousState` fornece essa evidência adjacente.

Validação de fechamento: testes host de poses/intervalo, contratos do export,
fontes/quadros em RGB555, tipos/build, Editor/Play e gate completo do template.
Execução física no GBA é uma evidência separada.
