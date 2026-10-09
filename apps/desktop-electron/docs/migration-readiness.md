# Electron migration readiness

Estado auditado em 2026-07-09 para a branch `codex/electron-migration`.

> Atualizacao de rota em 2026-07-09: `npm run gate:electron` passou no checkout local. O Electron/macOS esta funcional para o projeto real/base; o backlog restante e de release macOS, stress de projeto real, polish e P1/P2. Windows/Linux ficam adiados para a finalizacao depois do app Electron macOS estar pronto.

Este documento registra as evidencias acumuladas da migracao. O estado operacional atual deve ser confirmado pelos gates npm do Electron e pelos relatorios gerados em `artifacts/`.

Regra de fonte atual: `apps/desktop-electron/default-assets/templates/exemplo-gba/exemplo-gba.gba-project` e o projeto P0 canonico para Editor, Preview, Play Window e ROM. A fixture `fixtures/electron-p0-playtest.gba-project` permanece reduzida e tecnica, servindo apenas para contratos e diagnostico.

## Referencias externas

- **GB Studio** (`https://github.com/chrismaltby/gb-studio`) e referencia de produto/editor: onboarding, organizacao de projeto, fluxo de assets, eventos visuais, exportacao e governanca comunitaria.
- **Butano** (`https://github.com/gvaliente/butano`) e referencia tecnica para runtime GBA: limites reais do hardware, exemplos, disciplina de build/export e maturidade de engine.
- Essas referencias sao benchmarks de comparacao, nao fontes editaveis desta migracao. O contrato canonico continua sendo o `.gba-project`, o `GBAStudioEnginePack` e os smokes que geram ROM real de Game Boy Advance.
- Para declarar a migracao macOS concluida, a UI Electron precisa abrir/salvar projetos e tambem gerar uma `.gba` verificavel em mGBA. Paridade visual sem ROM real nao fecha a meta do GBA Studio.

## Resumo

