# Relé auxiliar do Farol — V2

A V2 foi aprovada pelo usuário em 24/10/2026 para substituir a passarela.
O pedido autorizou a integração, preservando o cenário aprovado e a escada,
com apresentação do resultado no Play e na ROM antes do commit.

## Origem e aprovação

Arte original gerada por IA sob direção do projeto. O arquivo
`farol-relay-v2-approved-preview.png` preserva os três frames aprovados,
com 48 × 48 pixels por estado e sem fundo ou HUD incorporados. O manifesto
JSON ao lado registra os hashes da fonte aprovada e do PNG preparado.
Os estados são avariado, instalação e funcionando, nessa ordem.

O canto superior esquerdo visual do ator é (248, 64), em pixels do mundo.
A posição autoral (33, 13), em tiles, considera a âncora dos metassprites do
exportador. A escada e os outros atores mantêm suas posições anteriores.

## Preparação reproduzível

1. `gba-sprite-stage-candidate` recebe o atlas aprovado com três regiões
   consecutivas de 48 × 48, sem redimensionamento, e `--reduce-to-4bpp`.
   A preparação canônica usa alpha binário com limiar 128 e redução RGB555
   por median cut para 15 cores visíveis compartilhadas.
2. `gba-sprite-pack`, com contrato `gba-native`, sem snap ou correção de
   silhueta, empacota quatro objetos por frame: 32 × 32, 32 × 16,
   16 × 32 e 16 × 16. Os deslocamentos dos três estados são preservados.
3. A integração traduz a âncora e os offsets do pack para o contrato de
   animação do editor. Não redesenha o PNG nem altera os sprites existentes.
4. A exportação usa OBJ de **8 bpp**, reutilizando as 176 entradas da paleta
   já aprovada de `porto-lighthousekeeper-body48.png`. A tentativa com outro
   banco de 4 bpp ultrapassou o orçamento OBJ da cena; compartilhar a paleta
   evita mudar as cores dos demais atores e da interface. O atlas fonte
   continua com 15 cores; a ROM faz o mapeamento RGB555 para a paleta comum.

As três animações são keyframes fixos. A sequência de instalação dura
120 frames e reutiliza a música e os efeitos existentes da missão.
A aprovação inicial da V2 refere-se à fonte e ao layout. Em 24/10/2026,
o usuário aprovou também o resultado final no Play e na ROM, incluindo a
conversão de cores, e autorizou o commit local do relé e correções relacionadas.

## Separação e validação

O fundo aprovado, seu mapa e sua colisão não são pintados pelo mecanismo.
O relé é um ator separado e a HUD mantém suas próprias definições.
`farol-relay.test.mjs` cobre remoção da passarela, consumo único da peça,
restauração e preservação dos dados. Os smokes com `--relay` percorrem a
missão usando controles e saves reais. `verify-farol-relay-pixels.mjs`
compara os pixels renderizados do fundo, escada e relé com seus consumidores
reais. Evidências de execução e ROMs ficam fora do repositório.
