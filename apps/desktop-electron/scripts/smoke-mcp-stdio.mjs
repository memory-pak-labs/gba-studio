import { once } from "node:events";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

export const EXPECTED_MCP_V1_TOOLS = [
  "gbs_project_summary",
  "gbs_project_diagnostics",
  "gbs_list_assets",
  "gbs_inspect_asset",
  "gbs_project_budget"
];

export function createJsonRpcRequest(id, method, params) {
  return `${JSON.stringify({
    jsonrpc: "2.0",
    ...(id === undefined ? {} : { id }),
    method,
    ...(params === undefined ? {} : { params })
  })}\n`;
}

export function parseJsonLines(input) {
  const lines = input.split(/\r?\n/);
  const remainder = lines.pop() ?? "";
  const messages = lines.filter((line) => line.trim()).map((line) => JSON.parse(line));
  return { messages, remainder };
}

export function assertMcpToolNames(toolNames) {
  if (JSON.stringify(toolNames) !== JSON.stringify(EXPECTED_MCP_V1_TOOLS)) {
    throw new Error(`MCP v1 deve expor exatamente as cinco ferramentas esperadas; recebido: ${JSON.stringify(toolNames)}`);
  }
}

function assertSuccessfulPayload(payload, label) {
  if (!payload || payload.ok !== true) {
    throw new Error(`${label} MCP não retornou sucesso: ${JSON.stringify(payload)}`);
  }
}

export function assertMcpAuthorizedToolPayloads({ summary, diagnostics, assets, inspect, budget }) {
  assertSuccessfulPayload(summary, "Resumo");
  if (!summary.data?.projectPath) {
    throw new Error(`Resumo MCP não retornou o caminho do projeto: ${JSON.stringify(summary)}`);
  }

  assertSuccessfulPayload(diagnostics, "Diagnósticos");
  if (!diagnostics.data || typeof diagnostics.data !== "object") {
    throw new Error(`Diagnósticos MCP não retornaram dados: ${JSON.stringify(diagnostics)}`);
  }

  assertSuccessfulPayload(assets, "Lista de assets");
  const firstAssetID = assets.data?.[0]?.id;
  if (!firstAssetID) {
    throw new Error(`Lista de assets MCP não retornou um asset inspecionável: ${JSON.stringify(assets)}`);
  }

  assertSuccessfulPayload(inspect, "Inspeção de asset");
  if (inspect.data?.asset?.id !== firstAssetID) {
    throw new Error(`Inspeção MCP não corresponde ao primeiro asset listado: ${JSON.stringify(inspect)}`);
  }

  assertSuccessfulPayload(budget, "Orçamento");
  if (budget.data?.ok !== true) {
    throw new Error(`Orçamento MCP não concluiu a análise: ${JSON.stringify(budget)}`);
  }
}

function electronCommand(appDirectory) {
  if (process.platform === "win32") {
    return path.join(appDirectory, "node_modules/electron/dist/electron.exe");
  }
  if (process.platform === "darwin") {
    return path.join(appDirectory, "node_modules/electron/dist/Electron.app/Contents/MacOS/Electron");
  }
  return path.join(appDirectory, "node_modules/electron/dist/electron");
}

function projectWithMcpSetting(projectText, enabled) {
  const project = JSON.parse(projectText);
  project.settings = project.settings && typeof project.settings === "object" && !Array.isArray(project.settings)
    ? project.settings
    : {};
  project.settings.mcp = { enabled };
  return `${JSON.stringify(project, null, 2)}\n`;
}

export function createMessageReader(child) {
  let remainder = "";
  const pending = [];
  const waiters = [];

  function dispatch(message) {
    const waiter = waiters.shift();
    if (waiter) {
      waiter.resolve(message);
      return;
    }
    pending.push(message);
  }

  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    try {
      const parsed = parseJsonLines(remainder + chunk);
      remainder = parsed.remainder;
      parsed.messages.forEach(dispatch);
    } catch (error) {
      const waiter = waiters.shift();
      if (waiter) waiter.reject(error);
      else pending.push({ __parseError: error });
    }
  });

  return {
    nextMessage(timeoutMs = 10_000) {
      const message = pending.shift();
      if (message) {
        if (message.__parseError) return Promise.reject(message.__parseError);
        return Promise.resolve(message);
      }

      return new Promise((resolve, reject) => {
        const waiter = {
          resolve: (value) => {
            clearTimeout(timeout);
            resolve(value);
          },
          reject: (error) => {
            clearTimeout(timeout);
            reject(error);
          }
        };
        const timeout = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          reject(new Error(`Tempo esgotado aguardando resposta MCP após ${timeoutMs} ms.`));
        }, timeoutMs);
        waiters.push(waiter);
      });
    }
  };
}

async function createTemporaryProject(canonicalProjectPath, enabled) {
  const root = await mkdtemp(path.join(os.tmpdir(), "gba-mcp-stdio-"));
  const projectPath = path.join(root, enabled ? "authorized.gba-project" : "disabled.gba-project");
  const projectText = await readFile(canonicalProjectPath, "utf8");
  await writeFile(projectPath, projectWithMcpSetting(projectText, enabled), "utf8");
  await cp(path.join(path.dirname(canonicalProjectPath), "Assets"), path.join(root, "Assets"), { recursive: true });
  return { root, projectPath };
}

function toolPayload(response) {
  if (!response?.result?.content?.[0]?.text) {
    throw new Error(`Resposta MCP sem payload de ferramenta: ${JSON.stringify(response)}`);
  }
  return JSON.parse(response.result.content[0].text);
}