| Area | Status | Evidencia atual | Proximo gate |
| --- | --- | --- | --- |
| Branch de migracao | Feito | `git status --short --branch` mostra `codex/electron-migration`. | Manter o foco em Electron-only apos o descomissionamento Swift. |
| App Electron + React + TypeScript | Feito | `apps/desktop-electron/package.json`, `src/main`, `src/preload`, `src/renderer` e scripts `build`, `package`, `dist:*`. | Manter `npm run gate:electron` como gate de readiness. |
| App canonico | Feito | A trilha Electron vive em `apps/desktop-electron/` e `packages/project-contract/`; o app Swift/macOS legado foi removido. | Antes de merge/commit, validar que o diff segue Electron-only. |
| Abrir/salvar `.gba-project` | Feito | `npm run smoke:exemplo-template` cobre abrir o template completo, editar, salvar por IPC, reabrir o arquivo salvo e exportar uma ROM mixed. `npm run smoke:package` repete o mesmo fluxo no `.app` macOS empacotado. | Testar arquivos reais maiores antes de ampliar o suporte a projetos autorais. |
| Projeto inicial completo | Feito | `npm run smoke:visual:responsive` valida a welcome screen sem abrir projeto legado; `npm run smoke:exemplo-template` cria, edita, salva, reabre e exporta exclusivamente o `exemplo-gba.gba-project`. | Validar manualmente novas versões do template completo antes de promover mudanças. |
| Contrato/schemas compartilhados | Feito inicial | `packages/project-contract/README.md`, fixture `topdown-demo.gba-project` mantida somente como contrato de migração, template completo `exemplo-gba.gba-project`, testes por workspace e `npm run smoke:projects` sem geração de projeto vazio. | Evoluir contrato para cobrir projetos reais adicionais e qualquer schema novo. |
| GBAStudioEnginePack | Feito | `GBA_STUDIO_ENGINE_ROM_SMOKE_DIR=artifacts/engine-rom/latest npm run smoke:engine-rom -- --open-mgba` passou contra `/Users/example/Developer/GBAStudioEngine/dist/GBAStudioEnginePack`, gerou `electron_topdown_demo.gba`, registrou SHA-256 e abriu a ROM no mGBA em modo `manual-open`. O launcher tambem cobre staging temporario para paths com espacos antes de chamar `gbsbuild`; o playtest visual/manual mGBA foi aprovado em `artifacts/macos-pilot-readiness/latest/manual_approvals.json`. | Manter o smoke de ROM no gate macOS para evitar regressao antes da aprovacao final. |
| Workspaces Editor, Eventos, Sprites, Dialogos, Audio, Arquivos, Ajustes | Funcional para P0 | `npm run gate:electron` e `npm run audit:functional-parity -- --strict` provam o fluxo base com projeto real: room, tilemap, colisao, ator, trigger, evento, dialogo, sprite, audio, assets, settings, export e Play da ROM. O smoke visual continua navegando todos os workspaces esperados. | Estressar projetos maiores, assets autorais e limites de hardware; depois retomar polish fino de UX. |
| Equivalencia UI/UX | Parcial | `apps/desktop-electron/docs/visual-parity-reference.md`, `apps/desktop-electron/docs/visual-reference-sources.json` e capturas em `artifacts/visual-responsive/latest/` mostram a welcome e todos os workspaces no template completo; `npm run review:visual` gera `artifacts/visual-review/latest/index.html`, `visual_review_checklist.md` e `visual_review_manifest.json` agrupando capturas por area. O design system do Electron e a fonte primaria para tipografia, densidade, controles e hierarquia; as referencias Swift nao devem sobrescrever esse contrato. | Revisao visual humana: abrir o painel HTML, avaliar densidade, hierarquia, controles esperados e polish contra o design system Electron. |
| Empacotamento macOS | Parcial | `npm run smoke:package` gera `release/mac-arm64/GBA Studio.app`, valida bundle, abre o app, salva/reabre o template completo e exporta o projeto Engine Pack com `gbastudio_project.json`, `main.cpp`, `gbastudio_project_data.hpp`, `README.md` e assets copiados; a evidencia fica em `artifacts/macos-app/latest/bundle_evidence.json`. O job `package-local` tambem roda `npm run smoke:ci-artifacts -- --platform macos` apos `npm run dist:mac` para provar DMG/ZIP antes do upload. `npm run audit:macos-signing` valida `build/entitlements.mac.plist`, `build/entitlements.mac.inherit.plist` e hardened runtime para assinatura futura. | Executar Developer ID/notarization real para eliminar o aviso de assinatura. |
| Auditoria do piloto macOS | Funcional, release pendente | `npm run audit:macos-pilot` le as evidencias de bundle, projetos, visual, ROM e aprovacoes manuais e gera `artifacts/macos-pilot-readiness/latest/macos_pilot_readiness.md`. A auditoria funcional mais recente esta verde, entao o bloqueio agora saiu de produto P0 e foi para distribuicao publica. | Fechar pacote assinado/notarizado, DMG/ZIP final e smoke no `.app` final. |
| Empacotamento Windows/Linux | Adiado por decisao de roadmap | `npm run audit:cross-platform` valida scripts `dist:mac`/`dist:win`/`dist:linux`, alvos `dmg`/`zip`, `nsis`/`zip`, `AppImage`/`deb`/`tar.gz`, icones do app e do documento, associacoes `.gbastudio`/`.gba-project`, o job `electron-desktop` em `.github/workflows/ci.yml` com matriz `macos-14`, `windows-latest` e `ubuntu-24.04`, e o gate `npm run smoke:ci-artifacts -- --platform ${{ matrix.os }}` antes do upload. | Retomar somente na finalizacao, depois do macOS Electron estar pronto. |
| Decisao sobre Swift | Feito | `npm run audit:functional-parity -- --strict` passou sem bloqueios e o app Swift/macOS foi descomissionado. | Manter os gates Electron como fonte de verdade. |

## Gates atuais

Comandos verdes nesta trilha:

