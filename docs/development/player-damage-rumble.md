# Evento de dano e rumble

Nas cenas **Batalha RPG** e **Shoot ’em up**, selecione a cena em **Eventos**
e vincule um evento ao estado **Ao receber dano**. Adicione o comando
**Rumble: Vibrar por quadros**, por exemplo `rumble_on_for 12` (aproximadamente
0,2 segundo a 60 quadros/s). O vínculo salvo na cena é `eventBindings.onHitPlayer`.

Na Batalha RPG, o evento ocorre uma vez quando um turno inimigo reduz o HP de
qualquer integrante do grupo, inclusive no golpe fatal. Ataques do jogador,
cura e defesa do inimigo não o acionam. O evento de derrota aguarda o término
do evento de dano.

No Shoot ’em up, contato com inimigos e projéteis inimigos acionam o evento
somente quando retiram uma vida. Colisões durante a invulnerabilidade não o
acionam. Cada onda recebe o vínculo da sua cena. Os eventos existentes do
inimigo ou projétil continuam primeiro; o evento da cena vem em seguida.
O compilador reúne os comandos em um único script, preservando esperas,
desvios relativos e o término de cada evento. A derrota ou conclusão da onda
aguarda o evento de dano.

A prévia rápida da Batalha RPG simula o evento e o estado lógico de rumble.
A verificação de colisões do Shoot ’em up requer o Play da ROM nativa.

A vibração física requer cartucho com motor e um `RumbleProvider` compatível
instalado pelo runtime. A interface da engine e o comando, sozinhos, não
instalam esse driver. Cartuchos sem suporte continuam executando o jogo.
Testes com provider simulado comprovam a lógica, sem comprovar o motor físico.

O export exige `battle_rpg_runtime.player_damage_event` ou
`shmup_runtime.player_damage_event` somente quando o evento está vinculado,
evitando que um Engine Pack anterior ignore esse vínculo.
