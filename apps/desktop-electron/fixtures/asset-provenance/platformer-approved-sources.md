# Penedos do Vento — reconstrução fiel à V2

O usuário aprovou a composição V2 e autorizou refazer o layout após rejeitar a
primeira integração. Em 22/10/2026, após revisar as capturas reais do Play e da
ROM, aprovou também a versão executável e autorizou o commit apenas da cena de
plataforma. O manifesto registra `runtimeVisualReview: approved`, a evidência
da aprovação e os hashes da prévia, das fontes, dos PNGs e da ROM revisada.

O BG3 contém somente céu, ilhas distantes, farol e mar. O BG2 contém a silhueta
orgânica dos penedos, a ponte completa, a escada e a bandeira. Pixels da V2 são
reaproveitados fora das áreas ocupadas por atores e HUD; as imagens derivadas
com image_gen completam essas áreas e fornecem a máscara do terreno. O limiar
240 da máscara remove o halo sem transformar o cenário em módulos de rocha.
As fontes e a versão nearest-only são preservadas antes da preparação nativa.

A abertura recompõe a V2 em 240 × 160. O terreno recebe deslocamento vertical
de 4 px para alinhar o piso à grade. O mundo continua com 960 × 320, formado por
quatro enseadas completas; a câmera acompanha somente o eixo horizontal, com
y fixo em 160. Colisões, entrada (8,34), checkpoint, escada e zonas de queda
acompanham esse layout. A progressão de campanha, habilidades e áudio permanecem.
O retorno por dano usa (21,34), fora da patrulha do primeiro caranguejo.

BG2/BG3 compartilham planejamento conjunto por tile em até 14 bancos 4bpp;
bancos 14/15 ficam reservados à UI. Não se aplica a redução global da primeira
integração rejeitada, nem fusão aproximada de tiles. Os dois PNGs preparados
contêm 177 cores RGB555 visíveis em conjunto. Ainda há adaptação de resolução
e paleta: a imagem nativa não reproduz cada pixel da prévia de 1536 × 1024.

Os sete atores continuam independentes em OBJ. Nara mantém 24 quadros-fonte
64 × 64 e os mesmos pivôs, com reamostragem por quadro para corpo de 39 px.
Trabalhador, caranguejos e mariposas recebem escala proporcional; cores da arte
anterior são preservadas. O sinal de checkpoint tem quatro quadros próprios,
com a lanterna da V2, e paleta adicionada ao conjunto OBJ existente.

A HUD permanece independente: duas molduras de 40 × 16 em (16,6) e (184,6),
três corações com passo de 9 px e contador de dois dígitos. As molduras são
adaptações da arte B própria de Porto Lumen; ícone e fonte compartilhados
permanecem. Vida e fichas usam `penedos_player_health` e `penedos_tokens`.
O coração vazio usa o mesmo tom creme do cheio para que a barra dinâmica
compartilhe índices de paleta; essa adaptação afeta 27 pixels da folha vazia.
Os números são renderizados pela fonte real; atores, corações e contador não
fazem parte dos pixels do background.

Todas as imagens são arte própria gerada por IA sob direção do usuário.
Licença: Project-owned AI-generated artwork. Nenhum pixel de jogos comerciais
foi incorporado. A aprovação anterior de mundo, atores e áudio é mantida como
histórico, separada da revisão desta integração.

Para reproduzir a validação a partir de `apps/desktop-electron`:

```sh
node scripts/build-platformer-playtest.mjs /caminho/exportacao
node scripts/smoke-platformer-approved.mjs /caminho/exportacao/build/exemplo.gba /caminho/evidencias
node scripts/verify-platformer-v2-hud.mjs /caminho/evidencias /caminho/exportacao
npm run smoke:exemplo-scenes -- --scene=penedos_vento
```

Execute o roteiro de Play com a interface em português em uma sessão isolada de QA.
O smoke de ROM dirige entradas reais e confere BG/sprites em RGB555, animações,
escada, combate, checkpoint, save/reload, dano, pausa e saída. A verificação
adicional da HUD compara cinco capturas aos PNGs e glifos, com valores reais
de vida/fichas. Os estados de animação usados pertencem ao frame renderizado,
capturados antes de avançar o emulador. O áudio é observado por até 120 frames,
sem disparar um SFX. Evidências de emulador não substituem teste em GBA físico.

## Apresentação anterior, preservada como histórico

Aprovação explícita: 17/10/2026, candidato da galeria local 8811. O usuário autorizou a implementação depois de solicitar um mapa maior que o viewport.

Arte original produzida com image_gen sob direção do usuário. Licença da arte: Project-owned AI-generated artwork. Porto Lumen e o player plataforma do projeto em branco servem como referências próprias; nenhum pixel de jogos comerciais foi incorporado. Música e efeitos são composições PSG originais incluídas no manifesto aprovado.

O mundo mede 960 × 320; a câmera mostra 240 × 160 em escala nativa e acompanha Nara dentro dos limites. O terreno usa BG2 em tiles 8 × 8 reutilizados, separados da paisagem BG3 fixa na tela. As duas camadas compartilham o plano de 14 bancos preparado e aprovado. A integração não aplica nova redução de cores, escala ou fusão destrutiva de tiles.

Nara mantém os 24 quadros-fonte de 64 × 64, com corpo próximo de 48 px. Vinte e dois quadros distintos compõem os estados de repouso, caminhada, salto, queda, pouso, ataque, dano, escada, impulso, planagem e deslizamento na parede. Os quadros 6 e 7 duplicam a passada e permanecem na fonte sem consumo adicional. As folhas de outros atores recebem somente recorte de transparência, sem remover pixels opacos. Cada inimigo simultâneo possui uma alocação de tiles independente para streaming de poses.

A HUD reutiliza a arte B de Porto Lumen, com vida e contador ligados às variáveis reais da fase. Os efeitos mantêm notas, timbres, volume e envelopes; seu andamento passa de 300 para 240 BPM para respeitar o contrato do compositor. Os SFX rotulados como Pulse 2 agora declaram Pulse 1, a voz efetivamente utilizada pelo exportador. O antigo cue de salto, sem referências após a substituição, deixa a biblioteca; sua definição permanece no snapshot anterior à integração. A música permanece no andamento aprovado. Essa adaptação técnica foi informada durante a integração.

O manifesto `platformer-approved-manifest.json` registra hashes, origem, planos de paleta, animações, âncoras, dimensões, colisões e a aprovação. `scripts/p0-source-catalog.json` vincula os nove PNGs ao contrato visual aprovado. Os originais anteriores permanecem no disco; apenas suas referências substituídas deixam a biblioteca ativa.

Validação reproduzível: gerar a ROM com `scripts/build-platformer-playtest.mjs`, executar `scripts/smoke-platformer-approved.mjs ROM.gba DIRETORIO`, e rodar `npm run gate:complete-project` a partir de `apps/desktop-electron`. Evidências de emulador não substituem teste em GBA físico.
