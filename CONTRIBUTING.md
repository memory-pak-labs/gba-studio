# Contribuir com GBA Studio

Obrigado pelo interesse. O projeto está em beta; prefira alterações pequenas
que possam ser revisadas e reproduzidas.

1. Consulte as Issues antes de começar. Discuta mudanças de arquitetura,
   formato de projeto, exportação, runtime ou toolchain em uma Issue.
2. Faça um fork e crie uma branch de trabalho a partir de `develop`.
3. Implemente uma alteração por Pull Request. Preserve os projetos e assets
   que estiverem fora do escopo. Faça commits pequenos das etapas validadas
   durante o desenvolvimento, sem esperar a próxima release.
4. Execute as verificações descritas em [Desenvolvimento](docs/development.md)
   e informe exatamente o que passou, falhou ou não foi executado.
5. Abra um PR para `develop`. A revisão e o merge cabem aos mantenedores.

Para código do editor, execute os testes focados ou `npm test` durante a
iteração. Para fechar a contribuição, execute `npm run test:all` e
`npm run build` em `apps/desktop-electron`. A suíte completa inclui promoção
e aceitação; o build já executa o typecheck, que também pode ser executado
isoladamente com `npm run typecheck`. Para o motor, execute os testes
host e os testes específicos do runtime alterado. Alterações que atravessam
editor, exportação e motor exigem a validação completa descrita no guia. Consulte
a matriz do guia para documentação, commits locais e aprovação global.
Não existe comando dedicado de lint neste pacote.

Bugs de runtime, persistência, contratos ou exportação precisam de um teste
de regressão significativo. Mudanças de UI também precisam de verificação do
fluxo renderizado: testes e build não provam a experiência na tela.

Use Conventional Commits (`fix(events): ...`, `feat(engine): ...`). Não envie
caches, dependências instaladas, artefatos de build, certificados, credenciais,
ROMs comerciais ou assets sem permissão de redistribuição.

Código contribuído fica sob MIT. Ao enviar um asset, declare sua origem,
autoria e licença; a licença de código não aprova automaticamente a arte.
Declare o uso relevante de IA no PR e revise todo o conteúdo enviado.

Também se aplicam os [documentos de comunidade da Memory Pak Labs](https://github.com/memory-pak-labs/.github),
incluindo conduta, governança e responsabilidade pelo uso de IA. A abertura do
GBA Studio durante a beta antecipa o plano anterior de abrir apenas na 1.0;
a documentação específica deste repositório registra essa abertura antecipada.
