import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { z } from "zod";

import {
  createMcpProjectService,
  type McpProjectServiceResult
} from "./mcpProjectService.js";
import type { McpServerConfiguration } from "./mcpServerArguments.js";

function toolResult<T>(result: McpProjectServiceResult<T>) {
  const content = [{ type: "text" as const, text: JSON.stringify(result) }];
  return result.ok ? { content } : { content, isError: true };
}

const readOnlyToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false
} as const;

export async function createGbaStudioMcpServer(options: McpServerConfiguration): Promise<McpServer> {
  const service = await createMcpProjectService(options);
  const server = new McpServer({ name: "gba-studio", version: "0.1.0" });

  server.registerTool("gbs_project_summary", {
    title: "Resumo do projeto GBA Studio",
    description: "Retorna o resumo somente leitura do projeto configurado.",
    annotations: readOnlyToolAnnotations
  }, async () => toolResult(await service.projectSummary()));

  server.registerTool("gbs_project_diagnostics", {
    title: "Diagnóstico do contrato do projeto",
    description: "Retorna os diagnósticos do contrato compartilhado do projeto configurado.",
    annotations: readOnlyToolAnnotations
  }, async () => toolResult(await service.projectDiagnostics()));

  server.registerTool("gbs_list_assets", {
    title: "Lista de assets do projeto",
    description: "Lista IDs, nomes, tipos e origens relativas dos assets do projeto configurado.",
    annotations: readOnlyToolAnnotations
  }, async () => toolResult(await service.listAssets()));

  server.registerTool("gbs_inspect_asset", {
    title: "Inspeção de asset do projeto",
    description: "Inspeciona metadados e estimativa de VRAM de um asset pertencente ao projeto configurado.",
    inputSchema: z.object({ assetId: z.string().min(1) }),
    annotations: readOnlyToolAnnotations
  }, async ({ assetId }) => toolResult(await service.inspectAsset(assetId)));

  server.registerTool("gbs_project_budget", {
    title: "Orçamento de hardware do projeto",
    description: "Executa a análise temporária de orçamento com o Engine Pack configurado na inicialização.",
    annotations: readOnlyToolAnnotations
  }, async () => toolResult(await service.projectBudget()));

  return server;
}

export async function runMcpServer(options: McpServerConfiguration): Promise<void> {
  const server = await createGbaStudioMcpServer(options);
  const transport = new StdioServerTransport();
  transport.onerror = (error) => process.stderr.write(`Erro no transporte MCP: ${error.message}\n`);
  process.stdin.once("end", () => {
    void transport.close();
  });
  transport.onclose = () => {
    process.exit(0);
  };
  await server.connect(transport);
}
