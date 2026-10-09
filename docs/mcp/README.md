# MCP do GBA Studio

## Estado atual

O GBA Studio expõe um servidor MCP local por `stdio`. A versão atual é
somente leitura, não depende de provedor de modelo e atende um único projeto
`.gba-project` autorizado pelo usuário.

O processo não abre a janela do editor, não cria um servidor HTTP e não usa a
rede. O host MCP inicia o executável do GBA Studio e troca mensagens JSON-RPC
delimitadas por novas linhas pelo `stdin`/`stdout`.

## Ativar e iniciar

1. Abra o projeto no GBA Studio.
2. Vá para **Ajustes > Avançado > MCP local**.
3. Ative o MCP local, salve o projeto e use **Copiar para Codex** quando o
   cliente for o Codex. Para outros clientes que aceitam JSON, use **Copiar
   configuração**.
4. Cole o bloco TOML no `~/.codex/config.toml` ou registre o servidor pela
   interface MCP do Codex; depois reinicie o cliente.

Para diagnosticar a conexão diretamente pelo terminal, execute os comandos a
partir de `apps/desktop-electron`:

```bash
npm run build
npm run mcp -- --project /caminho/absoluto/projeto.gba-project
npm run mcp -- --project /caminho/absoluto/projeto.gba-project \
  --engine-pack /caminho/absoluto/GBAStudioEnginePack
```

O segundo comando é suficiente para resumo, diagnósticos e assets. O
`--engine-pack` é necessário para `gbs_project_budget`, que executa uma
análise temporária de orçamento do Engine Pack.

O projeto precisa conter `settings.mcp.enabled: true`. Sem essa autorização,
as ferramentas respondem `MCP_DISABLED` e não expõem dados do projeto.

O botão **Copiar para Codex** gera uma tabela `[mcp_servers.gba-studio]` com o
executável, os argumentos do projeto, o Engine Pack quando configurado, a
política de aprovação `prompt`, um `tool_timeout_sec` de 240 segundos para a
análise do Engine Pack e a lista explícita das cinco ferramentas v1.
O botão **Copiar configuração** continua gerando o registro JSON genérico para
clientes que não usam `config.toml`.

## Ferramentas MCP v1

O servidor expõe exatamente estas cinco ferramentas, nesta ordem:

| Ferramenta | Entrada | Finalidade |
| --- | --- | --- |
| `gbs_project_summary` | nenhuma | Resume o projeto autorizado e seu caminho. |
| `gbs_project_diagnostics` | nenhuma | Executa os diagnósticos do contrato compartilhado. |
| `gbs_list_assets` | nenhuma | Lista assets autorais com IDs, nomes, tipos e fontes relativas. |
| `gbs_inspect_asset` | `{ "assetId": "..." }` | Inspeciona dimensões, formato, tamanho e orçamento quando disponíveis. |
| `gbs_project_budget` | nenhuma | Analisa o orçamento do projeto usando o Engine Pack temporariamente. |

Os retornos das ferramentas são envelopes JSON com `ok`, dados ou um código
de erro. Os códigos relevantes incluem:

- `MCP_DISABLED`: autorização local ausente ou desativada;
- `PROJECT_OPEN_FAILED`: projeto não pôde ser aberto;
- `ASSET_NOT_FOUND`: ID de asset inexistente;
- `ASSET_SOURCE_MISSING`: fonte do asset não existe;
- `ASSET_OUTSIDE_PROJECT`: fonte absoluta, traversal ou symlink fora do projeto;
- `ENGINE_PACK_REQUIRED`: orçamento solicitado sem Engine Pack.

## Limites de segurança

O MCP v1 não grava `.gba-project`, não promove assets, não exporta ROM, não
executa comandos do host, não envia eventos ao editor e não acessa a rede.
Fontes de assets são resolvidas dentro da raiz do projeto; caminhos absolutos,
traversals e escapes por symlink são rejeitados. O orçamento usa somente
artefatos temporários e não altera o projeto.

Essa fronteira é intencional. Ações de escrita, exportação e automação do
editor exigem um contrato separado, confirmação explícita e testes próprios.

## Verificação independente

O smoke não depende de Codex, Claude ou outro cliente específico. Ele inicia o
processo real do Electron em `stdio`, negocia `initialize`, lista as cinco
ferramentas, consulta resumo, diagnósticos, assets, inspeção e orçamento em um
projeto autorizado e confirma `MCP_DISABLED` para as cinco ferramentas em um
projeto desativado:

```bash
npm run smoke:mcp
```

Esse comando também executa o build antes do smoke. Ele prova o transporte e
o contrato do servidor; não substitui a validação manual de um cliente MCP
específico. A matriz de compatibilidade mantém essa distinção em
[`COMPATIBILITY.md`](./COMPATIBILITY.md).
