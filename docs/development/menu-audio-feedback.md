# Áudio de interação dos menus

O menu inicial de O Último Farol usa cinco efeitos PCM originais, aprovados
em 25/10/2026, e permanece sem trilha contínua. Os WAVs e seus hashes estão em
`apps/desktop-electron/fixtures/asset-provenance/initial-menu-audio-approved.json`.
Os arquivos aprovados são copiados sem regeneração ou normalização de volume.

A fonte reproduzível dos cinco WAVs é
`apps/desktop-electron/scripts/create-initial-menu-audio-candidates.mjs`.
Para gerar uma cópia de revisão, execute no aplicativo:

```sh
node scripts/create-initial-menu-audio-candidates.mjs /novo/diretorio/externo
```

O diretório deve ser novo, com o pai existente, e ficar fora de todo o checkout,
inclusive por links simbólicos. O script recusa sobrescritas. Os WAVs V1 são
idênticos aos aprovados, mas o novo manifesto continua candidato: gerar sons não
concede aprovação nem modifica os assets do template.

As configurações de menu e suas telas embutidas aceitam `actionSounds` com
`navigate`, `confirm`, `back` e `unavailable`. Os valores identificam itens de
áudio do projeto. A entrada no carrossel usa o evento `titulo_abrir_menu` para
tocar o quinto efeito, de abertura. O efeito genérico de confirmação substitui
o som antigo do evento de novo jogo, evitando reprodução dupla.

O exportador resolve os nomes em `audio_feedback`, com índices de PSG ou PCM,
volume nativo de 0 a 15 e prioridade. O pack precisa da capability
`menu_audio_feedback`. Referências sem efeito compilado bloqueiam a exportação.
`assetc` rejeita índices negativos, destinos ambíguos e valores fora do contrato.
O runtime também valida os índices antes de reproduzir.

O som de navegação toca apenas quando a seleção ou o valor muda. A confirmação
de uma opção bloqueada toca `unavailable` e mantém a tela atual. Voltar toca seu
efeito quando existe um retorno. Os menus sem `actionSounds` continuam sem
feedback adicional. Os sons PCM seguem o controle de volume e mudo de efeitos.

Execute npm em `apps/desktop-electron`, usando Node 22:

```sh
npx vitest run src/main/menuAudioFeedback.test.ts scripts/initial-menu-audio.test.mjs
npm run gate:audio-acoustic
npm run gate:complete-project
node scripts/build-racing-playtest.mjs /caminho/exportacao titulo
node scripts/smoke-initial-menu-audio.mjs /caminho/exportacao/build/exemplo.gba /caminho/exportacao /caminho/evidencias --video
```

No diretório do motor, os testes `menu_audio_feedback_tests` e
`assetc_menu_audio_feedback_tests.py` verificam limites e codificação.
ROM, Play e hardware físico são camadas de evidência separadas.
