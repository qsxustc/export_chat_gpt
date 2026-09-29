(function initAssistantPage() {
  "use strict";
  if (globalThis.__chatGPTAssistantLoaded) return;
  const page = globalThis.ChatGPTExporterPage;
  const core = globalThis.ChatGPTAssistantCore;
  const UI = globalThis.ChatGPTAssistantUI;
  if (!page || !core || !UI) return;
  globalThis.__chatGPTAssistantLoaded = true;
  const UI_ATTR = "data-assistant-ui";
  const owned = (node) => (node?.nodeType === 1 ? node : node?.parentElement)?.closest?.(`[${UI_ATTR}]`);
  const host = document.createElement("chatgpt-assistant");
  host.setAttribute(UI_ATTR, "panel"); host.id = "chatgpt-assistant-root";
  const shadow = host.attachShadow({ mode: "closed" });
  const wrapperStyle = UI.el("style", { text: `
    :host { all:initial!important; position:relative!important; z-index:2147483643!important; }
    .launcher { position:fixed; right:14px; top:120px; border:1px solid #b5d6c7; border-radius:12px; background:#f2fbf6; color:#087f5b; padding:10px 13px; font:600 13px/1.4 system-ui,sans-serif; cursor:pointer; box-shadow:0 5px 20px #153d241f; }
    .launcher:focus-visible,.quote-trigger:focus-visible { outline:3px solid #20ac85; outline-offset:3px; }
    .panel { position:fixed; right:12px; top:70px; bottom:14px; width:360px; max-width:calc(100vw - 24px); }
    .quote-trigger { position:fixed; border:1px solid #8dd5b4; border-radius:9px; background:#087f5b; color:#fff; padding:7px 12px; font:600 13px/1.4 system-ui,sans-serif; cursor:pointer; box-shadow:0 4px 14px #0002; }
    .notice { position:fixed; right:14px; top:170px; max-width:min(320px,calc(100vw - 28px)); padding:12px; border:1px solid #b5d6c7; border-radius:12px; color:#174432; background:#f2fbf6; box-shadow:0 6px 20px #153d2420; font:13px/1.5 system-ui,sans-serif; }
    .notice button { margin-left:8px; padding:4px 7px; border:1px solid #b5d6c7; border-radius:6px; color:#087f5b; background:white; cursor:pointer; font:inherit; }
    [hidden] { display:none!important; }
    @media(max-width:1000px) { .panel { right:12px; top:64px; bottom:auto; height:min(620px,65vh); } }
    @media(prefers-color-scheme:dark) { .launcher { color:#8ce0bb; background:#20352b; border-color:#3e7057; } }
  ` });
  const launcher = UI.el("button", { class: "launcher", type: "button", text: "✦ 使用助手", "aria-expanded": "false", "aria-controls": "assistant-panel" });
  const panel = UI.el("div", { id: "assistant-panel", class: "panel", hidden: true });
  const quoteTrigger = UI.el("button", { class: "quote-trigger", type: "button", text: "引用追问 ↗", hidden: true });
  const notice = UI.el("div", { class: "notice", role: "status", "aria-live": "polite", hidden: true });
  let noticeTimer = 0;
  shadow.append(wrapperStyle, launcher, panel, quoteTrigger, notice);
  document.documentElement.append(host);
  const pageStyle = document.createElement("style");
  pageStyle.setAttribute(UI_ATTR, "style");
  pageStyle.textContent = `
    [data-cgpt-highlight] { outline:2px solid #19b48a!important; outline-offset:4px!important; border-radius:6px; }
    ::highlight(cgpt-search) { background:#ffe896; color:#262215; }
    ::highlight(cgpt-active) { background:#00bd85; color:#061e12; }
    [data-cgpt-collapsed=message] { max-height:160px!important; overflow:hidden!important; }
    pre[data-cgpt-collapsed=code] { max-height:96px!important; overflow:hidden!important; }
    html[data-cgpt-reading] :is([data-message-author-role],[data-markdown-text-style="assistant-message"],[data-content-search-unit-key$=":user"] .whitespace-pre-wrap) { font-size:var(--cgpt-font-size)!important; line-height:var(--cgpt-line-height)!important; }
    html[data-cgpt-reading] :is([data-message-author-role],[data-markdown-text-style="assistant-message"]) :is(p,li,blockquote) { font-size:inherit!important; line-height:inherit!important; }
    html[data-cgpt-reading] [data-cgpt-width] { max-width:var(--cgpt-width)!important; width:100%!important; }
    html[data-cgpt-focus-mode] :is(nav,aside):not([data-assistant-ui]) { display:none!important; }
    @media(min-width:1001px) { html[data-cgpt-panel] body { padding-right:386px!important; box-sizing:border-box!important; } }
    @media(prefers-reduced-motion:reduce) { [data-cgpt-highlight] { scroll-behavior:auto!important; } }
  `;
  (document.head || document.documentElement).append(pageStyle);
  let entries = [], prefs = core.settings(), ui, open = false, destroyed = false, revision = 0, refreshTimer = 0, refreshRunning = false, rerun = false;
  let route = page.conversationKey(), selectedQuote = "", undoState = null, composing = false, focusTimer = 0;
  let routeBaseline = new Map();
  let currentQuestionKey = "", lastSearch = { matches: [], total: 0 }, activeSearch = null;
  const cache = new WeakMap(), dirty = new WeakSet(), controls = new Map(), readingNodes = new Set();
  let keyCounter = 0, contentRevision = 0;
  function getComposer() {
    const selectors = ["#prompt-textarea", 'textarea[data-id="root"]', 'form textarea', '[contenteditable="true"][role="textbox"]'];
    return selectors.flatMap((selector) => [...document.querySelectorAll(selector)]).find((node) =>
      !owned(node) && node.getClientRects().length && !node.disabled && !node.readOnly && node.getAttribute("aria-disabled") !== "true"
      && (node.tagName === "TEXTAREA" || node.isContentEditable)) || null;
  }
  function composerText(node) { return node.tagName === "TEXTAREA" ? node.value : node.innerText; }
  function assertComposer(node) {
    if (!node || !node.isConnected || route !== page.conversationKey()) throw new Error("输入框不可用，请刷新页面或复制草稿后粘贴");
    if (composing) throw new Error("请先完成当前中文输入，再插入草稿");
  }
  async function insert(text) {
    const node = getComposer(); assertComposer(node);
    const before = composerText(node);
    if (undoState?.node === node && undoState.route === route && undoState.text === text && undoState.after === before) return false;
    const append = `${before.trim() ? "\n\n" : ""}${text}`;
    node.focus();
    if (node.tagName === "TEXTAREA") {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
      setter.call(node, before + append);
      node.dispatchEvent(new Event("input", { bubbles: true }));
      node.setSelectionRange(node.value.length, node.value.length);
      undoState = { node, before, after: node.value, text, route, kind: "textarea" };
    } else {
      // Browser editing commands preserve editor transactions/undo and notify React/ProseMirror.
      const selection = window.getSelection(), range = document.createRange();
      range.selectNodeContents(node); range.collapse(false);
      selection.removeAllRanges(); selection.addRange(range);
      if (!document.execCommand("insertText", false, append)) throw new Error("此输入框不支持安全插入，请使用“复制草稿”");
      const after = composerText(node);
      if (after === before) throw new Error("未能插入内容，请使用“复制草稿”");
      undoState = { node, before, after, text, route, kind: "rich" };
    }
    await new Promise((resolve) => requestAnimationFrame(resolve));
    if (composerText(node) !== undoState?.after) { undoState = null; throw new Error("输入框内容已变化，请检查草稿；也可复制后手动粘贴"); }
    if (window.innerWidth <= 1000) {
      setOpen(false, false); toast("已插入草稿，检查后可发送", "撤销", () => { undo(); toast("已撤销插入"); });
    }
    return true;
  }
  function undo() {
    const state = undoState;
    if (!state || state.route !== page.conversationKey()) throw new Error("当前会话没有可撤销的插入");
    assertComposer(state.node);
    if (composerText(state.node) !== state.after) throw new Error("插入后草稿已有修改，已保留你的输入；可使用输入框的撤销快捷键");
    state.node.focus();
    if (state.kind === "textarea") {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(state.node, state.before);
      state.node.dispatchEvent(new Event("input", { bubbles: true }));
    } else {
      if (!document.execCommand("undo") || composerText(state.node) !== state.before) {
        undoState = null; throw new Error("编辑器未能恢复完整草稿，请使用输入框原生撤销并检查内容");
      }
    }
    undoState = null;
  }
  function collectText(node) {
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, { acceptNode(text) {
      return text.parentElement?.closest('button,script,style,[data-assistant-ui],.sr-only,.katex-mathml') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
    } });
    const segments = []; let text = "", child;
    while ((child = walker.nextNode())) {
      if (!child.nodeValue) continue;
      segments.push({ node: child, start: text.length, end: text.length + child.nodeValue.length }); text += child.nodeValue;
    }
    return { text, segments };
  }
  function readEntry(entry) {
    let value = cache.get(entry.roleNode);
    const stableId = entry.roleNode.getAttribute("data-message-id") || entry.turn.getAttribute("data-message-id") || entry.id;
    if (!value || dirty.has(entry.roleNode) || value.stableId !== stableId) {
      const collected = collectText(entry.roleNode);
      value = { ...collected, version: ++contentRevision, fingerprint: core.fingerprint(collected.text), key: value?.key || `entry-${++keyCounter}`, stableId };
      cache.set(entry.roleNode, value); dirty.delete(entry.roleNode);
    }
    return { ...entry, ...value };
  }
  function styleControl(hostNode) {
    hostNode.setAttribute(UI_ATTR, "message-controls");
    const root = hostNode.attachShadow({ mode: "open" });
    root.append(UI.el("style", { text: `
      :host { display:block!important; margin:6px 0!important; } .row { display:flex; gap:8px; flex-wrap:wrap; }
      button { font:12px/1.4 system-ui,sans-serif; padding:4px 8px; border:1px solid #bcd5c9; border-radius:7px; color:#087f5b; background:#edf8f1; cursor:pointer; }
      button:focus-visible { outline:2px solid #0ca47c; outline-offset:2px; } button:disabled { opacity:.5; }
      @media(prefers-color-scheme:dark) { button { color:#8ad8b6; background:#223a2d; border-color:#3a6450; } }
    ` }));
    const row = UI.el("div", { class: "row" }); root.append(row); return row;
  }
  function actionButton(label, action) {
    return UI.el("button", { type: "button", text: label, onclick: async (event) => {
      event.stopPropagation(); const button = event.currentTarget;
      try { button.disabled = true; await action(button); }
      catch (error) { showError(error); }
      finally { button.disabled = false; }
    } });
  }
  function showError(error) { setOpen(true); ui.notify(error.message || "操作失败，请重试", true); }
  function isGenerating() { return !!document.querySelector('[data-testid="stop-button"],button[aria-label="Stop streaming"],button[aria-label="停止生成"]'); }
  function syncControls(entry) {
    let control = controls.get(entry.roleNode);
    if (!control || !control.host.isConnected) {
      control?.host.remove(); control?.code.forEach((item) => item.host.remove());
      const element = document.createElement("chatgpt-message-tools"), row = styleControl(element);
      control = { host: element, row, code: new Map(), star: null, fold: null, entry };
      controls.set(entry.roleNode, control);
    }
    control.entry = entry;
    if (prefs.modules.favorites) {
      if (!control.star) {
        control.star = actionButton("☆ 收藏", () => {
          if (isGenerating() && control.entry === entries.at(-1)) throw new Error("请等待当前回复生成完成后再收藏");
          return ui.saveFavorite(control.entry);
        });
        control.row.append(control.star);
      }
      const saved = ui?.isFavorite(entry); control.star.textContent = saved ? "★ 已收藏 / 备注" : "☆ 收藏";
      control.star.setAttribute("aria-label", `${saved ? "查看收藏" : "收藏"}第 ${entry.index} 条消息`);
    } else { control.star?.remove(); control.star = null; }
    const shouldFold = prefs.modules.reading && entry.text.length > 800;
    if (shouldFold && !control.fold) {
      control.fold = actionButton("折叠消息", (button) => {
        const collapsed = entry.roleNode.hasAttribute("data-cgpt-collapsed");
        if (collapsed) entry.roleNode.removeAttribute("data-cgpt-collapsed");
        else entry.roleNode.setAttribute("data-cgpt-collapsed", "message");
        button.textContent = collapsed ? "折叠消息" : "展开消息";
        button.setAttribute("aria-expanded", String(collapsed));
      }); control.fold.setAttribute("aria-expanded", "true"); control.row.append(control.fold);
    } else if (!shouldFold) {
      control.fold?.remove(); control.fold = null; entry.roleNode.removeAttribute("data-cgpt-collapsed");
    }
    if (control.row.children.length && !control.host.isConnected) entry.turn.append(control.host);
    if (!control.row.children.length) control.host.remove();
    const pres = prefs.modules.reading ? [...entry.roleNode.querySelectorAll("pre")].filter((pre) => pre.textContent.length > 300 || pre.textContent.split("\n").length > 8) : [];
    for (const [pre, item] of control.code) if (!pres.includes(pre)) { item.host.remove(); pre.removeAttribute("data-cgpt-collapsed"); control.code.delete(pre); }
    for (const pre of pres) {
      let item = control.code.get(pre);
      if (!item) {
        const element = document.createElement("chatgpt-code-tools"); const row = styleControl(element);
        const button = actionButton("折叠代码", () => {
          const collapsed = pre.hasAttribute("data-cgpt-collapsed");
          if (collapsed) pre.removeAttribute("data-cgpt-collapsed"); else pre.setAttribute("data-cgpt-collapsed", "code");
          button.textContent = collapsed ? "折叠代码" : "展开代码"; button.setAttribute("aria-expanded", String(collapsed));
        }); button.setAttribute("aria-expanded", "true"); row.append(button);
        item = { host: element, button }; control.code.set(pre, item);
      }
      if (!item.host.isConnected) pre.before(item.host);
    }
  }
  function removeControls(node, control) {
    control.host.remove(); control.code.forEach((item, pre) => { item.host.remove(); pre.removeAttribute("data-cgpt-collapsed"); });
    node.removeAttribute("data-cgpt-collapsed"); controls.delete(node);
  }
  function syncReading() {
    const html = document.documentElement;
    html.toggleAttribute("data-cgpt-reading", prefs.modules.reading);
    html.toggleAttribute("data-cgpt-focus-mode", prefs.modules.reading && prefs.reading.focus);
    if (prefs.modules.reading) {
      html.style.setProperty("--cgpt-width", `${prefs.reading.width}px`);
      html.style.setProperty("--cgpt-font-size", `${prefs.reading.fontSize}px`);
      html.style.setProperty("--cgpt-line-height", String(prefs.reading.lineHeight));
    } else for (const key of ["--cgpt-width", "--cgpt-font-size", "--cgpt-line-height"]) html.style.removeProperty(key);
    const next = new Set();
    if (prefs.modules.reading) for (const entry of entries) {
      const container = entry.roleNode.closest('[class*="thread-content-max-width"],[class*="max-w-"]') || entry.roleNode;
      container.setAttribute("data-cgpt-width", ""); next.add(container);
    }
    for (const node of readingNodes) if (!next.has(node)) { node.removeAttribute("data-cgpt-width"); readingNodes.delete(node); }
    next.forEach((node) => readingNodes.add(node));
  }
  function applySettings(settings, profile) {
    const quoteWasEnabled = prefs.modules.quote;
    prefs = settings;
    if (!prefs.modules.search) clearSearch();
    if (!prefs.modules.quote) { quoteTrigger.hidden = true; selectedQuote = ""; }
    if (quoteWasEnabled !== prefs.modules.quote) toggleQuoteListeners(prefs.modules.quote);
    syncReading(); entries.forEach(syncControls);
    if (profile) drafts.configure(profile);
  }
  function expandEntry(entry) {
    entry.roleNode.removeAttribute("data-cgpt-collapsed");
    const control = controls.get(entry.roleNode);
    if (control?.fold) { control.fold.textContent = "折叠消息"; control.fold.setAttribute("aria-expanded", "true"); }
    control?.code.forEach((item, pre) => { pre.removeAttribute("data-cgpt-collapsed"); item.button.textContent = "折叠代码"; item.button.setAttribute("aria-expanded", "true"); });
  }
  function entryFor(key) {
    const entry = entries.find((item) => item.key === key);
    if (!entry?.roleNode.isConnected || route !== page.conversationKey()) throw new Error("消息已变化，请等待目录刷新后重试");
    return entry;
  }
  function jump(key) {
    const entry = entryFor(key); expandEntry(entry);
    document.querySelectorAll("[data-cgpt-highlight]").forEach((node) => node.removeAttribute("data-cgpt-highlight"));
    entry.roleNode.setAttribute("data-cgpt-highlight", "");
    entry.roleNode.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion:reduce)").matches ? "instant" : "smooth", block: "center" });
    clearTimeout(focusTimer); focusTimer = setTimeout(() => entry.roleNode.removeAttribute("data-cgpt-highlight"), 1600);
    if (entry.role === "user") currentQuestionKey = entry.key;
    if (open && window.innerWidth <= 1000) setTimeout(() => { if (!destroyed) setOpen(false); }, 0);
    return entry;
  }
  function stepQuestion(direction) {
    const questions = entries.filter((entry) => entry.role === "user"); if (!questions.length) return;
    let index = questions.findIndex((entry) => entry.key === currentQuestionKey);
    if (index < 0) index = questions.findIndex((entry) => entry.roleNode.getBoundingClientRect().bottom > 90) - (direction > 0 ? 1 : 0);
    jump(questions[Math.min(questions.length - 1, Math.max(0, index + direction))].key);
  }
  function rangeFor(match) {
    const entry = entries.find((item) => item.key === match.key); if (!entry) return null;
    const first = entry.segments.find((segment) => segment.end > match.start);
    const last = entry.segments.find((segment) => segment.end >= match.end);
    if (!first?.node.isConnected || !last?.node.isConnected) return null;
    try {
      const range = document.createRange(); range.setStart(first.node, match.start - first.start); range.setEnd(last.node, match.end - last.start); return range;
    } catch { return null; }
  }
  function highlightResults() {
    if (!globalThis.CSS?.highlights || typeof Highlight === "undefined") return;
    const ranges = lastSearch.matches.map(rangeFor).filter(Boolean);
    CSS.highlights.set("cgpt-search", new Highlight(...ranges));
    const active = activeSearch && rangeFor(activeSearch);
    if (active) CSS.highlights.set("cgpt-active", new Highlight(active)); else CSS.highlights.delete("cgpt-active");
  }
  function clearSearch() {
    lastSearch = { matches: [], total: 0 }; activeSearch = null;
    globalThis.CSS?.highlights?.delete("cgpt-search"); globalThis.CSS?.highlights?.delete("cgpt-active");
  }
  function search(query, role) { lastSearch = core.search(entries, query, role); highlightResults(); return lastSearch; }
  function jumpMatch(match) {
    const entry = jump(match.key); activeSearch = match; highlightResults();
    const range = rangeFor(match);
    const element = range?.startContainer.parentElement;
    if (element && element !== entry.roleNode) element.scrollIntoView({ block: "center", behavior: "instant" });
  }
  function snapshot(entry) {
    entry = entryFor(entry.key);
    dirty.add(entry.roleNode);
    entry = readEntry({ ...entry, role: entry.roleNode.getAttribute("data-message-author-role") || entry.role });
    if (!entry.text.trim()) throw new Error("该消息没有可保存的文本内容");
    const clean = page.cleanClone(entry.roleNode);
    return { title: page.getTitle().slice(0, 500), url: page.conversationKey(), messageId: entry.stableId,
      role: entry.role, text: entry.text, markdown: page.domToMarkdown(clean), fingerprint: core.fingerprint(entry.text) };
  }
  function locateFavorite(item) {
    if (page.conversationKey() !== item.url) throw new Error("请先打开下方来源会话，再在助手收藏中定位原消息");
    const candidates = entries.filter((entry) => entry.role === item.role && entry.text === item.text && core.fingerprint(entry.text) === item.fingerprint);
    // The newer page no longer exposes a message UUID for user turns. A unique
    // exact-content match still lets an older bookmark locate its source.
    const exact = candidates.find((entry) => entry.stableId === item.messageId)
      || (candidates.length === 1 ? candidates[0] : null);
    if (!exact) throw new Error("原消息已变化、尚未加载或无法唯一定位；保存的快照仍可阅读和导出");
    if (collectText(exact.roleNode).text !== item.text) throw new Error("原消息刚刚变化，请等待页面更新后重试；此处快照仍可查看");
    jump(exact.key);
  }
  function positionPanel() {
    if (!open) return;
    if (window.innerWidth <= 1000) {
      const top = getComposer()?.getBoundingClientRect().top;
      const available = Number.isFinite(top) ? top - 80 : window.innerHeight - 140;
      panel.style.height = `${Math.max(140, Math.min(620, available))}px`;
    } else panel.style.removeProperty("height");
  }
  function toast(text, actionLabel, action) {
    clearTimeout(noticeTimer); notice.replaceChildren(document.createTextNode(text)); notice.hidden = false;
    if (actionLabel) notice.append(UI.el("button", { type: "button", text: actionLabel, onclick: () => {
      notice.hidden = true; try { action(); } catch (error) { showError(error); }
    } }));
    noticeTimer = setTimeout(() => { notice.hidden = true; }, actionLabel ? 8000 : 4000);
  }
  function setOpen(value, restoreFocus = true) {
    const wasOpen = open;
    open = value; panel.hidden = !value; launcher.hidden = value;
    launcher.setAttribute("aria-expanded", String(value)); document.documentElement.toggleAttribute("data-cgpt-panel", value);
    if (value) { notice.hidden = true; positionPanel(); ui?.opened(); if (!wasOpen) panel.querySelector('[aria-selected="true"]')?.focus(); }
    else { ui?.close(); if (restoreFocus) launcher.focus(); }
  }
  function captureQuote() {
    if (!prefs.modules.quote) return;
    const selection = window.getSelection();
    if (!selection?.rangeCount || selection.isCollapsed) { quoteTrigger.hidden = true; return; }
    const range = selection.getRangeAt(0);
    const start = range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement;
    const end = range.endContainer.nodeType === 1 ? range.endContainer : range.endContainer.parentElement;
    const message = start?.closest('[data-message-author-role="assistant"],[data-content-search-unit-key$=":assistant"],section[data-turn="assistant"]');
    if (!message || !message.contains(end) || owned(start) || owned(end)) { quoteTrigger.hidden = true; return; }
    selectedQuote = selection.toString();
    if (!selectedQuote.trim()) { quoteTrigger.hidden = true; return; }
    const rect = range.getBoundingClientRect();
    quoteTrigger.style.left = `${Math.min(window.innerWidth - 130, Math.max(8, rect.left))}px`;
    quoteTrigger.style.top = `${Math.min(window.innerHeight - 50, Math.max(8, rect.bottom + 8))}px`;
    quoteTrigger.hidden = false;
  }
  function onQuoteKey(event) { if (event.key === "Shift" || event.key.startsWith("Arrow")) captureQuote(); }
  function hideQuote() { quoteTrigger.hidden = true; }
  function toggleQuoteListeners(enabled) {
    const method = enabled ? "addEventListener" : "removeEventListener";
    document[method]("mouseup", captureQuote);
    document[method]("keyup", onQuoteKey);
    document[method]("scroll", hideQuote, true);
  }
  quoteTrigger.addEventListener("mousedown", (event) => event.preventDefault());
  quoteTrigger.addEventListener("click", () => { quoteTrigger.hidden = true; setOpen(true); ui.quote(selectedQuote); });
  launcher.addEventListener("click", () => setOpen(true));
  shadow.addEventListener("keydown", (event) => {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setOpen(false); }
  });
  const onDocumentKey = (event) => {
    if (event.key === "Escape" && !document.getElementById("chatgpt-exporter-selection-toolbar")) {
      quoteTrigger.hidden = true; if (open) { event.preventDefault(); setOpen(false); }
    }
  };
  const onCompositionStart = () => { composing = true; };
  const onCompositionEnd = () => { composing = false; };
  const onWheel = () => { currentQuestionKey = ""; };
  document.addEventListener("keydown", onDocumentKey);
  document.addEventListener("compositionstart", onCompositionStart, true);
  document.addEventListener("compositionend", onCompositionEnd, true);
  window.addEventListener("resize", positionPanel);
  document.addEventListener("wheel", onWheel, { passive: true });
  toggleQuoteListeners(true);
  function syncTheme() {
    const dark = document.documentElement.classList.contains("dark") || document.documentElement.dataset.theme === "dark";
    const light = document.documentElement.classList.contains("light") || document.documentElement.dataset.theme === "light";
    ui?.setTheme(dark ? "dark" : light ? "light" : "system");
  }
  function scheduleRefresh() {
    if (destroyed || refreshTimer) return;
    refreshTimer = setTimeout(() => { refreshTimer = 0; refresh().catch(showError); }, 140);
  }
  async function refresh() {
    if (destroyed) return;
    checkRoute();
    if (refreshRunning) { rerun = true; return; }
    refreshRunning = true; const currentRevision = revision;
    try {
      const raw = page.getMessageEntries(), next = [];
      for (let index = 0; index < raw.length; index += 1) {
        const entry = readEntry(raw[index]);
        const previous = routeBaseline.get(entry.roleNode);
        if (!previous || previous.text !== entry.text || previous.id !== entry.stableId) {
          routeBaseline.delete(entry.roleNode); next.push(entry);
        }
        if (index && index % 100 === 0) {
          await new Promise((resolve) => setTimeout(resolve, 0));
          if (destroyed || checkRoute() || currentRevision !== revision) return;
        }
      }
      entries = next;
      for (const node of routeBaseline.keys()) if (!node.isConnected) routeBaseline.delete(node);
      const nodes = new Set(entries.map((entry) => entry.roleNode));
      for (const [node, control] of controls) if (!nodes.has(node)) removeControls(node, control);
      syncReading();
      entries.forEach((entry) => {
        const control = controls.get(entry.roleNode);
        if (!control || control.entry.version !== entry.version || ((control.star || control.fold) && !control.host.isConnected)) syncControls(entry);
        else control.entry = entry;
      });
      ui?.live(); positionPanel(); syncTheme();
    } finally {
      refreshRunning = false;
      if (rerun || currentRevision !== revision) { rerun = false; scheduleRefresh(); }
    }
  }
  const observer = new MutationObserver((records) => {
    let changed = false;
    for (const record of records) {
      if (owned(record.target)) continue;
      if (record.type === "childList" && [...record.addedNodes, ...record.removedNodes].every((node) => owned(node))) continue;
      const target = record.target.nodeType === 1 ? record.target : record.target.parentElement;
      if (!target || (!target.closest("main,article,[data-message-author-role],[data-content-search-unit-key]") && ![...record.addedNodes].some((node) => node.nodeType === 1 && (node.matches("main,article,[data-message-author-role],[data-content-search-unit-key]") || node.querySelector("main,article,[data-message-author-role],[data-content-search-unit-key]"))))) continue;
      const turn = target.closest("[data-content-search-unit-key],section[data-turn],[data-message-author-role]");
      const entry = turn && entries.find((item) => item.turn === turn || item.roleNode === turn);
      if (entry) dirty.add(entry.roleNode);
      changed = true;
    }
    if (changed) scheduleRefresh();
  });
  observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["data-message-id", "data-message-author-role", "data-content-search-unit-key", "data-turn"] });
  const themeObserver = new MutationObserver(syncTheme);
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme"] });
  function checkRoute() {
    const nextRoute = page.conversationKey();
    if (nextRoute === route) return false;
    routeBaseline = /\/c\//.test(route) ? new Map(entries.map((entry) => [entry.roleNode, { text: entry.text, id: entry.stableId }])) : new Map();
    entries.forEach((entry) => dirty.add(entry.roleNode));
    route = nextRoute; revision += 1; entries = []; undoState = null; selectedQuote = ""; currentQuestionKey = "";
    quoteTrigger.hidden = true; clearSearch();
    for (const [node, control] of controls) removeControls(node, control);
    ui?.routeChanged(); return true;
  }
  const routeTimer = setInterval(() => { if (checkRoute()) scheduleRefresh(); }, 350);
  const drafts = globalThis.ChatGPTAssistantDrafts.mount({
    composer: getComposer, text: composerText, url: () => page.conversationKey(), title: () => page.getTitle(),
    messages: () => page.getMessageEntries(), insert,
    changed: () => ui?.draftsChanged(), error: showError
  });
  ui = UI.mount(panel, {
    entries: () => entries, url: () => page.conversationKey(), search, clearSearch, jump, jumpMatch, stepQuestion, snapshot, locateFavorite,
    bottom: () => { if (entries.length) entries.at(-1).turn.scrollIntoView({ block: "end", behavior: "instant" }); },
    expandAll: () => entries.forEach(expandEntry), applySettings, insert, undo, canUndo: () => !!undoState,
    isOpen: () => open, toast, draftCount: drafts.count, restoreDraft: drafts.restore,
    clearUndo: () => { undoState = null; }, open: () => setOpen(true), close: () => setOpen(false)
  });
  const onRuntimeMessage = (request, _sender, respond) => {
    if (request?.type !== "OPEN_ASSISTANT") return;
    ui.ready.then(() => { setOpen(true); if (request.tab) ui.openTab(request.tab); respond({ ok: true }); }); return true;
  };
  chrome.runtime.onMessage.addListener(onRuntimeMessage);
  ui.ready.then(() => { syncTheme(); scheduleRefresh(); });
  // Expose lifecycle only inside the extension's isolated world, for reloads and fixture tests.
  globalThis.ChatGPTAssistantPage = {
    root: shadow, refresh, entries: () => entries, open: setOpen, insert, undo, search, snapshot, locateFavorite,
    destroy() {
      destroyed = true; globalThis.__chatGPTAssistantLoaded = false;
      drafts.destroy();
      document.removeEventListener("keydown", onDocumentKey);
      document.removeEventListener("compositionstart", onCompositionStart, true);
      document.removeEventListener("compositionend", onCompositionEnd, true);
      document.removeEventListener("wheel", onWheel);
      chrome.runtime.onMessage.removeListener(onRuntimeMessage);
      document.querySelectorAll("[data-cgpt-highlight]").forEach((node) => node.removeAttribute("data-cgpt-highlight"));
      routeBaseline.clear();
      clearTimeout(noticeTimer); observer.disconnect(); themeObserver.disconnect(); clearInterval(routeTimer); clearTimeout(refreshTimer); clearTimeout(focusTimer);
      toggleQuoteListeners(false); window.removeEventListener("resize", positionPanel); clearSearch();
      entries.forEach(expandEntry); for (const [node, control] of controls) removeControls(node, control);
      for (const node of readingNodes) node.removeAttribute("data-cgpt-width");
      for (const attr of ["data-cgpt-panel", "data-cgpt-reading", "data-cgpt-focus-mode"]) document.documentElement.removeAttribute(attr);
      for (const key of ["--cgpt-width", "--cgpt-font-size", "--cgpt-line-height"]) document.documentElement.style.removeProperty(key);
      ui.destroy(); host.remove(); pageStyle.remove();
    }
  };
})();
