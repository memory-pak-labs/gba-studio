# Fronteira do motor no monorepo

O editor Electron e a GBAStudioEngine compartilham este repositório, com
responsabilidades separadas. `packages/GBAStudioEngine` é a fonte do motor e
possui versão, schemas, testes, templates e Engine Pack próprios.

O aplicativo consome os contratos públicos do Pack: `enginepack.json`, schemas,
`gbsdoctor`, `gbsbuild`, `assetc`, headers e bibliotecas. O desenvolvimento usa
as APIs da GBAStudioEngine; referências a Butano não transformam o editor em
um frontend direto de Butano.

A base pública começa com uma cópia selecionada do código da beta.3. O histórico
experimental privado não é importado nem serve como dependência de build.
A versão do motor não precisa acompanhar a versão do editor.

Alterações no motor exigem os testes específicos e `make verify-package`;
alterações transversais exigem `npm run gate:complete-project` no pacote Electron.
A CI básica verifica editor e testes host; hardware e QA renderizada permanecem
verificações separadas.
