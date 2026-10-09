# Engine propria como backend primario

Este documento registra a parte do `GBAStudioEngine` no milestone privado
`Engine propria como backend primario`.

## Decisao de produto

- O app `GBA Studio` permanece privado enquanto o backend principal ainda nao
  for a engine propria.
- Os repositorios `GBA-Studio` e `GBAStudioEngine` so devem ser publicados
  publicamente quando a engine propria for o caminho principal maduro, com
  evidencia de readiness arquivada.
- O workflow `engine-ci.yml` e privado por politica de maturacao: ele falha se
  `github.event.repository.private` nao for `true`, evitando gerar evidencia de
  promocao em repositorio publico antes do gate final.
- Butano continua sendo referencia de paridade e fallback manual de transicao,
  nao dependencia operacional do runtime final.
- A promocao para backend principal depende de evidencia arquivada e validavel,
  nao apenas de build local.
- O app deve tratar `gbsdoctor --require-primary-ready --json` como fonte de
  verdade para liberar promocao; smoke local, stress local e checklist mGBA
  continuam necessarios, mas nao substituem esse gate.

## Gate da engine

O milestone so deve ser considerado pronto quando:

- O projeto completo do GBA Studio passar autoria, save/reopen, export mixed,
  build de uma unica ROM e Play Window usando a engine propria. Essa e a
  evidencia principal de integracao.
- `gbsdoctor --require-primary-ready --json` passar com readiness evidence real.
- `production_smoke --json` e stress projects cobrirem os templates/generos
  expostos pelo app como diagnostico subsidiario do gate completo.
- O promotion bundle for gerado, validado com
  `gbsdoctor --validate-promotion-bundle ... --require-primary-ready --json` e
  arquivado.
- mGBA/hardware/CI cobrirem boot, input, camera, colisao, audio e
  saves/checkpoints quando aplicavel.
- Os templates finais linkarem somente contra `lib/libgbastudio_engine.a`, sem
  dependência de Butano ou `libgba`.

## Evidencia atual

Em 2026-06-26, `dist/GBAStudioEnginePack/tools/gbsdoctor --engine-pack
dist/GBAStudioEnginePack --skip-toolchain --readiness-only --json` retornou
`ok: true`, `stage: beta_candidate` e `ready_for_primary_backend: false`.
Isso confirma que o pacote automatizado da engine esta maduro o bastante para a
fase privada, mas ainda nao pode virar backend principal publico/definitivo sem
as evidencias externas.

Evidencia parcial privada arquivada:

- `readiness_evidence_engine_primary_mgba.json` valida no schema publico
  `readiness_evidence`.
- `manual_mgba_stress_smoke` esta `ok: true` com ambiente `mGBA 0.10.5`.
- `build/cross-platform-readiness-evidence.json` valida no schema publico e
  registra `hardware_or_ci_validation` como `local_cross_platform_dry_run` para
  macOS. Essa evidencia e apenas ensaio local; ela nao promove a engine para
  `primary_ready`.
- O app gerou `dist/readiness_evidence_engine_primary_rollout.json` depois de
  passar os smokes privados de fixture, projeto real, export por todos os
  generos, comparativo com rollback legado e export Web usando
  `GBAStudioEngine`.
- A evidencia combinada local
  `build/engine-primary-local-dryrun-merged/readiness_evidence_engine_primary_local_dryrun_merged.json`
  valida no schema publico e deixa `manual_mgba_stress_smoke`,
  `hardware_or_ci_validation` e `gba_studio_engine_primary_rollout` com
  evidencia arquivada; `gba_studio_engine_primary_rollout` como `ok: true`
  confirma o rollout privado do app.
- `gbsdoctor --require-primary-ready --readiness-evidence
  build/engine-primary-local-dryrun-merged/readiness_evidence_engine_primary_local_dryrun_merged.json --json`
  continua retornando codigo 3, como esperado, porque `hardware_or_ci_validation`
  ainda precisa de `hardware_real` ou `cross_platform_ci` completo.
- Evidencias locais antigas em `build/ci-local-merge` sao tratadas como
  simulacao e nao podem promover `primary_ready`, mesmo quando declaram
  `validated_platforms` com macOS, Windows e Linux. O `gbsdoctor` agora rejeita
  `cross_platform_ci` com proveniencia `ci-local`, `local simulation`,
  `dry-run local` ou o texto generico antigo `multiple cross-platform CI inputs`.
- O merge aceito para promocao deve vir do workflow privado `engine-ci.yml`,
  usando os artefatos reais de GitHub Actions e a origem
  `GitHub Actions cross-platform CI inputs`, ou de uma evidencia
  `hardware_real` equivalente.

Bloqueio restante:

- `hardware_or_ci_validation`.
- Publicacao publica dos repositorios ou releases permanece bloqueada ate esse
  gate ficar verde com evidencia real, mantendo a engine propria como caminho
  principal maduro.

## Fronteira com Butano

Butano pode continuar aparecendo nos documentos e ferramentas como:

- matriz historica de paridade;
- comparativo de tamanho/performance;
- fallback manual durante a transicao privada;
- fonte de terminologia enquanto o contrato publico da engine amadurece.

Butano nao pode ser requisito para:

- build do projeto exportado pelo caminho principal;
- runtime da ROM final;
- validacao de promotion bundle;
- readiness primario do Engine Pack.

## Acompanhamento no monorepo

- Fonte canônica: https://github.com/matmel0/GBA-Studio/tree/main/packages/GBAStudioEngine
- Readiness primário e auditoria de paridade: https://github.com/matmel0/GBA-Studio/issues/3
- Histórico arquivado: https://github.com/matmel0/GBAStudioEngine
