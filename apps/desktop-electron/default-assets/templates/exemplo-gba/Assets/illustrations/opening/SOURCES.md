# Abertura: encontro no cais

Arte original gerada por IA (image_gen), sob direção do mantenedor. Licença: project-owned, autorizada para distribuição neste exemplo. Nenhum pixel de jogos comerciais foi incorporado.

O usuário aprovou o quadro completo e depois a sequência de oito segundos em 16/10/2026. As três camadas nativas de 240 × 160 são preservadas em scenery.png, nara.png e mechanic.png. A recomposição das camadas reproduz exatamente o repouso aprovado.

O runtime usa uma composição estática dessas camadas (600 tiles 4bpp, 14 bancos), mais um metasprite de recomposição local (128 × 96, 8bpp, dez poses, quatro OBJs, 12 KiB residentes). Somente a pose ativa é enviada à VRAM. Isso conserva a imagem sem carregar dez backgrounds nem duas cópias de um tileset. A transparência das poses mantém todas as áreas que não mudam. Os patches de mão incluem a recomposição do fundo revelado pelo movimento.

O repouso e as camadas estáticas não sofreram nova redução ou quantização. A sequência aprovada já contém a preparação de 143 cores OBJ: cinco pares próximos foram unificados apenas nos novos pixels móveis para caber na paleta compartilhada do projeto. Nenhuma preparação adicional foi aplicada na promoção.

Os arquivos de runtime foram copiados byte a byte das versões aprovadas. Origem, hashes, ordem das poses, posição e duração estão em layers.json e nos metadados do projeto. A animação não utiliza os sprites top-down de Porto Lumen; estes permanecem inalterados.
