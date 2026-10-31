# Molduras do menu neutro

Substituições aprovadas explicitamente pelo mantenedor em 29/10/2026: painel com título/três opções e caixa A/B. Origem: edição com OpenAI imagegen dos assets originais e próprios do GBA Studio. Nenhum pixel de jogo ou artista externo foi importado. Licença do conteúdo de origem: Project-owned.

As saídas originais preservadas são `frame-source.png` (2158×729) e `hint-source.png` (1586×992). Os recortes de trabalho em resolução nativa, anteriores à preparação de alpha/paleta, são `frame-working.png` (128×80) e `hint-working.png` (80×24). Hashes originais, preparação e decisão de aprovação estão em `preparation.json`. Os PNGs preparados canônicos ficam em `default-assets/templates/blank/Assets/ui`, com os mesmos nomes e dimensões 128×80 e 80×24. Não há texto embutido; glyphs e seletor continuam dinâmicos na engine.

Preparação: preservar o canvas nativo; medir alpha e aplicar limiar 128 contra exterior quase transparente; encaixar por nearest-neighbor nos limites `sourceBounds`/`targetBounds`; usar a paleta roxa RGB555 existente de 8 cores. A revisão 2 do painel mantém margem abaixo das três linhas. O arquivo preparado mantém transparência binária.

Antes da promoção, o projeto de auditoria foi exportado por assetc/Engine Pack e conferido no Player com seletor, paginação, retorno e A/B. Aprovação visual é distinta do gate da versão, da assinatura de instaladores e da validação física. As fontes preservam detalhes anteriores à preparação; os hashes em scene-ui-defaults.json identificam a saída usada pela biblioteca.
