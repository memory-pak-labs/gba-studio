#!/usr/bin/env node
import { existsSync } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const appRoot = path.resolve(path.dirname(scriptPath), "..");
const artifactsRoot = path.join(appRoot, "artifacts");
const manifestPath = path.join(artifactsRoot, "visual-responsive", "latest", "manifest.json");
const outputDir = path.join(artifactsRoot, "visual-review", "latest");
const outputHtmlPath = path.join(outputDir, "index.html");
const outputMarkdownPath = path.join(outputDir, "visual_review_checklist.md");
const outputJsonPath = path.join(outputDir, "visual_review_manifest.json");
const outputApprovalTemplatePath = path.join(outputDir, "visual_review_approval.template.json");
const visualReferencePath = path.join(appRoot, "docs", "visual-parity-reference.md");
const referenceSourcesPath = path.join(appRoot, "docs", "visual-reference-sources.json");
const readinessReportPath = path.join(
  artifactsRoot,
  "macos-pilot-readiness",
  "latest",
  "macos_pilot_readiness.md"
);
const manualApprovalsPath = path.join(
  artifactsRoot,
  "macos-pilot-readiness",
  "latest",
  "manual_approvals.json"
);

const sections = [
  {
    title: "Global e Projeto Runtime",
    prefixes: ["Projeto runtime"],
    checks: [
      "Topbar leve, com marca, nome/status do projeto, switcher central e acoes a direita.",
      "Projeto atual do runtime abre direto, com workspaces e status visiveis desde a primeira captura.",
      "Densidade operacional consistente com o design system Electron, sem cards grandes desnecessarios."
    ]
  },
  {
    title: "Editor / Rooms",
    prefixes: ["Editor"],
    checks: [
      "Layout de tres colunas com navegador, canvas em grid e inspector.",
      "Cartoes de room com borda roxa, metadados, chips e metricas compactas.",
      "Modos de ferramenta e inspector contextual cobrem pintura, colisao, ator, trigger e cena."
    ]
  },
  {
    title: "Eventos",
    prefixes: ["Eventos"],
    checks: [
      "Canvas visual amplo com cards conectados e toolbar de filtros.",
      "Menu de adicionar bloco tem busca, abas, favoritos, badges e categorias navegaveis.",
      "Inspector do evento focado apresenta acoes e metadados sem quebrar a hierarquia."
    ]
  },
  {
    title: "Sprites",
    prefixes: ["Sprites"],
    checks: [
      "Trilhos de atores e animacoes permanecem separados, pesquisaveis e densos.",
      "Modos Selecionar, Pintar, Apagar, Geometria e Eventos ficam claros no topo.",
      "Modo Pintar mostra tiles, brush, referencia, presets de tamanho e estado ativo."
    ]
  },
  {
    title: "Dialogos",
    prefixes: ["Dialogos"],
    checks: [
      "Rail esquerdo, editor central e preview/configuracao direita seguem a referencia.",
      "Filtros por status/uso/avisos e preview GBA permanecem legiveis.",
      "Estado vazio continua calmo e sem diagnosticos irrelevantes."
    ]
  },
  {
    title: "Audio",
    prefixes: ["Audio"],
    checks: [
      "Biblioteca, transport, compositor central e inspector lateral mantem densidade operacional.",
      "Basico e Completo diferenciam Piano Roll, Tracker e Sequencia atual.",
      "Tracker e sequencia sao legiveis e nao parecem tabelas improvisadas."
    ]
  },
  {
    title: "Arquivos",
    prefixes: ["Arquivos"],
    checks: [
      "Resumo, filtros, grupos por tipo e painel de uso seguem leitura clara.",
      "Fluxo Importar > Organizar > Validar > Usar no projeto fica visivel e util.",
      "Acoes contextuais levam ao workspace relacionado sem ambiguidade visual."
    ]
  },
  {
    title: "Ajustes",
    prefixes: ["Ajustes"],
    checks: [
      "Navegacao agrupada na esquerda e formulario largo a direita.",
      "Secoes densas usam linhas de formulario, toggles, sliders e reset sem excesso visual.",
      "Cartoes de intencao e controles compactos continuam escaneaveis."
    ]
  }
];

