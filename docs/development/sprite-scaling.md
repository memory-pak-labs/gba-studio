# Escala e estiramento de sprites

Em **Sprites → Animação → Escala no jogo**, configure os eixos X e Y
independentemente, entre 0,5 e 2. Use o mesmo valor nos dois eixos para escala
uniforme; valores diferentes esticam ou comprimem a arte. A configuração
pertence à animação e acompanha seus consumidores nos tipos de cena nativos.
Para referências estáticas e retratos, é usada a escala da animação selecionada
ou da primeira animação associada à folha.

O PNG, os tiles na ROM e a colisão mantêm as dimensões originais. Os frames
exportados conservam o formato OBJ nativo e usam matrizes affine para desenhar
a imagem. As posições das partes do metasprite acompanham a escala. O canvas
de edição mantém a geometria da fonte; a prévia da cena representa a escala
de jogo. Ajuste a colisão separadamente quando necessário para o gameplay.

O GBA tem 128 entradas OAM e 32 matrizes OBJ compartilhadas. A escala autorada
usa até 16 matrizes (índices 16–31), deduplicadas durante o desenho; os índices
0–15 ficam disponíveis para os efeitos nativos. Sem escala autorada, a API
explícita pode continuar usando os 32 índices. A exportação aceita até quatro
pares de escala por cena, reservando as quatro combinações de espelhamento de
cada par, e rejeita colisões com índices Affine OBJ explicitamente autorados.

Rotação, perspectiva e zoom nativos são combinados com a escala da animação.
Essas combinações podem consumir mais matrizes do que os pares estáticos; o
runtime não escreve além das 32 matrizes nem sobrescreve uma matriz automática
em uso. Caso os 16 slots automáticos sejam esgotados, o OBJ excedente fica
oculto naquele desenho. Reduza as combinações ou a quantidade de atores nesse
caso. A configuração não garante que todo arranjo dinâmico caiba no hardware.

O modo double-size amplia o canvas de recorte, não a dimensão do tile de origem.
Escala somada a zoom/rotação pode ultrapassar esse canvas e sofrer recorte do
hardware. Sprites affine também gastam mais tempo por linha; OAM e o orçamento
de desenho por scanline continuam sendo limites separados. Examine a cena na
ROM e no hardware para fechar a validação de densidade e desempenho.

Os deslocamentos das partes continuam no intervalo -128 a 127; a exportação
rejeita uma escala que exceda esse contrato. Valores não finitos ou fora dos
limites também são rejeitados no projeto e na geração de assets.

Referência: [sprites affine no Tonc](https://gbadev.net/tonc/affobj.html).
