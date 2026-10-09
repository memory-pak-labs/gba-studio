# Compatibilidade MCP

Esta matriz diferencia a compatibilidade do protocolo, comprovada pelo smoke
local, da conexão efetiva em um cliente específico.

| Cliente | Transporte | Estado | Evidência |
| --- | --- | --- | --- |
| Codex | `stdio` local | Primeiro cliente-alvo; validação do cliente real pendente nesta matriz | Smoke reproduzível do protocolo e servidor local; a conexão no cliente deve ser registrada separadamente. |
| Outros clientes MCP | `stdio` local | Não verificados | Nenhum smoke específico de cliente foi executado. |

## Registros gerados pelo aplicativo

O painel **Ajustes > Avançado > MCP local** oferece dois formatos, sem alterar
o contrato do servidor:

- **JSON genérico:** registro `mcpServers` para clientes que aceitam esse
  formato;
- **Codex:** tabela `[mcp_servers.gba-studio]` para `config.toml`, com lista
  explícita das cinco ferramentas, `default_tools_approval_mode = "prompt"` e
  `tool_timeout_sec = 240` para a análise completa do projeto.

Os testes cobrem as duas formas e os dois modos de execução:

- desenvolvimento: executável Electron, seguido pelo caminho do aplicativo e
  `--mcp --project <projeto>`;
- aplicativo empacotado: executável instalado, seguido por
  `--mcp --project <projeto>` e, quando configurado, `--engine-pack <caminho>`.

Nenhum registro contém modelo, provedor, chave de API ou identificador de
conversa. Isso é evidência do contrato de registro e do transporte local, não
uma certificação de que um cliente instalou ou exibiu a conexão.

## O que o smoke comprova

`npm run smoke:mcp` executa o Electron real em modo MCP e verifica:

- negociação JSON-RPC por `stdio`;
- descoberta determinística das cinco ferramentas v1;
- leitura de resumo, diagnósticos, assets, inspeção do primeiro asset e
  orçamento com `settings.mcp.enabled: true`;
- resposta `MCP_DISABLED` para as cinco ferramentas quando a autorização está
  desligada;
- encerramento limpo do processo e ausência de exceção não tratada em `stderr`.

Isso não comprova que um cliente específico instalou a configuração, iniciou
o executável ou renderizou os resultados na sua própria UI. Para certificar um
cliente, registre versão, sistema operacional, configuração gerada pelo app,
comando de conexão e resultado observado sem incluir tokens, chaves ou dados
sensíveis.
