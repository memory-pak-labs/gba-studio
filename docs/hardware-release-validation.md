# Validação de versão no GBA físico

Editor, Play, testes host e mGBA são evidências distintas. A automação gera ROMs
ARM, verifica inputs, áudio e save no emulador; o resultado físico permanece
pendente até preencher este roteiro no aparelho.

Para uma candidata cujo aceite foi definido no mGBA, registre explicitamente
esse escopo no relatório da versão. Execute o diagnóstico abaixo, as regressões
de tiles/estados/visibilidade/replay e o gate completo do editor com a mesma
revisão do Pack. Registre versão/hash do core, ROMs, controles, áudio e save após
reiniciar o emulador. Nesse aceite, o roteiro físico é uma verificação adicional,
não uma condição pendente de aprovação da candidata. `physicalTested: false`
continua descrevendo corretamente a evidência.

## Gerar a ROM de diagnóstico

A partir de `apps/desktop-electron`, com o Engine Pack compilado:

```sh
node scripts/smoke-hardware-diagnostic.mjs ../../packages/GBAStudioEngine/dist/GBAStudioEnginePack /caminho/qa-hardware
```

A ROM está em `qa-hardware/project/build/hardware_diagnostic.gba`. O relatório
`verification.json` registra SHA-256, resultado emulado e `physicalTested: false`.
A arte é procedural, sem assets de terceiros. O diagnóstico usa SRAM e um slot
com assinatura própria. Outros dispositivos de save precisam de um diagnóstico
configurado e validado especificamente para o cartucho.

## Registro físico da versão

Copie esta tabela para o relatório de QA da versão, fora dos arquivos publicados.

| Campo | Registro |
| --- | --- |
| Commit e Engine Pack | pendente |
| SHA-256 da ROM de diagnóstico | pendente |
| SHA-256 da ROM completa candidata | pendente |
| Console e revisão | pendente |
| Cartucho, dispositivo de save e capacidade | pendente |
| Gravador, firmware e ferramenta | pendente |
| Backup do save original e hash | pendente |
| Leitura independente após gravar e hash | pendente |
| Data, responsável e evidências | pendente |

Identifique cartucho/gravador e faça backup do save antes da gravação. A ROM de
diagnóstico grava apenas ao pressionar START+A; use cartucho de teste ou preserve
seus dados antes. Compare uma leitura independente com o SHA-256 da ROM escolhida.

1. Ligue o console: confira texto legível, enquadramento 240 × 160 e alternância
   vermelho/verde/azul. Observe bordas, cores e estabilidade por dois minutos.
2. Pressione cada um dos dez botões: o acumulador deve terminar em `03FF`.
3. Pressione R: ouça os dois tons. Confira os dois canais na saída disponível.
4. Pressione START+A: a tela deve indicar `SAVE: READ VERIFIED`.
5. Desligue completamente, aguarde e ligue novamente: a indicação de save deve
   permanecer. Registre também um segundo ciclo completo.
6. Grave a ROM completa candidata, verifique novamente a leitura e execute Logo,
   cenas de plataforma/topdown, combate, Mercado Suspenso, lanterna/revelação,
   abertura/fechamento de passagem, save/load e retorno entre runtimes.
7. Observe duração dos carregamentos, áudio durante transições e desempenho em
   cenas carregadas. Compare com as referências emuladas da mesma ROM/hash.

Marque cada passo como PASS, FAIL ou NÃO EXECUTADO. Não converta resultados
emulados em aprovação física. Problemas de RTC, multiplayer, rumble, EEPROM ou
Flash exigem cartucho e roteiro próprios quando usados pela versão.
