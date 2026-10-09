import { parseMcpServerArguments } from "./mcpServerArguments.js";
import { runMcpServer } from "./mcpServer.js";

void runMcpServer(parseMcpServerArguments(process.argv.slice(2))).catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Não foi possível iniciar o servidor MCP: ${message}\n`);
  process.exitCode = 1;
});
