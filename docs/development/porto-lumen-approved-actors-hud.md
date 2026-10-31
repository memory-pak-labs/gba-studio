# Atores de 48 px e HUD B em Porto Lumen

O exemplo usa as duas poses frontais e a HUD B aprovadas pelo mantenedor.
Os arquivos anteriores e o mapa paginado permanecem preservados. A autoria é
própria, gerada com `image_gen`; nenhum pixel das referências de Zelda foi usado.
Hashes, autorização, origem e contratos estão em
`apps/desktop-electron/fixtures/asset-provenance/porto-lumen-actors-hud-b.json`.

Os corpos têm 48 px de altura. O recorte do canvas para 32 × 48 remove somente
transparência, sem reduzir novamente o desenho, e usa dois OBJs por ator.
A colisão continua independente: 16 × 16, deslocamento (0, −8), com os pés no
centro inferior. Os sprites usam 8bpp e uma paleta RGB555 adaptativa que aproveita
cores dos outros NPCs; não foram convertidos para uma paleta de 15 cores.
As poses frontais permanecem como referências aprovadas na biblioteca. O
exemplo usa agora as animações de quatro direções aprovadas separadamente;
contrato e validação estão em [Animações direcionais](porto-lumen-directional-animations.md). Ao entrar no Farol, a cena conserva seu player anterior;
ao retornar ao Porto, restaura o ator de 48 px e a HUD B.

As molduras ocupam (4, 4, 60, 18) e (180, 4, 56, 18). Imagens são overlays OBJ,
sem texto ou atores incorporados ao BG. Padding técnico dos PNGs não muda as
dimensões visíveis. A opção `pixelPosition` preserva medidas em pixels na autoria
e na prévia, mantendo a grade de 8 px para componentes sem essa opção.

Os três corações usam uma barra de imagens cheia/vazia e a variável
`porto_player_health`, inicializada em 3 na primeira entrada. Essa variável é
demonstrativa: não foi adicionado um sistema de dano ao jogador. Moedas leem o
item 0 do inventário real, incluindo compras e recompensas. O campo mostra três
dígitos; o valor inicial da campanha é `003`. A fonte aprovada usa glyphs 5 × 7,
avanço de 6 px, com renderização própria em um OBJ 32 × 8.

Componentes HUD podem declarar `valueVariable`, `inventoryItem` e
`valueMaximum`; cada componente tem uma única fonte de valor. O exportador
resolve a variável e emite `value_variable`, `inventory_item` e `value_maximum`.
`textAdvance: 6` emite `text_advance: 6`. `foregroundImage: true` permite que a
barra de corações fique acima da moldura OBJ sem alterar as barras dos outros
presets. O Engine Pack anuncia e exige `hud_project_value_bindings`,
`hud_compact_text` e `hud_foreground_images` quando usados.

A ordem nativa em Porto é: atores na prioridade 2, molduras na 1, ícones,
corações e texto compacto na 0. Barras sem `foregroundImage` continuam na 1,
preservando textos BG0 dos outros presets. O texto compacto usa os slots livres
no fim da reserva HUD, à frente dos ícones. A fonte da cena tem precedência sobre
a fonte base na inicialização.
Bindings são atualizados a partir do estado de eventos e invalidados ao trocar
de layout. Regenerar o exemplo conserva assets, poses, HUD e eventos vinculados.

Validação focada: `portoLumenApprovedAssets.test.ts`, `hudPresets.test.ts`,
`hudPreviewSnapshot.test.tsx`, testes host de UI, `hud_compact_text_tests`,
`topdown_actor_pose_tests.py` e `hud_behavior_export_tests.py`.
O fechamento usa `npm run gate:complete-project` em `apps/desktop-electron`,
incluindo Editor/Play, além de inspeção da ROM no mGBA. Hardware físico é uma
etapa separada.

A auditoria de cenas reconhece os metasprites compostos 8bpp, incluindo
endereços de tile medidos em unidades de 32 bytes. Porto exige comparação
individual dos atores aprovados com a fonte e o framebuffer, usando a câmera
e os offsets exportados; apenas pixels exatos das molduras/ícones declarados
podem ocluir o ator. O antigo player de 32 px não é sua referência visual.
A contagem conjunta permite até 512 entradas de paleta BG/OBJ, conforme
[Tonc](https://gbadev.net/tonc/video.html); a associação de cada cor do
framebuffer às paletas exportadas continua obrigatória.
