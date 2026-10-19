# Logo do Exemplo GBA: fade clássico A

Marca própria existente de Memory Pak Labs / GBA Studio. O mantenedor escolheu
o candidato A com "gostei da opção A" e autorizou sua integração em 2026-10-19
com "pode integrar ao projeto exemplo".

A animação é programação determinística original sobre a marca existente.
Nenhum pixel, código, áudio ou fonte de jogos comerciais foi incorporado.
A marca permanece material próprio do projeto; não se atribui a ela uma
licença de terceiros nem a licença MIT do código automaticamente.

Os quatro PNGs anteriores permanecem preservados em disco. O manifesto contém
seus hashes, o hash da composição base e os hashes dos 53 PNGs usados no fade.
Os novos arquivos são cópias exatas dos quadros nativos aprovados: não houve
redimensionamento, suavização, dithering ou quantização global.

A prévia de 180 quadros a 50 fps foi amostrada em 216 ticks de tempo a 60 Hz
nominais. Quadros consecutivos iguais foram agrupados em 56 etapas, reutilizando
53 imagens. A duração real acompanha a atualização do GBA, aproximadamente
3,6 segundos. Cada imagem usa até 15 cores RGB555 opacas e um banco BG 4bpp.
A reserva transparente do banco permanece separada.

Os pixels e tempos são conferidos na ROM pelo script `smoke-startup-fade.mjs`.
O script também compara os headers do assetc, verifica a conclusão automática
para Abertura, seus 480 quadros contra as poses autoradas, a chegada posterior ao título e o salto com B/Start em três
momentos. A validação em emulação não substitui a execução em GBA físico.

Referências conceituais consultadas em 2026-10-19:

- Nintendo/Capcom em Minish Cap: https://www.spriters-resource.com/game_boy_advance/thelegendofzeldatheminishcap/asset/241527/
- Game Freak em Pokémon FireRed/LeafGreen: https://www.spriters-resource.com/game_boy_advance/pokemonfireredleafgreen/asset/3850/
- Estudo Konami em GB Studio: https://github.com/sttng/Konami-Logo-GB

Somente o conceito de apresentação foi estudado; nenhuma dessas fontes é
fornecedora de pixels ou autorização de uso de suas marcas neste template.
