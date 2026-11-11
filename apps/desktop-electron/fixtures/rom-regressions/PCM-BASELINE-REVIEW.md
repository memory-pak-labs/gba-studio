# Referências após a otimização PCM

A expansão PCM configura o timing do cartucho antes da cópia inicial e reserva
IWRAM para os kernels de áudio. Essas alterações mudam a fase do sprite
procedural de diagnóstico, que usa `gbs::frame_count()`. O fundo e os sprites
do jogo não foram substituídos.

A revisão compara as ROMs exatas dos produtores de CI:

- Referência: PR #11, revisão `2193498892995d17154a928152b018137ae110c8`,
  [execução 43066636197](https://github.com/memory-pak-labs/gba-studio/actions/runs/43066636197).
- PCM: PR #12, revisão `06a73e56ad8a2db406d80e5027e03872c42d0830`,
  [execução 43070581089](https://github.com/memory-pak-labs/gba-studio/actions/runs/43070581089).

Nos três perfis de `visibility-graphics`, as seis capturas diferentes contêm
exatamente o mesmo quadrado vermelho de 8 × 8 pixels, na linha 32, em outra
posição horizontal. Removendo somente esse marcador, todos os pixels coincidem
com a referência aprovada. Vinte outras capturas disponíveis coincidem sem
alteração. Os dois checkpoints de `resident-keep` permanecem sujeitos à
verificação completa na CI; seus hashes anteriores são mantidos.

Em duas janelas consecutivas de 60 quadros exibidos, `resident` e `paged`
mantêm 60 atualizações. A fixture de plataforma passa de 20 para 30 atualizações.
Os checkpoints fixos 180/240 e a exceção existente 181/241 são preservados,
assim como o core mGBA e seu hash. A verificação normal continua sem atualizar
referências nem aceitar uma faixa de quadros.

O controlador de botões do teste de `ReplaceTile` verifica a posição exata
quando ela é observada, libera os botões e só então avança os dois quadros de
renderização. O retorno guarda essa posição observada para que a comparação não
use uma posição posterior. As coordenadas continuam sem tolerância.
Permanecem a parada exata na colisão fechada, a passagem pela porta aberta,
fechar/reabrir, os 64 pixels RGB555 do tile e a recuperação após rolar a câmera.
A reprodução de 11 variantes disponíveis das ROMs antigas e novas preserva essas
verificações. A variante que mantém a colisão é rejeitada quando se exige
passagem livre.

O marcador é uma fixture técnica gerada em `visibility_rom_fixture.py`; não é
um asset visual distribuído no Exemplo GBA. A validação é emulada, sem prova de
hardware físico.
