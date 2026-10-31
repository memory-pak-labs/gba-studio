# Corridas aprovadas — Circuito dos Faróis e Rota da Maré

Aprovação explícita em 2026-10-18: “aprovado pode integrar”. Abrange os dois
mapas de 512 × 512, veículos, animações, paletas preparadas, HUD e áudio.
O manifest registra hashes SHA-256 dos PNGs promovidos, seus contratos e dados
reproduzíveis das cenas. Nenhum asset aprovado de outra cena é modificado.

Arte original gerada sob direção do usuário com ImageGen. Originais preservados
na revisão privada racing-two-views-candidates-v1-2026-10-18. Seis PNGs promovidos são cópias byte a byte da preparação aprovada.
Piso e panorama reservam o índice zero do GBA por realocação lossless: todos
os pixels RGBA continuam idênticos aos aprovados, com a mesma paleta de 224
entradas e os mesmos tiles. O manifest preserva ambos os hashes. Não há pixels extraídos de jogos
comerciais. A moldura e fonte reutilizam a HUD B aprovada de Porto Lumen.

Referências de encenação e escala, sem redistribuição de seus assets:
- https://www.gamespot.com/reviews/racing-gears-advance-review/1900-6119654/
- https://www.nintendo.co.jp/n08/amkj/what/index.html
- https://www.nintendo.co.jp/n08/afzj/
- https://gbadev.net/tonc/affbg.html
- https://gbadev.net/tonc/mode7.html

O mapa top-down usa 766 tiles de arte + tile transparente, 14 bancos BG.
Piso e panorama em perspectiva compartilham 224 entradas RGB555. O piso usa
236 tiles afins; bancos 14/15 ficam reservados para UI. Veículos usam uma
paleta OBJ compartilhada e frames transmitidos sob demanda, sem redução extra.
A HUD tem quatro painéis e textos com avanço de 7 px, mantendo as colunas dos
glifos. Música original COMPOSED, quatro vozes PSG; efeitos usam PSG de uma
voz com prioridade impacto > checkpoint > freio > aceleração. O motor é um
sinal breve ao acelerar, não uma simulação contínua de rotação do motor.

A campanha mantém seu final no Circuito dos Faróis. R alterna entre as duas
corridas; a Rota da Maré é um percurso extra independente. Não inclui o
Welcome template separado de Corrida 3D. Validação em hardware físico permanece
uma etapa distinta da exportação e execução em mGBA.
