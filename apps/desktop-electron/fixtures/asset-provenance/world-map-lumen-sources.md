# Mapa-múndi de Porto Lumen

Versão aprovada em 19/10/2026 para integração no Exemplo GBA. Decisão do usuário:
“Gostei dessa versão com o dirigível. Pode integrar a cena mapa-múndi ao Exemplo GBA, mantendo o affine.”

O manifesto `world-map-lumen-manifest.json` registra SHA-256 dos PNGs preparados,
fontes de arte e composição musical. Fontes integrais e comparações de
preparação permanecem no arquivo local de produção.

- BG e dirigível gerados com `image_gen`, sob direção do usuário, usando Porto
  Lumen e o dirigível anterior do próprio projeto como referências. Nenhum
  pixel de jogo comercial foi incorporado. Assets próprios autorizados para
  distribuição no Exemplo GBA.
- BG: fonte1536×1024, revisão nearest480×320 aprovada, com limpeza visual leve
  solicitada anteriormente. Preparação adaptativa224 cores RGB555, sem
  dithering, preservando água, vegetação, areia, pedra e madeira. Consumidor
  `paged_bg`8bpp: atlas em ROM e janela residente31×21tiles; bancos BG14 e15
  reservados para HUD/diálogo. Sem fusão aproximada de tiles.
- Player: fonte1254×1254, recorte alpha>=8 após histograma, revisão nearest
  48×34 em canvas64×64 e máscara binária128. Contorno interno de2pixels
  azul-escuros e linha externa clara de1pixel na máscara do ator. Paleta
  adaptativa15 cores RGB555 com as duas cores reservadas. Um OBJ64×64 e um
  frame; inclinação e escala affine permanecem no runtime da viagem.
- Carta da HUD: rasterização determinística do Canvas aprovado, papel e
  bússola separados do BG. Três peças64×32 conservam pixels e posições da
  moldura. Nome, disponibilidade, travessia e comandos são texto dinâmico.
- Fonte: glyphs determinísticos da GBAStudioEngine, atlas128×112,
  U+0020..U+00FF, com acentos. Os glyphs `!` e `/` desta fonte exclusiva da HUD
  representam A/B; nomes de destinos usam letras normais. Fonte e desenho
  procedural sob MIT do repositório.
- “Mar Aberto”,84BPM: composição original de quatro padrões PSG em
  `manifest.music`, exportID `mapa_mar_aberto`. O WAV da revisão é uma audição
  sintetizada, não um sample importado. A trilha anterior continua disponível
  para outras cenas.

A promoção preserva eventos de viagem, variáveis de desbloqueio, pausa,
salvamento, início canônico e demais cenas. Editor, ROM/mGBA e hardware físico
permanecem camadas distintas de evidência.
