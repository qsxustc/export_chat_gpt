(function initChatGPTExporterContent() {
  "use strict";

  if (globalThis.__chatGPTEnhancedExporterLoaded) return;
  globalThis.__chatGPTEnhancedExporterLoaded = true;

  const core = globalThis.ChatGPTExporterCore;
  if (!core) {
    console.error("[ChatGPT Exporter] export-core.js 未加载");
    return;
  }

  const ALLOWED_TAGS = new Set([
    "A", "B", "BLOCKQUOTE", "BR", "CODE", "DEL", "DETAILS", "DIV", "EM",
    "H1", "H2", "H3", "H4", "H5", "H6", "HR", "I", "IMG", "KBD", "LI",
    "MARK", "OL", "P", "PRE", "S", "SPAN", "STRONG", "SUB", "SUMMARY",
    "SUP", "TABLE", "TBODY", "TD", "TFOOT", "TH", "THEAD", "TR", "U", "UL"
  ]);

  const REMOVE_SELECTORS = [
    "script", "style", "noscript", "template", "iframe", "object", "embed",
    "button", "input", "textarea", "select", "option", "svg", "canvas",
    "video", "audio", "[contenteditable='true']", "[data-testid*='copy']",
    "[aria-label*='Copy']", "[aria-label*='copy']", ".sr-only",
    ".chatgpt-exporter-message-toggle", "#chatgpt-exporter-page-button"
  ].join(",");

  const PAGE_BUTTON_ID = "chatgpt-exporter-page-button";
  const PAGE_BUTTON_STYLE_ID = "chatgpt-exporter-page-button-style";
  const SELECTION_STYLE_ID = "chatgpt-exporter-selection-style";
  const SELECTION_TOOLBAR_ID = "chatgpt-exporter-selection-toolbar";
  const SELECTION_CONTROL_CLASS = "chatgpt-exporter-message-toggle";
  const SELECTION_TURN_CLASS = "chatgpt-exporter-select-turn";
  const SELECTION_SELECTED_CLASS = "chatgpt-exporter-select-turn-selected";
  let activeMessageSelection = null;
  let completedMessageSelection = null;

  function absoluteUrl(value, allowInlineImage = false) {
    if (!value) return "";
    if (allowInlineImage && /^data:image\/(?:png|gif|jpe?g|webp|avif);base64,/i.test(value)) {
      return value;
    }
    try {
      const url = new URL(value, location.href);
      return ["http:", "https:"].includes(url.protocol) ? url.href : "";
    } catch {
      return "";
    }
  }

  function normalizeLatexSource(value) {
    let latex = String(value || "")
      .replace(/\r\n?/g, "\n")
      .replace(/[\u200b\ufeff]/g, "")
      .replace(/\u00a0/g, " ")
      .trim();
    const wrappers = [
      ["\\[", "\\]"],
      ["\\(", "\\)"],
      ["$$", "$$"],
      ["$", "$"]
    ];

    // Some renderers store the original source with its Markdown delimiters.
    // Strip at most two nested pairs so the exporter never emits `$\(...\)$`.
    for (let pass = 0; pass < 2; pass += 1) {
      const wrapper = wrappers.find(([opening, closing]) =>
        latex.startsWith(opening)
        && latex.endsWith(closing)
        && latex.length > opening.length + closing.length
      );
      if (!wrapper) break;
      latex = latex.slice(wrapper[0].length, -wrapper[1].length).trim();
    }
    return latex;
  }

  function latexAttribute(element, name) {
    const value = element.getAttribute?.(name);
    if (!value?.trim()) return "";
    const normalized = normalizeLatexSource(value);
    if (name === "data-math" && /^(?:true|false|inline|display|block)$/i.test(normalized)) {
      return "";
    }
    return normalized;
  }

  function latexFromElement(element) {
    const annotations = element.matches?.("annotation")
      ? [element]
      : [...element.querySelectorAll("annotation")];
    const annotation = annotations.find((node) =>
      /(?:x-tex|tex|latex)/i.test(node.getAttribute("encoding") || "")
    );
    if (annotation?.textContent?.trim()) return normalizeLatexSource(annotation.textContent);

    const script = element.matches?.('script[type^="math/tex" i]')
      ? element
      : element.querySelector('script[type^="math/tex" i]');
    if (script?.textContent?.trim()) return normalizeLatexSource(script.textContent);

    const candidates = [element, ...element.querySelectorAll(
      "[data-latex],[data-tex],[data-math],[data-formula],math[alttext]"
    )];
    for (const candidate of candidates) {
      for (const name of ["data-latex", "data-tex", "data-math", "data-formula", "alttext"]) {
        const latex = latexAttribute(candidate, name);
        if (latex) return latex;
      }
    }

    if (element.matches?.(".katex,mjx-container,math")) {
      const ariaLabel = latexAttribute(element, "aria-label");
      if (ariaLabel) return ariaLabel;
    }

    if (element.matches?.(".math-inline,.math-display,[data-math-style],[data-math-display]")) {
      return normalizeLatexSource(element.textContent);
    }
    return "";
  }

  function replaceMathElement(element, mode) {
    const latex = latexFromElement(element);
    if (!latex) return false;
    const replacement = document.createElement("span");
    replacement.dataset.exportMath = mode;
    replacement.className = `math-${mode}`;
    replacement.textContent = latex;
    element.replaceWith(replacement);
    return true;
  }

  function prepareMath(root) {
    const displaySelectors = [
      ".katex-display",
      'mjx-container[display="true"]',
      'math[display="block"]',
      'script[type^="math/tex" i][type*="mode=display" i]',
      '[data-math-style="display"]',
      '[data-math-display="true"]',
      ".math-display"
    ].join(",");
    [...root.querySelectorAll(displaySelectors)].forEach((element) => {
      if (!root.contains(element)) return;
      replaceMathElement(element, "display");
    });

    const inlineSelectors = [
      ".katex",
      'mjx-container:not([display="true"])',
      'math:not([display="block"])',
      '[data-math-style="inline"]',
      '[data-math-display="false"]',
      ".math-inline",
      "[data-latex]",
      "[data-tex]",
      "[data-math]",
      "[data-formula]",
      'script[type^="math/tex" i]:not([type*="mode=display" i])'
    ].join(",");
    [...root.querySelectorAll(inlineSelectors)].forEach((element) => {
      if (!root.contains(element) || element.closest?.("[data-export-math]")) return;
      replaceMathElement(element, "inline");
    });
  }

  function cleanClone(source) {
    const clone = source.cloneNode(true);
    prepareMath(clone);
    clone.querySelectorAll(REMOVE_SELECTORS).forEach((node) => node.remove());

    clone.querySelectorAll("*").forEach((element) => {
      if (!ALLOWED_TAGS.has(element.tagName)) {
        element.replaceWith(...element.childNodes);
        return;
      }

      const tag = element.tagName;
      const href = tag === "A" ? absoluteUrl(element.getAttribute("href")) : "";
      const src = tag === "IMG" ? absoluteUrl(element.getAttribute("src"), true) : "";
      const alt = tag === "IMG" ? element.getAttribute("alt") || "图片" : "";
      const title = element.getAttribute("title") || "";
      const languageClass = tag === "CODE"
        ? [...element.classList].find((name) => /^language-[\w+-]+$/.test(name)) || ""
        : "";
      const mathClass = element.dataset.exportMath
        ? `math-${element.dataset.exportMath}`
        : "";
      const tableAttrs = {};
      if (["TD", "TH"].includes(tag)) {
        for (const name of ["colspan", "rowspan", "scope"]) {
          if (element.hasAttribute(name)) tableAttrs[name] = element.getAttribute(name);
        }
      }
      const listAttrs = {};
      if (tag === "OL" && element.hasAttribute("start")) {
        listAttrs.start = element.getAttribute("start");
      }

      [...element.attributes].forEach((attribute) => element.removeAttribute(attribute.name));

      if (tag === "A" && href) {
        element.setAttribute("href", href);
        element.setAttribute("rel", "noreferrer noopener");
      } else if (tag === "A") {
        element.removeAttribute("href");
      }
      if (tag === "IMG" && src) {
        element.setAttribute("src", src);
        element.setAttribute("alt", alt);
        element.setAttribute("loading", "lazy");
      } else if (tag === "IMG") {
        element.remove();
        return;
      }
      if (title) element.setAttribute("title", title);
      if (languageClass) element.className = languageClass;
      if (mathClass) {
        element.className = mathClass;
        element.dataset.exportMath = mathClass.slice(5);
      }
      Object.entries(tableAttrs).forEach(([name, value]) => element.setAttribute(name, value));
      Object.entries(listAttrs).forEach(([name, value]) => element.setAttribute(name, value));
    });

    return clone;
  }

  function textContent(node) {
    return String(node?.textContent || "").replace(/\s+/g, " ").trim();
  }

  function escapeTableCell(value) {
    return String(value).replaceAll("|", "\\|").replace(/\s*\n\s*/g, "<br>").trim();
  }

  function codeFence(value) {
    const matches = String(value).match(/`+/g) || [];
    const max = matches.reduce((size, match) => Math.max(size, match.length), 0);
    return "`".repeat(Math.max(3, max + 1));
  }

  function listToMarkdown(element, ordered, depth) {
    const start = ordered ? Number.parseInt(element.getAttribute("start"), 10) || 1 : 1;
    const items = [...element.children].filter((child) => child.tagName === "LI");
    return items.map((item, index) => {
      const marker = ordered ? `${start + index}.` : "-";
      let body = [...item.childNodes].map((child) => {
        if (child.nodeType === Node.ELEMENT_NODE && ["UL", "OL"].includes(child.tagName)) {
          return `\n${listToMarkdown(child, child.tagName === "OL", depth + 1)}`;
        }
        return nodeToMarkdown(child, depth + 1);
      }).join("").trim();
      const lines = body.split("\n");
      const first = `${"  ".repeat(depth)}${marker} ${lines.shift() || ""}`;
      const continuation = lines.map((line) => line ? `${"  ".repeat(depth + 1)}${line}` : "");
      return [first, ...continuation].join("\n");
    }).join("\n") + "\n\n";
  }

  function tableToMarkdown(table) {
    const rows = [...table.querySelectorAll("tr")].map((row) =>
      [...row.children]
        .filter((cell) => ["TH", "TD"].includes(cell.tagName))
        .map((cell) => escapeTableCell(textContent(cell)))
    ).filter((row) => row.length);
    if (!rows.length) return "";
    const columns = Math.max(...rows.map((row) => row.length));
    rows.forEach((row) => { while (row.length < columns) row.push(""); });
    const header = rows.shift();
    const lines = [
      `| ${header.join(" | ")} |`,
      `| ${header.map(() => "---").join(" | ")} |`,
      ...rows.map((row) => `| ${row.join(" | ")} |`)
    ];
    return `${lines.join("\n")}\n\n`;
  }

  function nodeToMarkdown(node, depth = 0) {
    if (node.nodeType === Node.TEXT_NODE) return node.nodeValue || "";
    if (node.nodeType !== Node.ELEMENT_NODE) return "";

    const element = node;
    const tag = element.tagName;
    if (element.dataset.exportMath) {
      const latex = textContent(element);
      return element.dataset.exportMath === "display"
        ? `\n\n$$\n${latex}\n$$\n\n`
        : `$${latex}$`;
    }

    const children = () => [...element.childNodes]
      .map((child) => nodeToMarkdown(child, depth))
      .join("");

    if (/^H[1-6]$/.test(tag)) {
      return `\n\n${"#".repeat(Number(tag[1]))} ${children().trim()}\n\n`;
    }
    if (tag === "P") return `\n\n${children().trim()}\n\n`;
    if (tag === "BR") return "\n";
    if (["STRONG", "B"].includes(tag)) return `**${children().trim()}**`;
    if (["EM", "I"].includes(tag)) return `*${children().trim()}*`;
    if (["DEL", "S"].includes(tag)) return `~~${children().trim()}~~`;
    if (tag === "U") return `<u>${children().trim()}</u>`;
    if (tag === "MARK") return `==${children().trim()}==`;
    if (tag === "SUP") return `<sup>${children().trim()}</sup>`;
    if (tag === "SUB") return `<sub>${children().trim()}</sub>`;
    if (tag === "KBD") return `<kbd>${children().trim()}</kbd>`;
    if (tag === "A") {
      const label = children().trim() || element.getAttribute("href") || "链接";
      const href = element.getAttribute("href");
      return href ? `[${label}](${href}${element.title ? ` \"${element.title.replaceAll('"', '\\"')}\"` : ""})` : label;
    }
    if (tag === "IMG") {
      return `![${element.getAttribute("alt") || "图片"}](${element.getAttribute("src")})`;
    }
    if (tag === "CODE" && element.parentElement?.tagName !== "PRE") {
      const value = element.textContent || "";
      const fence = "`".repeat(Math.max(1, (value.match(/`+/g) || []).reduce((max, run) => Math.max(max, run.length + 1), 1)));
      return `${fence}${value}${fence}`;
    }
    if (tag === "PRE") {
      const code = element.querySelector("code");
      const value = (code || element).textContent || "";
      const language = [...(code?.classList || [])]
        .find((name) => name.startsWith("language-"))?.slice(9) || "";
      const fence = codeFence(value);
      return `\n\n${fence}${language}\n${value.replace(/\n$/, "")}\n${fence}\n\n`;
    }
    if (tag === "BLOCKQUOTE") {
      const body = children().trim().split("\n").map((line) => `> ${line}`).join("\n");
      return `\n\n${body}\n\n`;
    }
    if (tag === "UL") return listToMarkdown(element, false, depth);
    if (tag === "OL") return listToMarkdown(element, true, depth);
    if (tag === "LI") return children();
    if (tag === "TABLE") return tableToMarkdown(element);
    if (tag === "HR") return "\n\n---\n\n";
    if (tag === "DETAILS") return `\n\n${children().trim()}\n\n`;
    if (tag === "SUMMARY") return `**${children().trim()}**\n\n`;
    if (tag === "DIV") return `\n${children()}\n`;
    return children();
  }

  function domToMarkdown(root) {
    return nodeToMarkdown(root)
      .replace(/[\u200b\ufeff]/g, "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function getTitle() {
    const currentPath = location.pathname.replace(/\/$/, "");
    const matchingLink = [...document.querySelectorAll("nav a[href], aside a[href]")].find((link) => {
      try {
        return new URL(link.href, location.href).pathname.replace(/\/$/, "") === currentPath;
      } catch {
        return false;
      }
    });
    const sidebarTitle = matchingLink?.textContent?.replace(/\s+/g, " ").trim();
    if (sidebarTitle && sidebarTitle.length <= 180) return sidebarTitle;

    const documentTitle = document.title
      .replace(/\s*[|\-–—]\s*ChatGPT\s*$/i, "")
      .replace(/^ChatGPT\s*[|\-–—]\s*/i, "")
      .trim();
    return documentTitle && documentTitle.toLowerCase() !== "chatgpt"
      ? documentTitle
      : "ChatGPT 对话";
  }

  function getRoleNodes() {
    const articles = [...document.querySelectorAll("article")];
    const fromArticles = articles
      .map((article) => article.querySelector("[data-message-author-role]"))
      .filter(Boolean);
    const nodes = fromArticles.length
      ? fromArticles
      : [...document.querySelectorAll("main [data-message-author-role]")];
    return [...new Set(nodes)];
  }

  function getTurnNode(roleNode) {
    return roleNode.closest("article")
      || roleNode.closest('[data-testid^="conversation-turn-"]')
      || roleNode;
  }

  function getMessageId(roleNode, turn, offset) {
    return roleNode.getAttribute("data-message-id")
      || turn?.getAttribute("data-message-id")
      || turn?.getAttribute("data-testid")
      || `message-${offset + 1}`;
  }

  function getMessageEntries() {
    return getRoleNodes().map((roleNode, offset) => {
      const turn = getTurnNode(roleNode);
      return {
        index: offset + 1,
        id: getMessageId(roleNode, turn, offset),
        role: roleNode.getAttribute("data-message-author-role") || "assistant",
        roleNode,
        turn
      };
    });
  }

  function extractSnapshot() {
    const messages = getMessageEntries().map((entry) => {
      const clean = cleanClone(entry.roleNode);
      const time = entry.turn?.querySelector("time")?.getAttribute("datetime") || "";
      return {
        index: entry.index,
        id: entry.id,
        role: entry.role,
        timestamp: time,
        text: clean.textContent?.replace(/\s+/g, " ").trim() || "",
        markdown: domToMarkdown(clean),
        html: clean.innerHTML.trim()
      };
    }).filter((message) => message.text || message.markdown || message.html);

    return {
      title: getTitle(),
      url: location.href,
      exportedAt: new Date().toISOString(),
      messages
    };
  }

  function conversationKey() {
    return `${location.origin}${location.pathname.replace(/\/$/, "")}`;
  }

  function clearCompletedMessageSelection() {
    completedMessageSelection = null;
  }

  function currentCompletedMessageSelection(snapshot) {
    if (!completedMessageSelection) return null;
    if (completedMessageSelection.conversationKey !== conversationKey()) {
      clearCompletedMessageSelection();
      return null;
    }
    const availableIds = new Set((snapshot?.messages || []).map((message) => String(message.id)));
    const messageIds = completedMessageSelection.messageIds.filter((id) => availableIds.has(id));
    if (!messageIds.length) {
      clearCompletedMessageSelection();
      return null;
    }
    return { messageIds };
  }

  function selectionStyles() {
    return `
      .${SELECTION_TURN_CLASS} { position:relative !important; }
      .${SELECTION_TURN_CLASS}.${SELECTION_SELECTED_CLASS} { outline:2px solid #10a37f !important; outline-offset:-2px !important; background:color-mix(in srgb,#10a37f 7%,transparent) !important; }
      .${SELECTION_CONTROL_CLASS} { position:absolute !important; z-index:2147483645 !important; inset-block-start:10px !important; inset-inline-start:10px !important; display:flex !important; align-items:center !important; gap:7px !important; min-height:34px !important; margin:0 !important; padding:6px 10px !important; border:1px solid rgba(16,163,127,.45) !important; border-radius:999px !important; background:rgba(255,255,255,.96) !important; color:#16342c !important; box-shadow:0 4px 16px rgba(0,0,0,.14) !important; font:700 12px/1.2 ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif !important; cursor:pointer !important; user-select:none !important; -webkit-user-select:none !important; }
      .${SELECTION_CONTROL_CLASS}:focus-within { outline:3px solid rgba(16,163,127,.25) !important; }
      .${SELECTION_CONTROL_CLASS} input { appearance:none !important; display:grid !important; place-content:center !important; width:18px !important; height:18px !important; margin:0 !important; border:2px solid #71817c !important; border-radius:5px !important; background:#fff !important; cursor:pointer !important; }
      .${SELECTION_CONTROL_CLASS} input::before { content:"" !important; width:9px !important; height:9px !important; border-radius:2px !important; background:#fff !important; transform:scale(0) !important; transition:transform .1s ease-in-out !important; clip-path:polygon(14% 44%,0 59%,39% 100%,100% 20%,83% 5%,37% 70%) !important; }
      .${SELECTION_CONTROL_CLASS} input:checked { border-color:#087f5b !important; background:#087f5b !important; }
      .${SELECTION_CONTROL_CLASS} input:checked::before { transform:scale(1) !important; }
      #${SELECTION_TOOLBAR_ID} { position:fixed !important; z-index:2147483647 !important; right:24px !important; bottom:24px !important; width:min(440px,calc(100vw - 32px)) !important; padding:14px !important; border:1px solid rgba(255,255,255,.14) !important; border-radius:16px !important; background:#17211e !important; color:#f7faf9 !important; box-shadow:0 16px 50px rgba(0,0,0,.35) !important; font:13px/1.4 ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif !important; color-scheme:dark !important; }
      #${SELECTION_TOOLBAR_ID} * { box-sizing:border-box !important; font-family:inherit !important; }
      #${SELECTION_TOOLBAR_ID} header { display:flex !important; align-items:center !important; justify-content:space-between !important; gap:12px !important; margin:0 0 11px !important; }
      #${SELECTION_TOOLBAR_ID} strong { color:#fff !important; font-size:14px !important; }
      #${SELECTION_TOOLBAR_ID} output { color:#79dfba !important; font-size:12px !important; }
      #${SELECTION_TOOLBAR_ID} .chatgpt-exporter-selection-actions { display:grid !important; grid-template-columns:repeat(3,auto) 1fr auto !important; gap:7px !important; }
      #${SELECTION_TOOLBAR_ID} button { min-height:34px !important; margin:0 !important; padding:6px 11px !important; border:1px solid #46534f !important; border-radius:9px !important; background:#26322e !important; color:#eaf1ee !important; font-size:12px !important; font-weight:700 !important; cursor:pointer !important; }
      #${SELECTION_TOOLBAR_ID} button:hover { background:#33423d !important; }
      #${SELECTION_TOOLBAR_ID} button[data-action="done"] { border-color:#10a37f !important; background:#087f5b !important; color:#fff !important; }
      #${SELECTION_TOOLBAR_ID} button:disabled { cursor:not-allowed !important; opacity:.45 !important; }
      @media (max-width:600px) {
        .${SELECTION_CONTROL_CLASS} { inset-inline-start:5px !important; }
        #${SELECTION_TOOLBAR_ID} { right:16px !important; bottom:16px !important; }
        #${SELECTION_TOOLBAR_ID} .chatgpt-exporter-selection-actions { grid-template-columns:repeat(3,1fr) !important; }
        #${SELECTION_TOOLBAR_ID} button[data-action="cancel"], #${SELECTION_TOOLBAR_ID} button[data-action="done"] { grid-column:span 1 !important; }
      }
      @media (prefers-reduced-motion:reduce) { .${SELECTION_CONTROL_CLASS} input::before { transition:none !important; } }
    `;
  }

  function cleanupActiveMessageSelection() {
    const selection = activeMessageSelection;
    if (!selection) return;
    window.clearInterval(selection.routeTimer);
    document.removeEventListener("keydown", selection.keydownHandler, true);
    selection.controls.forEach(({ control, turn }) => {
      control.remove();
      turn.classList.remove(SELECTION_TURN_CLASS, SELECTION_SELECTED_CLASS);
    });
    selection.toolbar.remove();
    selection.style.remove();
    activeMessageSelection = null;
  }

  function updateActiveMessageSelection() {
    const selection = activeMessageSelection;
    if (!selection) return;
    selection.controls.forEach(({ input, turn, id }) => {
      const checked = selection.selectedIds.has(id);
      input.checked = checked;
      turn.classList.toggle(SELECTION_SELECTED_CLASS, checked);
    });
    const count = selection.selectedIds.size;
    selection.toolbar.querySelector("output").textContent = `已选 ${count} / ${selection.entries.length} 条`;
    selection.toolbar.querySelector('[data-action="done"]').disabled = count === 0;
  }

  function finishMessageSelection() {
    const selection = activeMessageSelection;
    if (!selection?.selectedIds.size) return;
    const messageIds = selection.entries
      .filter((entry) => selection.selectedIds.has(entry.id))
      .map((entry) => entry.id);
    completedMessageSelection = {
      conversationKey: selection.conversationKey,
      messageIds
    };
    cleanupActiveMessageSelection();
    showToast(`已选择 ${messageIds.length} 条消息，请再次点击扩展图标继续导出`);
  }

  function cancelMessageSelection() {
    clearCompletedMessageSelection();
    cleanupActiveMessageSelection();
    showToast("已取消逐条选择");
  }

  function startMessageSelection(initialMessageIds = []) {
    cleanupActiveMessageSelection();
    clearCompletedMessageSelection();
    const entries = getMessageEntries();
    if (!entries.length) throw new Error("当前页面没有检测到可选择的消息");

    const availableIds = new Set(entries.map((entry) => entry.id));
    const selectedIds = new Set(
      (Array.isArray(initialMessageIds) ? initialMessageIds : [])
        .map((id) => String(id || ""))
        .filter((id) => availableIds.has(id))
    );
    const style = document.createElement("style");
    style.id = SELECTION_STYLE_ID;
    style.textContent = selectionStyles();
    (document.head || document.documentElement).appendChild(style);

    const toolbar = document.createElement("aside");
    toolbar.id = SELECTION_TOOLBAR_ID;
    toolbar.setAttribute("aria-label", "消息选择工具栏");
    toolbar.innerHTML = `
      <header><strong>选择要导出的消息</strong><output aria-live="polite">已选 0 条</output></header>
      <div class="chatgpt-exporter-selection-actions">
        <button type="button" data-action="all">全选</button>
        <button type="button" data-action="invert">反选</button>
        <button type="button" data-action="none">清空</button>
        <button type="button" data-action="cancel">取消</button>
        <button type="button" data-action="done">完成选择</button>
      </div>`;
    document.documentElement.appendChild(toolbar);

    const controls = entries.map((entry) => {
      const control = document.createElement("label");
      control.className = SELECTION_CONTROL_CLASS;
      control.title = `选择第 ${entry.index} 条${core.roleLabel(entry.role)}消息`;
      const input = document.createElement("input");
      input.type = "checkbox";
      input.setAttribute("aria-label", control.title);
      const label = document.createElement("span");
      label.textContent = `#${entry.index} · ${core.roleLabel(entry.role)}`;
      control.append(input, label);
      control.addEventListener("click", (event) => event.stopPropagation());
      input.addEventListener("change", () => {
        if (input.checked) selectedIds.add(entry.id);
        else selectedIds.delete(entry.id);
        updateActiveMessageSelection();
      });
      entry.turn.classList.add(SELECTION_TURN_CLASS);
      entry.turn.appendChild(control);
      return { ...entry, control, input };
    });

    const keydownHandler = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      cancelMessageSelection();
    };
    activeMessageSelection = {
      conversationKey: conversationKey(),
      entries,
      controls,
      selectedIds,
      style,
      toolbar,
      keydownHandler,
      routeTimer: 0
    };
    activeMessageSelection.routeTimer = window.setInterval(() => {
      if (activeMessageSelection?.conversationKey === conversationKey()) return;
      clearCompletedMessageSelection();
      cleanupActiveMessageSelection();
    }, 500);
    document.addEventListener("keydown", keydownHandler, true);

    toolbar.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-action]");
      if (!button || !activeMessageSelection) return;
      event.stopPropagation();
      const action = button.dataset.action;
      if (action === "all") {
        entries.forEach((entry) => selectedIds.add(entry.id));
        updateActiveMessageSelection();
      } else if (action === "invert") {
        entries.forEach((entry) => {
          if (selectedIds.has(entry.id)) selectedIds.delete(entry.id);
          else selectedIds.add(entry.id);
        });
        updateActiveMessageSelection();
      } else if (action === "none") {
        selectedIds.clear();
        updateActiveMessageSelection();
      } else if (action === "cancel") {
        cancelMessageSelection();
      } else if (action === "done") {
        finishMessageSelection();
      }
    });

    updateActiveMessageSelection();
    return { count: entries.length, selectedCount: selectedIds.size };
  }

  function installPageExportButton() {
    if (document.getElementById(PAGE_BUTTON_ID)) return;

    const style = document.createElement("style");
    style.id = PAGE_BUTTON_STYLE_ID;
    style.textContent = `
      #${PAGE_BUTTON_ID} { position:fixed !important; z-index:2147483644 !important; top:68px !important; right:18px !important; display:inline-flex !important; align-items:center !important; justify-content:center !important; gap:7px !important; min-width:74px !important; min-height:38px !important; margin:0 !important; padding:8px 12px !important; border:1px solid rgba(8,127,91,.32) !important; border-radius:11px !important; background:rgba(255,255,255,.96) !important; color:#087f5b !important; box-shadow:0 7px 24px rgba(0,0,0,.14) !important; backdrop-filter:blur(12px) !important; font:750 13px/1 ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif !important; cursor:pointer !important; user-select:none !important; -webkit-user-select:none !important; transition:transform .12s ease,box-shadow .12s ease,background .12s ease !important; }
      #${PAGE_BUTTON_ID}[hidden] { display:none !important; }
      #${PAGE_BUTTON_ID}:hover { transform:translateY(-1px) !important; background:#ecf8f3 !important; box-shadow:0 9px 28px rgba(0,0,0,.17) !important; }
      #${PAGE_BUTTON_ID}:focus-visible { outline:3px solid rgba(16,163,127,.3) !important; outline-offset:2px !important; }
      #${PAGE_BUTTON_ID}:disabled { cursor:wait !important; opacity:.65 !important; transform:none !important; }
      #${PAGE_BUTTON_ID} svg { display:block !important; width:17px !important; height:17px !important; flex:0 0 auto !important; }
      @media (prefers-color-scheme:dark) { #${PAGE_BUTTON_ID} { border-color:rgba(25,195,125,.45) !important; background:rgba(33,33,33,.94) !important; color:#6ee7b7 !important; } #${PAGE_BUTTON_ID}:hover { background:#183c32 !important; } }
      @media (max-width:700px) { #${PAGE_BUTTON_ID} { top:60px !important; right:10px !important; min-width:40px !important; width:40px !important; height:40px !important; padding:0 !important; border-radius:50% !important; } #${PAGE_BUTTON_ID} span { display:none !important; } }
      @media (prefers-reduced-motion:reduce) { #${PAGE_BUTTON_ID} { transition:none !important; } }
    `;
    (document.head || document.documentElement).appendChild(style);

    const button = document.createElement("button");
    button.id = PAGE_BUTTON_ID;
    button.type = "button";
    button.hidden = true;
    button.title = "打开 ChatGPT 对话导出";
    button.setAttribute("aria-label", button.title);
    button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v11m0 0 4-4m-4 4-4-4M5 19h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg><span>导出</span>`;
    document.documentElement.appendChild(button);

    let visibilityTimer = 0;
    const updateVisibility = () => {
      window.clearTimeout(visibilityTimer);
      visibilityTimer = window.setTimeout(() => {
        button.hidden = getRoleNodes().length === 0;
      }, 120);
    };
    const observer = new MutationObserver(updateVisibility);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    updateVisibility();

    button.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      button.disabled = true;
      try {
        const response = await chrome.runtime.sendMessage({ type: "OPEN_EXPORT_POPUP" });
        if (!response?.ok) throw new Error(response?.error || "无法打开导出弹窗");
      } catch (error) {
        console.error("[ChatGPT Exporter] 无法打开弹窗", error);
        showToast("无法打开导出弹窗，请点击浏览器工具栏中的扩展图标", true);
      } finally {
        button.disabled = false;
      }
    });
  }

  function downloadText(content, filename, mimeType) {
    const blob = new Blob(["\ufeff", content], { type: `${mimeType};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.style.display = "none";
    (document.body || document.documentElement).appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }

  function showToast(message, isError = false) {
    document.getElementById("chatgpt-exporter-toast")?.remove();
    const toast = document.createElement("div");
    toast.id = "chatgpt-exporter-toast";
    toast.textContent = message;
    Object.assign(toast.style, {
      position: "fixed",
      right: "20px",
      bottom: "20px",
      zIndex: "2147483647",
      padding: "11px 16px",
      borderRadius: "10px",
      color: "#fff",
      background: isError ? "#b42318" : "#087f5b",
      boxShadow: "0 8px 28px rgba(0,0,0,.22)",
      font: "500 14px/1.4 system-ui, sans-serif"
    });
    document.documentElement.appendChild(toast);
    window.setTimeout(() => toast.remove(), 2600);
  }

  installPageExportButton();

  chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    try {
      if (request?.type === "PING") {
        sendResponse({ ok: true, title: getTitle(), messageCount: getRoleNodes().length });
        return;
      }

      if (request?.type === "EXTRACT_CONVERSATION") {
        const snapshot = extractSnapshot();
        const messageSelection = currentCompletedMessageSelection(snapshot);
        sendResponse({ ok: true, snapshot, messageSelection });
        if (request.consumeMessageSelection) clearCompletedMessageSelection();
        return;
      }

      if (request?.type === "START_MESSAGE_SELECTION") {
        const result = startMessageSelection(request.initialMessageIds);
        sendResponse({ ok: true, ...result });
        return;
      }

      if (request?.type === "CLEAR_MESSAGE_SELECTION") {
        clearCompletedMessageSelection();
        cleanupActiveMessageSelection();
        sendResponse({ ok: true });
        return;
      }

      if (request?.type === "DOWNLOAD_EXPORT") {
        downloadText(request.content, request.filename, request.mimeType || "text/plain");
        showToast(`已导出：${request.filename}`);
        sendResponse({ ok: true });
        return;
      }

      if (request?.type === "QUICK_EXPORT") {
        const snapshot = extractSnapshot();
        if (!snapshot.messages.length) throw new Error("当前页面没有检测到可导出的对话");
        const format = request.format === "html" ? "html" : "markdown";
        const isHtml = format === "html";
        const content = isHtml
          ? core.buildHtml(snapshot, request.options)
          : core.buildMarkdown(snapshot, request.options);
        const filename = core.createFilename(snapshot.title, isHtml ? "html" : "md");
        downloadText(content, filename, isHtml ? "text/html" : "text/markdown");
        showToast(`已导出 ${snapshot.messages.length} 条消息`);
        sendResponse({ ok: true, filename, count: snapshot.messages.length });
        return;
      }
    } catch (error) {
      console.error("[ChatGPT Exporter]", error);
      showToast(error.message || "导出失败", true);
      sendResponse({ ok: false, error: error.message || String(error) });
    }
  });
})();