function htmlEscape(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function markdownEscape(value) {
  return String(value).replaceAll("|", "\\|");
}

function groupId(title) {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function groupCaptures(captures, referenceGroups) {
  return sections.map((section) => ({
    ...section,
    id: groupId(section.title),
    captures: captures.filter((capture) => section.prefixes.some((prefix) => capture.label?.startsWith(prefix))),
    references: referenceGroups.get(section.title)?.references ?? [],
    missingReferences: referenceGroups.get(section.title)?.missingReferences ?? []
  }));
}

function relativeCapturePath(capturePath) {
  return path.relative(outputDir, capturePath).split(path.sep).join("/");
}

function relativeArtifactPath(filePath) {
  return path.relative(outputDir, filePath).split(path.sep).join("/");
}

function imageHref(filePath) {
  if (filePath.startsWith(appRoot)) {
    return relativeArtifactPath(filePath);
  }
  return pathToFileURL(filePath).href;
}

async function loadReferenceGroups() {
  if (!existsSync(referenceSourcesPath)) {
    return new Map();
  }

  const referenceManifest = JSON.parse(await readFile(referenceSourcesPath, "utf8"));
  const groups = new Map();

  for (const group of referenceManifest.groups ?? []) {
    const references = [];
    const missingReferences = [];

    for (const reference of group.references ?? []) {
      const absolutePath = path.isAbsolute(reference.path)
        ? reference.path
        : path.resolve(path.dirname(referenceSourcesPath), reference.path);

      if (!existsSync(absolutePath)) {
        missingReferences.push({ ...reference, path: absolutePath });
        continue;
      }

      const info = await stat(absolutePath);
      references.push({
        ...reference,
        path: absolutePath,
        bytes: info.size
      });
    }

    groups.set(group.title, { references, missingReferences });
  }

  return groups;
}

function renderImageCard(item, kind) {
  const href = kind === "capture" ? relativeCapturePath(item.path) : imageHref(item.path);
  const chips = (item.expectedText ?? item.tags ?? [])
    .map((entry) => `<span>${htmlEscape(entry)}</span>`)
    .join("");
  const meta = [
    item.bytes ? `${item.bytes} bytes` : null,
    item.textLength != null ? `OCR/texto: ${item.textLength} chars` : null,
    item.note ?? null
  ].filter(Boolean).join(" · ");

  return [
    `<article class="capture ${htmlEscape(kind)}">`,
    `<h3>${htmlEscape(item.label)}</h3>`,
    `<a href="${htmlEscape(href)}"><img src="${htmlEscape(href)}" alt="${htmlEscape(item.label)}"></a>`,
    meta ? `<p>${htmlEscape(meta)}</p>` : "",
    chips ? `<div class="chips">${chips}</div>` : "",
    "</article>"
  ].join("");
}

function renderHtml(groups, generatedAt) {
  const nav = groups
    .map((group) => `<a href="#${htmlEscape(group.id)}">${htmlEscape(group.title)} <span>${group.references.length}/${group.captures.length}</span></a>`)
    .join("");
  const body = groups
    .map((group) => {
      const checks = group.checks.map((check) => `<li><label><input type="checkbox"> ${htmlEscape(check)}</label></li>`).join("");
      const captures = group.captures
        .map((capture) => renderImageCard(capture, "capture"))
        .join("");
      const references = group.references.map((reference) => renderImageCard(reference, "reference")).join("");
      const referenceLane = references || `<p class="empty">Nenhuma referencia historica local encontrada para este grupo.</p>`;
      const missing = group.missingReferences.length
        ? `<p class="missing">${group.missingReferences.length} referencia(s) antiga(s) nao encontrada(s) no disco; veja o manifest JSON.</p>`
        : "";
      const approvalSnippet = JSON.stringify({
        id: group.id,
        title: group.title,
        approved: false,
        reviewer: "",
        notes: ""
      }, null, 2);
      return [
        `<section id="${htmlEscape(group.id)}">`,
        `<header><h2>${htmlEscape(group.title)}</h2><p>${group.references.length} referencia(s) / ${group.captures.length} captura(s)</p></header>`,
        `<ul class="checks">${checks}</ul>`,
        `<details class="approval-snippet"><summary>Registro de aprovacao desta area</summary><pre>${htmlEscape(approvalSnippet)}</pre></details>`,
        `<div class="comparison">`,
        `<div class="lane"><h3>Referencias historicas opcionais</h3><div class="captures">${referenceLane}</div>${missing}</div>`,
        `<div class="lane"><h3>Capturas Electron</h3><div class="captures">${captures}</div></div>`,
        `</div>`,
        "</section>"
      ].join("");
    })
    .join("");

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>GBA Studio Electron - Revisao visual macOS</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #eef1f5;
      --panel: #ffffff;
      --line: #d9dee7;
      --text: #252a31;
      --muted: #6f7783;
      --accent: #6d2df0;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: var(--bg);
      color: var(--text);
    }
    header.hero {
      padding: 24px 32px;
      border-bottom: 1px solid var(--line);
      background: rgba(255, 255, 255, 0.86);
      position: sticky;
      top: 0;
      z-index: 2;
    }
    h1, h2, h3, p { margin: 0; }
    h1 { font-size: 24px; }
    .hero p { margin-top: 6px; color: var(--muted); }
    .approval {
      margin-top: 16px;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 10px;
    }
    .approval a,
    .approval code {
      display: block;
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 9px 10px;
      background: #f7f9fc;
      color: var(--text);
      text-decoration: none;
      font-size: 12px;
      line-height: 1.35;
      overflow-wrap: anywhere;
    }
    .approval-snippet {
      margin: 0 0 16px;
      border: 1px solid #e2e7ee;
      border-radius: 8px;
      background: #f8fafc;
      overflow: hidden;
    }
    .approval-snippet summary {
      cursor: pointer;
      padding: 9px 10px;
      color: var(--muted);
      font-weight: 700;
      font-size: 13px;
    }
    .approval-snippet pre {
      margin: 0;
      border-top: 1px solid #e2e7ee;
      padding: 10px;
      color: #3d444f;
      white-space: pre-wrap;
      font-size: 12px;
      line-height: 1.45;
    }
    .approval strong {
      display: block;
      margin-bottom: 3px;
      font-size: 13px;
    }
    nav {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-top: 18px;
    }
    nav a {
      text-decoration: none;
      color: var(--text);
      background: #e4e9f0;
      border-radius: 8px;
      padding: 7px 10px;
      font-weight: 700;
      font-size: 13px;
    }
    nav span { color: var(--accent); margin-left: 4px; }
    main { padding: 24px 32px 48px; }
    section {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 18px;
      margin-bottom: 18px;
    }
    section header {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 12px;
    }
    section header p { color: var(--muted); font-weight: 700; }
    .checks {
      margin: 0 0 16px;
      padding: 0;
      list-style: none;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 8px;
    }
    .checks li {
      background: #f1f4f8;
      border: 1px solid #e2e7ee;
      border-radius: 8px;
      padding: 10px;
      color: #3d444f;
      font-size: 13px;
      line-height: 1.35;
    }
    .captures {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
      gap: 14px;
    }
    .comparison {
      display: grid;
      grid-template-columns: minmax(320px, 0.9fr) minmax(420px, 1.25fr);
      gap: 16px;
      align-items: start;
    }
    .lane > h3 {
      font-size: 13px;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0;
      margin: 0 0 8px;
    }
    .capture {
      border: 1px solid var(--line);
      border-radius: 8px;
      overflow: hidden;
      background: #fafbfc;
    }
    .capture h3 {
      padding: 10px 12px;
      font-size: 14px;
      border-bottom: 1px solid var(--line);
    }
    .reference h3 {
      color: var(--accent);
    }
    .capture img {
      display: block;
      width: 100%;
      max-height: 460px;
      object-fit: contain;
      background: white;
    }
    .capture p {
      padding: 8px 12px 0;
      color: var(--muted);
      font-size: 12px;
    }
    .chips {
      padding: 8px 12px 12px;
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .chips span {
      background: #efe7ff;
      color: var(--accent);
      border-radius: 999px;
      padding: 4px 7px;
      font-size: 11px;
      font-weight: 700;
    }
    .empty,
    .missing {
      border: 1px dashed var(--line);
      border-radius: 8px;
      color: var(--muted);
      padding: 12px;
      background: #f8fafc;
      font-size: 13px;
      line-height: 1.35;
    }
    .missing {
      margin-top: 10px;
      border-color: #f2b66d;
      color: #995a00;
      background: #fff8ec;
    }
    @media (max-width: 980px) {
      .comparison {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <header class="hero">
    <h1>Revisao visual macOS - GBA Studio Electron</h1>
    <p>Gerado em ${htmlEscape(generatedAt)} a partir de artifacts/visual-responsive/latest/manifest.json, usando o template completo Exemplo GBA. Use as capturas Electron e o design system atual como fonte primaria; referencias historicas servem apenas para contexto.</p>
    <div class="approval">
      <a href="${htmlEscape(relativeArtifactPath(visualReferencePath))}"><strong>Referencia de paridade</strong>${htmlEscape(visualReferencePath)}</a>
      <a href="${htmlEscape(relativeArtifactPath(readinessReportPath))}"><strong>Auditoria macOS</strong>${htmlEscape(readinessReportPath)}</a>
      <a href="${htmlEscape(relativeArtifactPath(outputApprovalTemplatePath))}"><strong>Template por area</strong>${htmlEscape(outputApprovalTemplatePath)}</a>
      <code><strong>Aprovacao apos revisao</strong>Definir humanVisualReviewApproved=true em ${htmlEscape(manualApprovalsPath)} e rodar npm run audit:macos-pilot.</code>
    </div>
    <nav>${nav}</nav>
  </header>
  <main>${body}</main>
</body>
</html>
`;
}

function renderMarkdown(groups, generatedAt) {
  const lines = [
    "# Revisao visual macOS",
    "",
    `Gerado em: ${generatedAt}`,
    "",
    "Use esta checklist junto com `apps/desktop-electron/docs/visual-parity-reference.md`. O design system Electron e a fonte primaria; referencias historicas servem apenas como contexto.",
    "",
    "## Como aprovar",
    "",
    `- Referencia de paridade: \`${visualReferencePath}\``,
    `- Manifesto de referencias historicas opcionais: \`${referenceSourcesPath}\``,
    `- Auditoria macOS: \`${readinessReportPath}\``,
    `- Template granular de aprovacao: \`${outputApprovalTemplatePath}\``,
    `- Aprovacao manual: depois da revisao visual, definir \`humanVisualReviewApproved: true\` em \`${manualApprovalsPath}\`.`,
    "- Validacao final: rodar `npm run audit:macos-pilot` em `apps/desktop-electron`.",
    "",
    "## Aprovacao por area",
    "",
    "| Area | Capturas Electron | Referencias historicas | Aprovado | Observacoes |",
    "| --- | ---: | ---: | --- | --- |"
  ];

  for (const group of groups) {
    lines.push(`| ${markdownEscape(group.title)} | ${group.captures.length} | ${group.references.length} | [ ] |  |`);
  }
  lines.push("");

  for (const group of groups) {
    lines.push(`## ${group.title}`, "");
    for (const check of group.checks) {
      lines.push(`- [ ] ${check}`);
    }
    lines.push("", "| Referencia historica | Arquivo | Observacoes |", "| --- | --- | --- |");
    if (group.references.length === 0) {
      lines.push("| Sem referencia local encontrada | - | Use os prints da conversa se necessario |");
    } else {
      for (const reference of group.references) {
        lines.push(`| ${markdownEscape(reference.label)} | ${markdownEscape(reference.path)} | ${markdownEscape(reference.note ?? "")} |`);
      }
    }
    if (group.missingReferences.length > 0) {
      for (const reference of group.missingReferences) {
        lines.push(`| AUSENTE: ${markdownEscape(reference.label)} | ${markdownEscape(reference.path)} | Arquivo nao encontrado no disco atual |`);
      }
    }
    lines.push("", "| Captura | Arquivo | Sinais esperados |", "| --- | --- | --- |");
    for (const capture of group.captures) {
      const file = path.basename(capture.path);
      const expected = (capture.expectedText ?? []).map(markdownEscape).join(", ");
      lines.push(`| ${markdownEscape(capture.label)} | ${markdownEscape(file)} | ${expected} |`);
    }
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

function renderApprovalTemplate(groups, generatedAt) {
  return {
    ok: false,
    generatedAt,
    instructions:
      "Revise cada area no index.html e marque approved=true somente quando a area estiver visualmente aceitavel. Depois de todas as areas aprovadas, copie o resultado para manual_approvals.json definindo humanVisualReviewApproved=true.",
    htmlPath: outputHtmlPath,
    checklistPath: outputMarkdownPath,
    manualApprovalsPath,
    requiredAreas: groups.map((group) => group.id),
    areas: Object.fromEntries(
      groups.map((group) => [
        group.id,
        {
          title: group.title,
          approved: false,
          reviewer: "",
          notes: "",
          captures: group.captures.map((capture) => path.basename(capture.path)),
          localReferences: group.references.map((reference) => reference.path),
          missingReferences: group.missingReferences.map((reference) => reference.path),
          checks: group.checks
        }
      ])
    )
  };
}

async function main() {
  if (!existsSync(manifestPath)) {
    throw new Error(`Manifesto visual nao encontrado: ${manifestPath}. Rode npm run smoke:visual primeiro.`);
  }

  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const referenceGroups = await loadReferenceGroups();
  const groups = groupCaptures(manifest.captures ?? [], referenceGroups);
  const generatedAt = new Date().toISOString();
  const reviewManifest = {
    ok: true,
    generatedAt,
    sourceManifestPath: manifestPath,
    visualReferencePath,
    referenceSourcesPath,
    readinessReportPath,
    manualApprovalsPath,
    approvalTemplatePath: outputApprovalTemplatePath,
    htmlPath: outputHtmlPath,
    markdownPath: outputMarkdownPath,
    groups: groups.map((group) => ({
      id: group.id,
      title: group.title,
      captures: group.captures.length,
      references: group.references.length,
      missingReferences: group.missingReferences.length,
      checks: group.checks.length
    }))
  };

  await mkdir(outputDir, { recursive: true });
  await writeFile(outputHtmlPath, renderHtml(groups, generatedAt), "utf8");
  await writeFile(outputMarkdownPath, renderMarkdown(groups, generatedAt), "utf8");
  await writeFile(
    outputApprovalTemplatePath,
    `${JSON.stringify(renderApprovalTemplate(groups, generatedAt), null, 2)}\n`,
    "utf8"
  );
  await writeFile(outputJsonPath, `${JSON.stringify(reviewManifest, null, 2)}\n`, "utf8");

  console.log(`[visual-review] html: ${outputHtmlPath}`);
  console.log(`[visual-review] checklist: ${outputMarkdownPath}`);
  console.log(`[visual-review] approval template: ${outputApprovalTemplatePath}`);
  console.log(`[visual-review] manifest: ${outputJsonPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
