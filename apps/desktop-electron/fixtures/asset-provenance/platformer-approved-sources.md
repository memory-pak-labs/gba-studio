# Penedos do Vento — fase ampliada aprovada

Aprovação explícita: 17/10/2026, candidato da galeria local 8811. O usuário autorizou a implementação depois de solicitar um mapa maior que o viewport.

Arte original produzida com image_gen sob direção do usuário. Licença da arte: Project-owned AI-generated artwork. Porto Lumen e o player plataforma do projeto em branco servem como referências próprias; nenhum pixel de jogos comerciais foi incorporado. Música e efeitos são composições PSG originais incluídas no manifesto aprovado.

O mundo mede 960 × 320; a câmera mostra 240 × 160 em escala nativa e acompanha Nara dentro dos limites. O terreno usa BG2 em tiles 8 × 8 reutilizados, separados da paisagem BG3 fixa na tela. As duas camadas compartilham o plano de 14 bancos preparado e aprovado. A integração não aplica nova redução de cores, escala ou fusão destrutiva de tiles.

Nara mantém os 24 quadros-fonte de 64 × 64, com corpo próximo de 48 px. Vinte e dois quadros distintos compõem os estados de repouso, caminhada, salto, queda, pouso, ataque, dano, escada, impulso, planagem e deslizamento na parede. Os quadros 6 e 7 duplicam a passada e permanecem na fonte sem consumo adicional. As folhas de outros atores recebem somente recorte de transparência, sem remover pixels opacos. Cada inimigo simultâneo possui uma alocação de tiles independente para streaming de poses.

A HUD reutiliza a arte B de Porto Lumen, com vida e contador ligados às variáveis reais da fase. Os efeitos mantêm notas, timbres, volume e envelopes; seu andamento passa de 300 para 240 BPM para respeitar o contrato do compositor. Os SFX rotulados como Pulse 2 agora declaram Pulse 1, a voz efetivamente utilizada pelo exportador. O antigo cue de salto, sem referências após a substituição, deixa a biblioteca; sua definição permanece no snapshot anterior à integração. A música permanece no andamento aprovado. Essa adaptação técnica foi informada durante a integração.

O manifesto `platformer-approved-manifest.json` registra hashes, origem, planos de paleta, animações, âncoras, dimensões, colisões e a aprovação. `scripts/p0-source-catalog.json` vincula os nove PNGs ao contrato visual aprovado. Os originais anteriores permanecem no disco; apenas suas referências substituídas deixam a biblioteca ativa.

Validação reproduzível: gerar a ROM com `scripts/build-platformer-playtest.mjs`, executar `scripts/smoke-platformer-approved.mjs ROM.gba DIRETORIO`, e rodar `npm run gate:complete-project` a partir de `apps/desktop-electron`. Evidências de emulador não substituem teste em GBA físico.
