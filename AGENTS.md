# Instruções para agentes

O repositório de referência para o desenvolvimento é
https://github.com/memory-pak-labs/gba-studio. Leia [CONTRIBUTING.md](CONTRIBUTING.md)
e [docs/development.md](docs/development.md) antes de trabalhar.

- Responda em português do Brasil e preserve os identificadores do código em inglês.
- O agente principal conduz o trabalho; não use subagentes nem delegue tarefas.
- Antes de editar, examine os arquivos relacionados e execute `git status --short`.
  Preserve alterações existentes, projetos do usuário e arquivos fora do escopo.
- `develop` é a base de integração. Funcionalidades e correções usam uma branch
  de tarefa a partir dela, com prefixo `codex/` para o Codex. Não desenvolva em
  `main` ou `master`; não troque de branch com alterações locais sem informar o usuário.
- Use Conventional Commits e faça stage seletivo da tarefa validada. Checkpoints
  locais podem ser enviados a `develop` quando estáveis, revisados e autorizados
  pelo mantenedor. Não faça force push, reset destrutivo ou limpeza ampla.
- Não crie PR, faça merge, publique releases ou faça deploy sem autorização
  explícita. Commit e push não autorizam essas ações.
- Não inclua credenciais, certificados, arquivos `.env`, contexto privado de agentes,
  caches, dependências instaladas, artefatos de QA ou candidatos não aprovados.
- Assets exigem origem, licença e aprovação explícita antes de promoção.
  Preparação técnica não substitui aprovação visual.
- O backend é GBAStudioEngine. Preserve a fronteira do motor e os contratos
  compartilhados; não trate o projeto como um frontend direto do Butano.
- Bugs de runtime, persistência e exportação precisam de regressão significativa.
  Use TDD para mudanças de alto risco e verificações proporcionais para documentação.
- Execute npm em `apps/desktop-electron`. Não existe lint dedicado. Para uma
  milestone de produto, siga os testes, tipos, build e gates do guia de desenvolvimento.
  Testes host, build, Editor, Play, ROM, instalador, CI e GBA físico provam camadas distintas.
- Mudanças de UI exigem verificar a tela e o fluxo renderizado. Nunca afirme que
  uma verificação passou sem executá-la.
- Quando houver `graphify-out/graph.json`, use `graphify query`, `path` ou `explain`
  antes de buscas amplas sobre o código e `graphify update .` após alterar código.
- Contexto local, quando presente: leia `.agent/brain/PROJECT.md`,
  `.agent/brain/STATE.md` e `.agent/rules/PROTECTED.md`. Skills locais em `.agents/skills`
  e `.codex/skills` complementam estas regras; permanecem fora da publicação.
- Informe arquivos alterados, verificações executadas, resultados e limites restantes.
  Mantenha o histórico privado em seu checkout de arquivo; não o mescle na base pública.
