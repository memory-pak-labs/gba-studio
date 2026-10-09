import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createMessageReader, createJsonRpcRequest, assertMcpToolNames } from "./smoke-mcp-stdio.mjs";
import { cdpSession, createElectronSmokeEnv, electronExecutablePath, terminateChild, wait,
  waitForRenderedText } from "./lib/electron-smoke-helpers.mjs";

const appRoot = dirname(dirname(fileURLToPath(import.meta.url)));

async function availablePort() {
  const server = createServer();
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

export async function verifyElectronInstanceIsolation({ order, output }) {
  assert(["mcp-first", "editor-first"].includes(order));
  const temporary = await mkdtemp(join(tmpdir(), "gba-instance-isolation-"));
  const canonicalPath = join(appRoot, "default-assets/templates/exemplo-gba/exemplo-gba.gba-project");
  const canonicalBytes = await readFile(canonicalPath);
  const project = JSON.parse(canonicalBytes);
  project.settings.mcp = { enabled: false };
  const projectPath = join(temporary, "disabled.gba-project");
  await writeFile(projectPath, JSON.stringify(project));
  await mkdir(output, { recursive: true });
  const sharedUserData = join(temporary, "shared-user-data");
  await mkdir(sharedUserData);
  const env = createElectronSmokeEnv({
    GBA_STUDIO_OPEN_PROJECT: "", ELECTRON_RENDERER_URL: "",
    GBA_STUDIO_ENGINE_PACK_SOURCE: join(appRoot, "../../packages/GBAStudioEngine/dist/GBAStudioEnginePack")
  });
  delete env.GBA_STUDIO_SMOKE_CDP_PORT;
  delete env.GBA_STUDIO_SMOKE_USER_DATA_DIR;
  delete env.GBA_STUDIO_PREVIEW_VISUAL_URL;
  delete env.GBA_STUDIO_PREVIEW_VISUAL_CDP_PORT;
  const children = [];
  const logs = {};
  let cdp, errorObserver, editor, success = false, failure;
  const rendererErrors = [];
  function start(name, args, extraEnv = {}) {
    const child = spawn(electronExecutablePath({ appRoot, usePackagedApp: false }), [`--user-data-dir=${sharedUserData}`, appRoot, ...args],
      { cwd: appRoot, env: { ...env, ...extraEnv }, stdio: ["pipe", "pipe", "pipe"] });
    children.push(child); logs[name] = { stdout: "", stderr: "" };
    child.stdout.on("data", chunk => { logs[name].stdout += chunk; });
    child.stderr.on("data", chunk => { logs[name].stderr += chunk; });
    return child;
  }
  async function startMcp(name) {
    const child = start(name, ["--mcp", "--project", projectPath]);
    const reader = createMessageReader(child);
    async function request(id, method, params) {
      child.stdin.write(createJsonRpcRequest(id, method, params));
      const response = await reader.nextMessage(10_000);
      assert.equal(response.id, id); assert(!response.error, JSON.stringify(response));
      return response.result;
    }
    await request(1, "initialize", { protocolVersion: "2025-11-25", capabilities: {},
      clientInfo: { name: "instance-isolation-qa", version: "1" } });
    child.stdin.write(createJsonRpcRequest(undefined, "notifications/initialized"));
    const tools = await request(2, "tools/list", {});
    assertMcpToolNames(tools.tools.map(tool => tool.name));
    const summary = await request(3, "tools/call", { name: "gbs_project_summary", arguments: {} });
    assert.equal(JSON.parse(summary.content[0].text).code, "MCP_DISABLED");
    return { child, request };
  }
  async function startEditor() {
    const port = await availablePort();
    editor = start("editor", [], { GBA_STUDIO_SMOKE_CDP_PORT: String(port) });
    let target;
    for (let i = 0; i < 60 && !target; i++) {
      assert.equal(editor.exitCode, null, `Editor encerrou antes de abrir: ${editor.exitCode}`);
      assert.equal(editor.signalCode, null, `Editor encerrou por ${editor.signalCode}`);
      try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.type === "page"); } catch {}
      if (!target) await wait(150);
    }
    assert(target, "Janela do editor não apareceu");
    cdp = cdpSession(target.webSocketDebuggerUrl); await cdp.ready;
    errorObserver = new WebSocket(target.webSocketDebuggerUrl);
    errorObserver.addEventListener("message", event => {
      const message = JSON.parse(event.data);
      if (message.method === "Runtime.exceptionThrown") rendererErrors.push(message.params.exceptionDetails);
    });
    await new Promise((resolve, reject) => {
      errorObserver.addEventListener("open", resolve, { once: true });
      errorObserver.addEventListener("error", reject, { once: true });
    });
    errorObserver.send(JSON.stringify({ id: 1, method: "Runtime.enable" }));
    // Query the real window, rather than treating an alive headless process as a launched editor.
    await waitForRenderedText(cdp, text => text.includes("Criar projeto") && text.includes("Projeto em branco"), "Welcome alongside MCP");
    const screenshot = await cdp.send("Page.captureScreenshot", { format: "png" });
    await writeFile(join(output, "welcome.png"), Buffer.from(screenshot.data, "base64"));
    return port;
  }
  try {
    let mcp, port;
    if (order === "mcp-first") { mcp = await startMcp("mcp-1"); port = await startEditor(); }
    else { port = await startEditor(); mcp = await startMcp("mcp-1"); }
    const secondMcp = await startMcp("mcp-2");
    assertMcpToolNames((await mcp.request(4, "tools/list", {})).tools.map(tool => tool.name));
    assertMcpToolNames((await secondMcp.request(4, "tools/list", {})).tools.map(tool => tool.name));
    const secondEditor = start("second-editor", []);
    for (let i = 0; i < 60 && secondEditor.exitCode === null; i++) await wait(100);
    assert.equal(secondEditor.exitCode, 0, "Uma segunda janela principal não deve iniciar outro editor");
    assert.equal(editor.exitCode, null, "A janela principal deve continuar aberta");
    const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    assert.equal(pages.filter(t => t.type === "page").length, 1);
    await waitForRenderedText(cdp, text => text.includes("Criar projeto"), "original editor stays usable");
    const evalResult = await cdp.send("Runtime.evaluate", {
      expression: "Array.from(document.querySelectorAll('button')).some(button => button.textContent.includes('Projeto em branco') && !button.disabled)",
      returnByValue: true
    });
    if (evalResult.exceptionDetails) rendererErrors.push(evalResult.exceptionDetails);
    assert.equal(evalResult.result?.value, true, "Criar um projeto em branco deve continuar disponível");
    assert.equal(rendererErrors.length, 0);
    assert.deepEqual(await readFile(canonicalPath), canonicalBytes, "Projeto canônico foi alterado");
    for (const log of Object.values(logs)) assert(!/UnhandledPromiseRejection|uncaught(?:Exception| error)|FATAL/i.test(log.stderr), log.stderr);
    success = true;
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    errorObserver?.close();
    cdp?.close();
    for (const child of children) await terminateChild(child);
    await writeFile(join(output, "evidence.json"), JSON.stringify({ success, order, failure,
      sharedUserData: true, disabledMcpAccessPreserved: success, twoMcpClientsAndOneEditor: success,
      children: children.map(child => ({ pid: child.pid, exitCode: child.exitCode, signal: child.signalCode })),
      logs, rendererErrors }, null, 2));
    await rm(temporary, { recursive: true, force: true });
  }
}