- `npm run gate:electron` e o gate principal de readiness atual do app Electron; ele inclui o smoke do template completo e `npm run audit:real-project -- --strict` antes das auditorias finais.
- `npm run gate:macos-pilot` agrega os gates locais macOS abaixo, inclui a ROM do template completo + auditoria strict de projeto, roda `npm run audit:cross-platform -- --strict`, roda `npm run audit:macos-pilot`, valida `git diff --check` na raiz do repositorio e termina com `npm run audit:macos-pilot -- --strict`.
- `npm run typecheck`
- `npm test`
- `npm run smoke:welcome`
- `npm run smoke:exemplo-template`
- `npm run smoke:package`
- `npm run smoke:visual`
- `npm run review:visual`
- `npm run smoke:projects`
- `npm run smoke:engine-rom`
- `npm run audit:real-project -- --strict`
- `npm run audit:cross-platform`
- `npm run audit:macos-signing`
- `npm run audit:functional-parity` gera a matriz operacional de bloqueios funcionais; o modo `--strict` deve permanecer verde. Qualquer falha agora e regressao critica.
- `npm run audit:functional-parity` tambem consome `artifacts/project-io-p0/latest/project_io_p0_evidence.json` para marcar `Shell e arquivos de projeto` como funcional quando o `.app` macOS provar abrir, salvar, reabrir e rejeitar manifesto Swift split.
- `npm run smoke:ci-artifacts -- --platform <macos|windows|linux>` valida os formatos gerados no diretório `release/` antes de upload no CI; no macOS local, esse gate exige `.dmg` e `.zip`.
- `GBA_STUDIO_ENGINE_ROM_SMOKE_DIR=artifacts/engine-rom/latest npm run smoke:engine-rom -- --open-mgba`
- `npm run audit:macos-pilot`
- `npm run audit:macos-pilot -- --strict`
- `git diff --check`

Quando o gate integrado passa, a higiene do diff ja foi validada junto com pacote, workspaces, projetos reais, ROM e auditoria macOS tecnica. Se os gates P0 de `functional-parity-audit.md` voltarem a bloquear, isso deve ser tratado como regressao critica do app Electron canonico.

O CI tambem define o gate cross-platform `electron-desktop` em `.github/workflows/ci.yml`, cobrindo macOS, Windows e Linux. `npm run audit:cross-platform` valida localmente que os scripts, alvos, icones, associacoes de arquivo e matriz CI estao declarados. Por decisao de roadmap, a evidencia real de Windows/Linux fica para a finalizacao, depois do app Electron macOS estar pronto.

O smoke visual oficial usa sempre o template completo e gera:

- `artifacts/visual-responsive/latest/00-welcome-half.png`, `00-welcome-compact.png` e `00-welcome-full.png`
- `artifacts/visual-responsive/latest/editor-half.png`, `editor-compact.png` e `editor-full.png`
- `artifacts/visual-responsive/latest/cores-*.png`, `dialogos-*.png`, `sprites-*.png`, `audio-*.png`, `arquivos-*.png` e `ajustes-*.png`
- `artifacts/visual-responsive/latest/manifest.json`

As interações profundas do Editor, incluindo colisão, gatilho, save/reopen e export, ficam em `artifacts/exemplo-template/latest/` pelo `npm run smoke:exemplo-template`.

Esses arquivos sao artefatos locais ignorados pelo Git. Regerar com `npm run smoke:visual` antes de uma revisao visual.

O painel de revisao visual gera:

- `artifacts/visual-review/latest/index.html`
- `artifacts/visual-review/latest/visual_review_checklist.md`
- `artifacts/visual-review/latest/visual_review_manifest.json`

O smoke de ROM gera evidencia local em:

- `artifacts/engine-rom/latest/engine_rom_smoke_evidence.json`
- `artifacts/engine-rom/latest/mgba_smoke_report.md`
- `artifacts/engine-rom/latest/manual_mgba_playtest.md`
- `artifacts/engine-rom/latest/export/exported-fixture/build/electron_topdown_demo.gba`

