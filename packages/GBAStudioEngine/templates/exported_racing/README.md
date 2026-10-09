# Exported Racing

Template nativo de Corrida para GBA Studio, com vista de cima ou perspectiva affine com câmera atrás do carro. A acelera, B freia e Esquerda/Direita viram. A pista, colisões e parâmetros físicos são gerados a partir da room.

Na perspectiva com circuito, o mapa quadrado usa 32, 64 ou 128 tiles de 8 pixels por lado e até 256 tiles únicos no piso. Células apagadas recebem um tile transparente; se os 256 tiles já estiverem ocupados e nenhum for transparente, o compilador pede espaço para ele. Panorama e minimapa são opcionais. A altura, distância e perspectiva da câmera acompanham os dados exportados.

Circuitos novos usam o checkpoint zero como chegada: atravesse os demais em ordem e volte à chegada para completar a volta. Projetos antigos preservam sua ordem anterior. Rivais percorrem a rota definida na cena. As animações idle, drive, steer_left, steer_right, brake, hurt, brake_left e brake_right usam todos os frames e tempos exportados, com fallback para projetos antigos sem esses clips. A vista de cima aceita idle, drive e hurt nas quatro direções (`_up`, `_right`, `_down`, `_left`); a rotação affine só completa os ângulos entre as orientações desenhadas. Cada cena pode declarar seu próprio player; projetos antigos continuam usando o player compartilhado.

O projeto exportado compila fora do repositório usando headers públicos, `lib/libgbastudio_engine.a`, `templates/gba.ld`, `templates/Makefile.gba`, `tools/gbsdoctor` e `tools/gbsbuild`, sem depender do Butano.
