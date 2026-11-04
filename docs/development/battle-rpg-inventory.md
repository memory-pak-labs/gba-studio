# Item de cura em batalhas RPG

No inspetor de uma cena **Batalha RPG**, abra **Recursos da cena** e ative
**Inventário da batalha**. O inspetor configura um consumível de cura por cena:

- **Chave do item**: identificador usado pelos eventos, por exemplo `potion`.
- **Rótulo do item**: nome mostrado no menu, por exemplo `POCAO`.
- **Quantidade inicial**: quantidade disponível ao começar uma batalha nova.
- **Cura por item**: pontos de vida recuperados por uso.

Para conceder o item por evento, adicione **Adicionar item ao inventário**,
use a mesma chave `potion` e informe a quantidade. O editor resolve a associação
mesmo quando há outros itens no projeto; não é necessário escolher um índice
numérico. A condição **Possui item** consulta essa mesma quantidade.

No Player, abra **ITENS** e escolha o consumível. Com mais de um integrante,
selecione quem receberá a cura. Cancelar, escolher alguém com HP cheio ou
escolher alguém derrotado preserva a quantidade e o turno. O item de cura não
reativa integrantes derrotados.

Um uso válido consome uma unidade, limita a cura ao HP máximo e passa o turno
ao adversário. A quantidade consumida permanece consumida ao restaurar o save.
