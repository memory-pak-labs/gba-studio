# Registro de viajante — assets aprovados

O usuário aprovou em 2026-10-16 a revisão 2 da escolha de gênero e entrada de
nome, incluindo a preparação de cores. Os hashes e contratos estão em
`traveler-entry-manifest.json`. Seis PNGs são promovidos; os anteriores
continuam na biblioteca, sem alteração dos seus pixels.

Os fundos são arte original gerada por IA sob direção do projeto, com títulos
fixos trabalhados em português. Cantos mantêm escala nativa e os painéis usam
trechos repetidos de borda. As fontes brutas e prompts permanecem no arquivo
privado de candidatos; seus nomes, dimensões e hashes constam no manifesto.
Não foram copiados pixels de jogos comerciais nem presumida licença CC0.

Os retratos de gênero têm dois frames de 64 × 64 preparados diretamente da
fonte original. O nome usa dois frames de 48 × 48, copiados da revisão aprovada.
As identidades seguem Nara e a variante feminina existentes. Nenhum sprite de
movimentação foi alterado. Os quatro cantos de foco são geometria autoral.

HOMEM e MULHER são a camada fixa de glyphs já vista na composição aprovada,
recuperada deterministicamente da fonte MIT do GBAStudioEngine. Não há nova
fonte gerada por IA. Nome e teclado continuam dinâmicos, com o renderer atual.

BGs: 4bpp, 14 bancos, meta de 600 tiles e erro zero de remapeamento. Retratos:
8bpp com paleta adaptativa compartilhada, sem dithering. Foco e rótulos: 4bpp.
As preparações foram aprovadas visualmente antes da integração; aprovação não
é inferida do resultado técnico do pack.

O teclado ocupa a grade nativa de 16 × 10 tiles, em (11, 8); o nome tem oito
caracteres em (15, 5). A moldura reserva pelo menos quatro pixels de folga em
todos os 29 estados de foco, inclusive os oito pixels adicionais do comando
OK. Escolha, ações, variáveis, retorno e transição ao prólogo permanecem no
contrato do projeto.
