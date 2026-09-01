(function initChatGPTExporterCore(global) {
  "use strict";

  if (global.ChatGPTExporterCore) return;

  const ROLE_LABELS = Object.freeze({
    user: "用户",
    assistant: "ChatGPT",
    system: "系统",
    tool: "工具"
  });

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function safeFilename(value, fallback = "chatgpt-conversation") {
    const cleaned = String(value ?? "")
      .normalize("NFKC")
      .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-")
      .replace(/\s+/g, " ")
      .replace(/[-. ]+$/g, "")
      .trim()
      .slice(0, 120);
    return cleaned || fallback;
  }

  function filenameDate(date = new Date()) {
    const pad = (part) => String(part).padStart(2, "0");
    return [
      date.getFullYear(),
      pad(date.getMonth() + 1),
      pad(date.getDate())
    ].join("-");
  }

  function createFilename(title, extension, date = new Date()) {
    const ext = String(extension || "md").replace(/^\.+/, "");
    return `${safeFilename(title)}-${filenameDate(date)}.${ext}`;
  }

  function normalizeRole(role) {
    return ["user", "assistant", "system", "tool"].includes(role)
      ? role
      : "assistant";
  }

  function roleLabel(role) {
    return ROLE_LABELS[normalizeRole(role)] || role;
  }

  function normalizeOptions(snapshot, input = {}) {
    const count = Array.isArray(snapshot?.messages) ? snapshot.messages.length : 0;
    const from = Math.max(1, Number.parseInt(input.from, 10) || 1);
    const requestedTo = Number.parseInt(input.to, 10);
    const to = Math.min(count, Number.isFinite(requestedTo) ? requestedTo : count);
    const selectedMessageIds = Array.isArray(input.selectedMessageIds)
      ? [...new Set(input.selectedMessageIds.map((id) => String(id || "").trim()).filter(Boolean))]
      : null;
    return {
      from,
      to: Math.max(0, to),
      selectedMessageIds,
      roles: {
        user: input.roles?.user !== false,
        assistant: input.roles?.assistant !== false,
        system: input.roles?.system !== false,
        tool: input.roles?.tool !== false
      },
      includeMetadata: input.includeMetadata !== false,
      includeSource: input.includeSource !== false,
      includeRoleLabels: input.includeRoleLabels !== false,
      includeSeparators: input.includeSeparators !== false,
      theme: ["system", "light", "dark"].includes(input.theme)
        ? input.theme
        : "system"
    };
  }

  function selectMessages(snapshot, input = {}) {
    const options = normalizeOptions(snapshot, input);
    const selectedIds = options.selectedMessageIds === null
      ? null
      : new Set(options.selectedMessageIds);
    if (selectedIds === null && options.from > options.to) return [];
    return (snapshot.messages || []).filter((message, offset) => {
      const position = Number.isFinite(message.index) ? message.index : offset + 1;
      const role = normalizeRole(message.role);
      const isSelected = selectedIds === null
        ? position >= options.from && position <= options.to
        : selectedIds.has(String(message.id || ""));
      return isSelected && options.roles[role];
    });
  }

  function singleLine(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }

  function markdownHeading(value) {
    return singleLine(value).replace(/(^|\s)#+(?=\s|$)/g, "$1\\#") || "ChatGPT 对话";
  }

  function yamlString(value) {
    return JSON.stringify(String(value ?? ""));
  }

  function buildMarkdown(snapshot, input = {}) {
    const options = normalizeOptions(snapshot, input);
    const messages = selectMessages(snapshot, options);
    const title = markdownHeading(snapshot.title);
    const exportedAt = snapshot.exportedAt || new Date().toISOString();
    const chunks = [];

    if (options.includeMetadata) {
      chunks.push("---");
      chunks.push(`title: ${yamlString(snapshot.title || "ChatGPT 对话")}`);
      if (options.includeSource && snapshot.url) {
        chunks.push(`source: ${yamlString(snapshot.url)}`);
      }
      chunks.push(`exported_at: ${yamlString(exportedAt)}`);
      chunks.push(`message_count: ${messages.length}`);
      chunks.push("---", "");
    }

    chunks.push(`# ${title}`, "");

    messages.forEach((message, index) => {
      const role = normalizeRole(message.role);
      if (options.includeRoleLabels) {
        const icon = role === "user" ? "👤" : role === "assistant" ? "🤖" : "⚙️";
        chunks.push(`## ${icon} ${roleLabel(role)}`, "");
      }
      const body = String(message.markdown || message.text || "").trim();
      chunks.push(body || "_(空消息)_", "");
      if (options.includeSeparators && index < messages.length - 1) {
        chunks.push("---", "");
      }
    });

    return chunks.join("\n").replace(/\n{4,}/g, "\n\n\n").trimEnd() + "\n";
  }

  function plainTextToHtml(value) {
    return String(value ?? "")
      .split(/\n{2,}/)
      .map((paragraph) => `<p>${escapeHtml(paragraph).replaceAll("\n", "<br>")}</p>`)
      .join("\n");
  }

  function buildHtml(snapshot, input = {}) {
    const options = normalizeOptions(snapshot, input);
    const messages = selectMessages(snapshot, options);
    const title = snapshot.title || "ChatGPT 对话";
    const exportedAt = snapshot.exportedAt || new Date().toISOString();
    const source = options.includeSource && snapshot.url
      ? `<a href="${escapeHtml(snapshot.url)}" rel="noreferrer noopener">${escapeHtml(snapshot.url)}</a>`
      : "";
    const themeClass = `theme-${options.theme}`;

    const sections = messages.map((message) => {
      const role = normalizeRole(message.role);
      const label = roleLabel(role);
      const body = String(message.html || "").trim() || plainTextToHtml(message.text);
      return [
        `<section class="message message-${role}" data-role="${role}">`,
        options.includeRoleLabels
          ? `<header><span class="avatar" aria-hidden="true">${role === "user" ? "U" : role === "assistant" ? "AI" : "•"}</span><strong>${escapeHtml(label)}</strong></header>`
          : "",
        `<div class="message-body">${body}</div>`,
        `</section>`
      ].join("\n");
    }).join("\n");

    const metadata = options.includeMetadata
      ? `<aside class="metadata">
          <span>导出时间：${escapeHtml(exportedAt)}</span>
          <span>消息数量：${messages.length}</span>
          ${source ? `<span>来源：${source}</span>` : ""}
        </aside>`
      : "";

    return `<!doctype html>
<html lang="zh-CN" class="${themeClass}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="generator" content="ChatGPT Enhanced Exporter">
  <title>${escapeHtml(title)}</title>
  <style>
    :root { color-scheme: light dark; --bg:#f7f7f8; --surface:#fff; --text:#202123; --muted:#6b7280; --line:#e5e7eb; --accent:#10a37f; --user:#eef8f5; --code:#111827; --code-text:#f9fafb; }
    .theme-light { color-scheme:light; }
    .theme-dark { color-scheme:dark; --bg:#171717; --surface:#212121; --text:#ececec; --muted:#a3a3a3; --line:#424242; --accent:#19c37d; --user:#183c32; --code:#0d0d0d; --code-text:#f5f5f5; }
    @media (prefers-color-scheme: dark) { .theme-system { --bg:#171717; --surface:#212121; --text:#ececec; --muted:#a3a3a3; --line:#424242; --accent:#19c37d; --user:#183c32; --code:#0d0d0d; --code-text:#f5f5f5; } }
    * { box-sizing:border-box; }
    body { margin:0; background:var(--bg); color:var(--text); font:16px/1.7 ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
    main { width:min(900px,calc(100% - 32px)); margin:0 auto; padding:48px 0 80px; }
    h1 { margin:0 0 18px; font-size:clamp(1.8rem,5vw,2.6rem); line-height:1.2; }
    .metadata { display:flex; flex-wrap:wrap; gap:8px 18px; margin-bottom:28px; color:var(--muted); font-size:.875rem; }
    .metadata a { color:var(--accent); overflow-wrap:anywhere; }
    .message { margin:14px 0; padding:22px; border:1px solid var(--line); border-radius:16px; background:var(--surface); box-shadow:0 2px 10px rgba(0,0,0,.035); }
    .message-user { background:var(--user); }
    .message header { display:flex; align-items:center; gap:10px; margin-bottom:14px; color:var(--muted); font-size:.9rem; }
    .avatar { display:grid; place-items:center; width:28px; height:28px; border-radius:9px; background:var(--accent); color:white; font-size:.68rem; font-weight:800; }
    .message-user .avatar { background:#6b7280; }
    .message-body > :first-child { margin-top:0; } .message-body > :last-child { margin-bottom:0; }
    p, ul, ol, blockquote, pre, table { margin:1em 0; }
    h1,h2,h3,h4,h5,h6 { line-height:1.3; margin:1.4em 0 .6em; }
    a { color:var(--accent); } img { max-width:100%; height:auto; border-radius:10px; }
    blockquote { margin-left:0; padding:.1em 1em; border-left:4px solid var(--accent); color:var(--muted); }
    code { padding:.16em .35em; border-radius:5px; background:color-mix(in srgb,var(--line) 70%,transparent); font: .9em/1.5 ui-monospace,SFMono-Regular,Menlo,monospace; }
    pre { overflow:auto; padding:16px; border-radius:12px; background:var(--code); color:var(--code-text); }
    pre code { padding:0; background:none; color:inherit; }
    table { display:block; width:100%; overflow:auto; border-collapse:collapse; }
    th,td { padding:8px 12px; border:1px solid var(--line); text-align:left; }
    hr { border:0; border-top:1px solid var(--line); margin:24px 0; }
    .katex-display { overflow:auto hidden; padding:.4em 0; }
    @media print { body { background:#fff; color:#111; } main { width:100%; padding:0; } .message { break-inside:avoid; box-shadow:none; } }
  </style>
</head>
<body>
  <main>
    <h1>${escapeHtml(title)}</h1>
    ${metadata}
    <article class="conversation">
${sections}
    </article>
  </main>
</body>
</html>`;
  }

  global.ChatGPTExporterCore = Object.freeze({
    ROLE_LABELS,
    buildHtml,
    buildMarkdown,
    createFilename,
    escapeHtml,
    normalizeOptions,
    roleLabel,
    safeFilename,
    selectMessages
  });
})(typeof globalThis !== "undefined" ? globalThis : window);