async function startMcpProcess({ appDirectory, projectPath, enginePackPath, userDataDir }) {
  const args = [
    `--user-data-dir=${userDataDir}`,
    ".",
    "--mcp",
    "--project",
    projectPath
  ];
  if (enginePackPath) args.push("--engine-pack", enginePackPath);
  const child = spawn(electronCommand(appDirectory), args, {
    cwd: appDirectory,
    env: { ...process.env, npm_config_loglevel: "silent" },
    stdio: ["pipe", "pipe", "pipe"]
  });
  const stderr = [];
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => stderr.push(chunk));
  return { child, reader: createMessageReader(child), stderr };
}

async function sendRequest(session, id, method, params, timeoutMs = 10_000) {
  session.child.stdin.write(createJsonRpcRequest(id, method, params));
  let response;
  try {
    response = await session.reader.nextMessage(timeoutMs);
  } catch (error) {
    throw new Error(`Tempo esgotado aguardando ${method} (id ${id}) após ${timeoutMs} ms: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (response.id !== id) {
    throw new Error(`Resposta MCP fora de ordem: esperado id ${id}, recebido ${response.id}.`);
  }
  if (response.error) {
    throw new Error(`Resposta MCP com erro para ${method}: ${JSON.stringify(response.error)}`);
  }
  return response;
}

function sendNotification(child, method, params) {
  child.stdin.write(createJsonRpcRequest(undefined, method, params));
}

async function stopMcpProcess(session) {
  session.child.stdin.end();
  const [code, signal] = await once(session.child, "close");
  return { code, signal, stderr: session.stderr.join("") };
}

function assertNoUnhandledStderr(stderr) {
  if (/UnhandledPromiseRejection|uncaught(?:Exception| error)|FATAL/i.test(stderr)) {
    throw new Error(`O processo MCP registrou uma exceção não tratada em stderr: ${stderr}`);
  }
}

async function runScenario({ appDirectory, canonicalProjectPath, enabled, enginePackPath }) {
  const temporary = await createTemporaryProject(canonicalProjectPath, enabled);
  let session;
  try {
    session = await startMcpProcess({
      appDirectory,
      enginePackPath,
      projectPath: temporary.projectPath,
      userDataDir: path.join(temporary.root, "user-data")
    });
    await sendRequest(session, 1, "initialize", {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "gba-studio-stdio-smoke", version: "1.0.0" }
    });
    sendNotification(session.child, "notifications/initialized");

    const toolsResponse = await sendRequest(session, 2, "tools/list", {});
    const toolNames = (toolsResponse.result?.tools ?? []).map((tool) => tool.name);
    assertMcpToolNames(toolNames);

    const summaryResponse = await sendRequest(session, 3, "tools/call", {
      name: "gbs_project_summary",
      arguments: {}
    });
    const summary = toolPayload(summaryResponse);

    const diagnosticsResponse = await sendRequest(session, 4, "tools/call", {
      name: "gbs_project_diagnostics",
      arguments: {}
    });
    const diagnostics = toolPayload(diagnosticsResponse);

    const assetsResponse = await sendRequest(session, 5, "tools/call", {
      name: "gbs_list_assets",
      arguments: {}
    });
    const assets = toolPayload(assetsResponse);

    const inspectResponse = await sendRequest(session, 6, "tools/call", {
      name: "gbs_inspect_asset",
      arguments: { assetId: enabled ? assets.data?.[0]?.id ?? "missing-asset" : "asset-dialogue-box-gba-v3" }
    });
    const inspect = toolPayload(inspectResponse);

    const budgetResponse = await sendRequest(session, 7, "tools/call", {
      name: "gbs_project_budget",
      arguments: {}
    }, 240_000);
    const budget = toolPayload(budgetResponse);

    if (enabled) {
      if (!summary.ok || summary.data?.projectPath !== temporary.projectPath) {
        throw new Error(`Resumo MCP não autorizou o projeto temporário esperado: ${JSON.stringify(summary)}`);
      }
      assertMcpAuthorizedToolPayloads({ summary, diagnostics, assets, inspect, budget });
    } else {
      for (const payload of [summary, diagnostics, assets, inspect, budget]) {
        if (payload.ok || payload.code !== "MCP_DISABLED") {
          throw new Error(`Projeto MCP desativado expôs dados inesperadamente: ${JSON.stringify(payload)}`);
        }
      }
    }

    const result = await stopMcpProcess(session);
    assertNoUnhandledStderr(result.stderr);
    if (result.code !== 0) {
      throw new Error(`Processo MCP não encerrou limpo: code=${result.code}, signal=${result.signal}, stderr=${result.stderr}`);
    }
    return { enabled, toolNames, summary, diagnostics, assets, inspect, budget, stderr: result.stderr };
  } finally {
    if (session?.child.exitCode === null && !session.child.killed) {
      session.child.kill("SIGTERM");
    }
    await rm(temporary.root, { recursive: true, force: true });
  }
}

export async function runMcpStdioSmoke({
  appDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  canonicalProjectPath = path.resolve(appDirectory, "default-assets/templates/exemplo-gba/exemplo-gba.gba-project"),
  enginePackPath = path.resolve(appDirectory, "../../packages/GBAStudioEngine/dist/GBAStudioEnginePack")
} = {}) {
  return {
    authorized: await runScenario({ appDirectory, canonicalProjectPath, enabled: true, enginePackPath }),
    disabled: await runScenario({ appDirectory, canonicalProjectPath, enabled: false, enginePackPath })
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runMcpStdioSmoke()
    .then((result) => {
      console.log(JSON.stringify({
        ok: true,
        tools: result.authorized.toolNames,
        authorizedAssets: result.authorized.assets.data.length,
        authorizedInspection: result.authorized.inspect.data.asset.id,
        authorizedBudget: result.authorized.budget.data.ok,
        disabledCode: result.disabled.summary.code
      }, null, 2));
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
