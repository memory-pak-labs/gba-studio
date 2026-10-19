# Apresentação Dungeon Crawler

As cenas `usina_submersa`, `usina_combate` e `usina_saida` usam a apresentação aprovada de O Último Farol. O labirinto lógico tem 11 × 11 células; a câmera em primeira pessoa permanece em 240 × 160. Essas medidas são independentes também na prévia do Editor.

## Contrato opcional

`runtime.config.presentation` declara a moldura da HUD e os sons de ação. O asset de fundo declara `metadata.dungeonViewCache`, com as referências aos três assets Data e um índice de vistas por posição e direção. `metadata.runtimeDependencies` mantém esses binários no workspace, na auditoria de uso e na exportação.

Os atores podem declarar `dungeonDepthSheets` com `near`, `mid` e `far`, além de `dungeonCell`. Cada atlas mantém frames editáveis pelo contrato de animações do projeto. O exportador emite `DungeonPresentation`, `DungeonViewCache` e `DungeonActorFrames`; os campos são opcionais. Projetos anteriores continuam usando o fundo estático e o fluxo de combate existente.

O índice aprovado cobre as quatro direções de todas as 51 células livres: 204 vistas. `dungeonViewCache.authoring` guarda a assinatura da geometria e oito materiais de 64 × 64 em RGB555/base64, derivados sem perda dos materiais aprovados. Quando a grade muda, o exportador emite `presentation.view_recipe`; o assetc reconstrói as quatro direções de cada célula livre. Vistas de geometria antiga nunca são reutilizadas silenciosamente. Sem mudança, os binários aprovados permanecem idênticos. A grade, os gatilhos, as entradas das conexões e os comandos de troca de cena usam coordenadas do labirinto, nunca pixels da câmera.

## Editor

A **Tela ampliada** mostra a câmera como superfície principal, em 240 × 160 com ampliação inteira e HUD no mesmo quadro. O botão **Mapa** mostra o labirinto completo: paredes e passagens, início, atores e gatilhos em células lógicas. A prévia GBA flutuante usa o mesmo compositor dos cards e da tela ampliada. Não há um mapa ortográfico sobreposto à imagem frontal.

Selecionar uma passagem ou girar a prévia não altera o início salvo. **Definir como início** confirma posição e direção explicitamente. O mapa permite pintar/apagar/preencher paredes e selecionar/adicionar/mover atores e gatilhos; os campos do inspetor continuam editáveis. Colisões usam o histórico do projeto. Grades menores que 30 × 20 são válidas; as dimensões do fundo são verificadas contra 240 × 160, independentemente da grade.

Na geometria editada, a câmera mostra uma prévia por amostragem nearest dos materiais aprovados e informa a reconstrução pendente. Play/exportação aplicam o empacotamento de paletas GBA. Os materiais são insumos do compilador, sem custo adicional de VRAM. A reconstrução aceita até 64 × 64 células, 256 passagens, 479 padrões residentes por vista e 14 bancos de paleta do mundo; ultrapassar esses limites gera erro, sem reduzir detalhes automaticamente. O projeto completo continua sujeito ao orçamento de ROM.

## Orçamento e composição

O cache compartilhado ocupa 1.811.328 bytes na ROM. IDs globais de padrões são remapeados para uma janela residente por vista; os 39.132 padrões não são carregados simultaneamente na VRAM. O máximo aprovado é 451 padrões visíveis, mais o tile transparente reservado.

| Recurso | Destino |
| --- | --- |
| Mundo | BG2, character base 0, tiles 0–451, bancos de paleta 0–13 |
| Moldura fixa | BG1, tiles a partir de 480, banco 14 |
| Mapa lógico | BG0, tiles 800–803, banco 14 |
| Fonte e diálogo | Reservas existentes da UI, banco BG 15 |

A vista é validada e preparada em EWRAM antes de qualquer upload. Tiles, paletas e mapa são trocados no VBlank. O carregador verifica offsets, capacidade, IDs e flags. A moldura restaura sua paleta depois da configuração global da UI. Durante diálogos, os componentes da HUD ficam ocultos para não se sobreporem à caixa de texto.

A sentinela usa os atlas aprovados em 64, 32 e 16 pixels; a célula usa 32, 16 e 8. Os anchors preservam a projeção e as reduções aprovadas. A sentinela possui idle, alerta, ataque, dano, defesa, derrota e reativação; a célula possui brilho e coleta. A vida alimenta os três corações e a barra do inimigo. O mapa fecha com A, B ou Start. A pausa conserva o combate, e a coleta mantém o estado persistente e o checksum do save.

## Origem e preservação

No projeto em branco, novos NPCs Dungeon usam o guarda frontal roxo aprovado, separado da mão opcional do jogador. Os frames `near`, `mid` e `far` têm 64 × 128, 32 × 64 e 16 × 32 pixels, com pivô nos pés e 2/1/1 OBJ nativos. A escala próxima ocupa 98 pixels visíveis de altura. O catálogo `templates/blank/dungeon-defaults.json` e `fixtures/asset-provenance/blank-dungeon-guard-*` registram a origem e os hashes aprovados. O padrão só se aplica à criação de NPCs com a biblioteca disponível; projetos anteriores e escolhas explícitas de sprite permanecem válidos. O guarda possui idle estático, sem novas animações de combate.

O manifesto e a origem ficam em `apps/desktop-electron/fixtures/asset-provenance/dungeon-approved-*`. As imagens preparadas e os três binários são os arquivos aprovados; não houve nova geração nem redução de cores na integração. O áudio contém duas músicas e sete efeitos PSG originais. Os arquivos antigos foram preservados, embora referências obsoletas e sem consumidores tenham sido retiradas da biblioteca do exemplo.

## Verificações

Na raiz do repositório:

```sh
make -C packages/GBAStudioEngine dungeon-presentation-test
```

Em `apps/desktop-electron`:

```sh
npx vitest run scripts/dungeon-approved-promotion.test.mjs src/shared/dungeonSceneView.test.ts src/renderer/DungeonSceneEditor.test.tsx
node scripts/smoke-electron-exemplo-scenes.mjs --scenes=usina_submersa,usina_combate,usina_saida
node scripts/smoke-dungeon-approved.mjs <ROM.gba> <pasta-de-evidencias> <pacote-aprovado>
# ROM de teste com parede em (1,8), início em (1,9), Norte:
node scripts/smoke-dungeon-edited-geometry.mjs <ROM.gba> <pasta-de-evidencias> <dungeon_crawler_project_data.hpp>
npm run gate:complete-project
```

O teste nativo usa o ELF correspondente à ROM como oráculo somente de leitura e envia botões reais ao mGBA. Cobre 200 vistas alcançáveis antes das transições automáticas, combate, pausa, coleta e save. As 204 vistas também possuem validação offline no pacote aprovado. Esses testes não substituem uma verificação em GBA físico.
