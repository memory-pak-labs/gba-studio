# Sala de Maré Vazante

A sala opcional `sala_mare_vazante` é acessada examinando o lampião da passagem
técnica, dentro do arquivo da Galeria das Marés. O jogador abre primeiro o
portão da Galeria pelo quebra-cabeça existente. A ordem principal da campanha
permanece igual. A aprovação da arte V1.3 está em
`apps/desktop-electron/fixtures/asset-provenance/tide-annex-approved.json`.

## Camadas e eventos

O background paginado tem 384 × 256 pixels; a câmera acompanha Nara numa tela
de 240 × 160. Muretas e piso reutilizam a arte aprovada da Galeria. Válvula,
estabilizador, player e HUD são recursos separados. A válvula é um ator de
32 × 64; o módulo é um ator de 32 × 32. O ícone de inventário usa os mesmos
pixels com uma referência de paleta própria para o menu.

`tide_drain` bloqueia temporariamente o movimento, muda o estado da válvula,
revela duas linhas do piso e depois conclui a vazante. Os eventos
`replace_tile` e `replace_tile_sequence` alteram 210 células de 8 × 8 no BG2.
Só a etapa final libera a colisão da travessia. A textura e a paleta do piso
exposto são as mesmas usadas na Galeria.

`var_tide_state` é anexada aos estados existentes: 0 indica
água cheia, 1 drenagem iniciada e 2 canal seco. Entrada e restauração reaplicam
tiles, colisão e estado dos atores; um estado de drenagem retomado termina
seco. A coleta usa a variável existente `var_stabilizer`, no slot 5, esconde
o ator e salva no slot automático 0. O item não reaparece ao voltar ou carregar.

## Recompensa e progressão

O estabilizador é opcional e pode ser consultado no inventário. Em Tempestade,
`tide_wind_tick` desloca a aeronave um pixel para baixo. O temporizador passa
de 6 para 18 ciclos quando o módulo está instalado. O template SHMUP despacha
os callbacks de timer, e o assetc conserva a tabela de scripts indexados,
incluindo os slots vazios de outros runtimes.

Os cinco módulos principais conservam seus pontos de obtenção. Seus diálogos
e descrições de inventário explicam a origem e a próxima etapa da jornada.
Nenhuma habilidade adicional é atribuída a um módulo sem um evento que a use.

## Validação reproduzível

No Play, inicie uma partida, entre no Farol e examine a escada da Galeria.
Empurre a caixa até o contrapeso, entre no arquivo e examine o lampião da
passagem técnica. Na sala anexa, acione a válvula, atravesse o canal e recolha
o estabilizador. Confira sua descrição no inventário.

Salve antes e depois da coleta, reinicie e carregue pelos menus do jogo.
Confira o canal seco, a coleta única e o retorno à Galeria. Repita o percurso
na ROM exportada. Fundo, atores e HUD permanecem separados. Play, ROM e GBA
físico são verificações distintas; a validação em emulador não comprova hardware.
