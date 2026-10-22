# Diálogo com retrato e aba compacta

No inspetor de Diálogos de uma cena, em **Aparência → Apresentação nesta cena**,
selecione **Retrato com aba compacta · 40 px**. O campo persistido é
`room.dialoguePresentation: "portrait_tab"`. A ausência do campo conserva a
apresentação padrão do projeto. A opção não altera os padrões globais de diálogo
nem o tema das demais cenas.

O preset usa caixa inferior de 224 × 40 px em `(8, 112)`, três linhas de 26
caracteres, retratos de até 48 × 48 px em moldura de 56 × 56 px e aba de nome de
16 px de altura. A aba acompanha o lado do retrato e comporta até 19 caracteres.
O nome fica fora das três linhas da mensagem. Sem retrato, a aba acompanha a
margem esquerda da caixa. As cores partem da paleta da skin selecionada no tema;
o Conselho usa `frame-council-v13.png` em azul petróleo.

O Conselho da Guardiã é a única cena do Exemplo GBA que ativa o preset. Seu
background, seus dois retratos transparentes e a skin de interface são assets
independentes. Textos, nomes, seleção e moldura são desenhados pelo sistema de
diálogo. Origem, aprovação da direção V1.3, hashes e preparação técnica estão em
`apps/desktop-electron/fixtures/asset-provenance/council-v13-approved-manifest.json`.
As revisões anteriores permanecem preservadas como fontes históricas.

## Contrato do motor

A exportação declara a capacidade `dialogue_portrait_tab` e envia a apresentação
com seu `runtime_kind` no binding de `dialogue_ui.scene_skins`. O binding é
reposto ao trocar de cena. Cada runtime que contém uma cena com essa opção recebe
um workspace em seu overlay de EWRAM. Os outros runtimes conservam seus limites
de memória; projetos sem a opção não reservam esse raster.

A interface ocupa oito OBJ em OAM 114–121, tiles OBJ 512–895 e banco de paleta
OBJ 15. Os retratos conservam OAM 110–113. O `assetc` rejeita conflitos de tiles
com assets globais ou residentes na cena. Retratos 8bpp mantêm seu contrato de
cor e compartilham a paleta de OBJ do motor, sem usar os bancos privados da UI.

Os frames contêm apenas índices de função de cor, sem retratos ou texto. São
reproduzíveis com `python3 tools/generate_portrait_tab_frames.py` em
`packages/GBAStudioEngine`. O RLE evita reconstruir a moldura por pixel no ARM7;
após a troca de nome/lado, atualizações de texto transferem somente os 4 KiB da
faixa inferior. Verifique com `make portrait-tab-test` e os testes de exportação
do app. Validação no Play e na ROM continua necessária para mudanças visuais.