O smoke de pacote macOS gera evidencia local em:

- `artifacts/macos-app/latest/bundle_evidence.json`

O auditor do piloto macOS gera o resumo consolidado em:

- `artifacts/macos-pilot-readiness/latest/macos_pilot_readiness.json`
- `artifacts/macos-pilot-readiness/latest/macos_pilot_readiness.md`
- `artifacts/macos-pilot-readiness/latest/manual_approvals.template.json`

Quando uma revisao humana aprovar um bloqueio, copie o template para `artifacts/macos-pilot-readiness/latest/manual_approvals.json` e altere apenas os campos realmente aprovados para `true`. A auditoria tambem aceita `GBA_STUDIO_MACOS_PILOT_APPROVALS_PATH=/caminho/manual_approvals.json` para guardar a aprovacao fora da pasta `latest`. Campos ausentes ou falsos continuam bloqueando a conclusao.

O smoke de projetos reais gera evidencia local em:

- `artifacts/project-validation/latest/project_validation_evidence.json`

O smoke de ROM do template completo gera evidencia local em:

- `artifacts/engine-rom/latest/engine_rom_smoke_evidence.json`
- `artifacts/engine-rom/latest/mgba_smoke_report.md`
- `artifacts/engine-rom/latest/manual_mgba_playtest.md`

O auditor de readiness do projeto completo gera evidencia local em:

- `artifacts/real-project-readiness/latest/real_project_readiness.json`
- `artifacts/real-project-readiness/latest/real_project_readiness.md`

O smoke Project I/O P0 gera evidencia local em:

- `artifacts/project-io-p0/latest/project_io_p0_evidence.json`

O auditor de configuracao cross-platform gera evidencia local em:

- `artifacts/cross-platform-package/latest/cross_platform_package_config.json`
- `artifacts/cross-platform-package/latest/cross_platform_package_config.md`

O auditor de preparacao de assinatura macOS gera evidencia local em:

- `artifacts/macos-signing/latest/macos_signing_readiness.json`
- `artifacts/macos-signing/latest/macos_signing_readiness.md`

## Riscos abertos

- **Codesign/notarization macOS:** entitlements e hardened runtime ja estao configurados para o Electron, mas o pacote local ainda nao usa identidade Developer ID nem passa por notarizacao real.
- **Release macOS final:** falta gerar e validar o pacote final assinado/notarizado com smoke no `.app` final.
- **Windows/Linux adiados:** a configuracao local de pacote e CI ja e auditada por `npm run audit:cross-platform`, mas a validacao real em `windows-latest` e `ubuntu-24.04` fica para a finalizacao depois do macOS.
- **Stress de projeto real:** o P0 esta verde, mas projetos maiores ainda precisam validar limites de assets, audio, VRAM/OAM, ROM observavel e sessoes longas.
- **Paridade fina de UX:** depois do macOS funcional continuar verde, a decisao final ainda exige polish humano do fluxo Electron atual.
- **Swift removido:** manter o app legado fora do caminho operacional e evitar reintroduzir dependencias em `Sources/`, `Tests/` ou `Package.swift`.

## Proximo passo recomendado

1. Manter `npm run gate:electron`, `npm run smoke:engine-rom`, `npm run audit:real-project -- --strict` e `npm run audit:functional-parity -- --strict` verdes em qualquer mudanca.
2. Fechar release macOS: assinatura Developer ID, notarizacao, DMG/ZIP final e smoke no pacote final.
3. Rodar playtest visual/manual da ROM real-base e stress de projeto autoral maior.
4. Retomar polish fino de UX do Electron com base no design system atual, nao no Swift legado.
5. Trabalhar backlog P1/P2 que ainda agrega valor de produto: assets maiores, audio audivel, limites de hardware, comandos avancados e split project.
6. Validar Windows/Linux somente na etapa de finalizacao cross-platform, depois do macOS Electron estar pronto.
