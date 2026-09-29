(function initAssistantUI(global) {
  "use strict";
  if (global.ChatGPTAssistantUI) return;
  const core = global.ChatGPTAssistantCore;
  const names = { outline: "目录", search: "搜索", templates: "模板", quote: "追问", favorites: "收藏", drafts: "草稿", reading: "阅读", settings: "设置" };
  const css = `
    :host { all:initial; color-scheme:light dark; font:14px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
    * { box-sizing:border-box; } [hidden] { display:none!important; }
    .assistant { --bg:#fff; --surface:#f4f7f6; --ink:#213b33; --muted:#61746d; --line:#dce7e1; --accent:#087f5b; --soft:#e7f5ef; color:var(--ink); background:var(--bg); font:14px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; border:1px solid var(--line); border-radius:18px; overflow:hidden; display:flex; flex-direction:column; height:100%; box-shadow:0 12px 40px #142d211c; }
    .assistant[data-theme=dark] { --bg:#1c2421; --surface:#26312b; --ink:#e6f2eb; --muted:#a4b7ab; --line:#394b40; --accent:#77ddb3; --soft:#284b3a; color-scheme:dark; }
    @media(prefers-color-scheme:dark) { .assistant:not([data-theme=light]) { --bg:#1c2421; --surface:#26312b; --ink:#e6f2eb; --muted:#a4b7ab; --line:#394b40; --accent:#77ddb3; --soft:#284b3a; color-scheme:dark; } }
    .assistant header { padding:12px 14px 10px; border-bottom:1px solid var(--line); flex-shrink:0; }
    .brand { display:flex; align-items:center; justify-content:space-between; gap:8px; } .brand strong { font-size:16px; letter-spacing:.3px; }
    .eyebrow { color:var(--accent); font-size:10px; letter-spacing:1.7px; font-weight:700; }
    .row { display:flex; gap:8px; align-items:center; flex-wrap:wrap; } .spread { justify-content:space-between; } .stack { display:grid; gap:10px; }
    .space-row { margin-top:12px; display:flex; align-items:center; gap:8px; color:var(--muted); font-size:12px; }
    .space-row select { flex:1; min-width:0; padding:5px 8px; }
    nav { display:flex; gap:2px; flex-wrap:wrap; padding:10px 8px; border-bottom:1px solid var(--line); flex-shrink:0; }
    button,input,textarea,select { font:inherit; } button { color:var(--ink); background:var(--surface); border:1px solid var(--line); border-radius:9px; padding:7px 10px; cursor:pointer; line-height:1.4; }
    button:hover { border-color:var(--accent); } button:disabled { opacity:.45; cursor:not-allowed; } button.primary,button[aria-pressed=true] { background:var(--soft); border-color:var(--accent); color:var(--accent); }
    button.danger { color:#cc4040; } button.small { padding:4px 8px; font-size:12px; }
    button:focus-visible,input:focus-visible,textarea:focus-visible,select:focus-visible,summary:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
    nav button { background:transparent; border-color:transparent; font-size:12px; padding:6px 7px; }
    main { min-height:0; flex:1; overflow:auto; padding:14px 16px 22px; overscroll-behavior:contain; }
    h2 { font-size:16px; margin:0 0 10px; } h3 { font-size:14px; margin:10px 0; } p { margin:5px 0 12px; } .hint { color:var(--muted); font-size:12px; }
    input:not([type=checkbox]),textarea,select { width:100%; border:1px solid var(--line); border-radius:8px; background:var(--bg); color:var(--ink); padding:8px 10px; min-width:0; }
    textarea { resize:vertical; min-height:90px; line-height:1.6; } input[type=checkbox] { accent-color:var(--accent); width:16px; height:16px; flex-shrink:0; }
    label.field { display:grid; gap:5px; font-size:12px; color:var(--muted); margin:10px 0; } label.check { display:flex; align-items:center; gap:8px; padding:8px 0; }
    .card { border:1px solid var(--line); border-radius:11px; padding:12px; background:var(--surface); overflow-wrap:anywhere; }
    .card h3 { margin:0 0 6px; } .card p { font-size:12px; color:var(--muted); margin:5px 0; } .card .row { margin-top:9px; }
    .item { display:block; width:100%; text-align:left; background:var(--bg); margin-bottom:6px; } .item { display:-webkit-box; -webkit-box-orient:vertical; -webkit-line-clamp:3; overflow:hidden; } .item.active { border-color:var(--accent); background:var(--soft); }
    .badge { color:var(--accent); font-size:11px; font-weight:600; } .snippet { white-space:pre-wrap; font-size:12px; }
    .snapshot { white-space:pre-wrap; max-height:320px; overflow:auto; font-size:13px; margin:10px 0; }
    .empty { padding:24px 8px; text-align:center; color:var(--muted); } .empty strong { display:block; color:var(--ink); margin-bottom:8px; }
    .status { padding:10px 16px; border-top:1px solid var(--line); font-size:12px; color:var(--accent); flex-shrink:0; max-height:140px; overflow:auto; } .status:empty { display:none; } .status.error { color:#dc6464; }
    .draft { margin-top:14px; padding:12px; border:1px solid var(--accent); border-radius:12px; background:var(--soft); } .draft textarea { min-height:125px; } .draft-actions { position:sticky; bottom:-22px; padding:10px 0; background:var(--soft); }
    details { margin:10px 0; } summary { cursor:pointer; color:var(--accent); } .count { color:var(--muted); font-size:12px; margin-top:5px; }
    .switch-grid { display:grid; grid-template-columns:1fr 1fr; } a { color:var(--accent); } hr { border:0; border-top:1px solid var(--line); margin:16px 0; }
    @media(prefers-reduced-motion:reduce) { *,*::before,*::after { scroll-behavior:auto!important; animation:none!important; transition:none!important; } }
  `;
  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [name, value] of Object.entries(attrs)) {
      if (name === "text") node.textContent = value;
      else if (name.startsWith("on")) node.addEventListener(name.slice(2), value);
      else if (["value", "checked", "disabled", "hidden"].includes(name)) node[name] = value;
      else node.setAttribute(name, value);
    }
    for (const child of children.flat()) if (child !== null && child !== undefined) node.append(child);
    return node;
  }
  const field = (label, input) => el("label", { class: "field" }, el("span", { text: label }), input);
  const hint = (text) => el("p", { class: "hint", text });
  const empty = (title, text) => el("div", { class: "empty" }, el("strong", { text: title }), text || "");
  const row = (...nodes) => el("div", { class: "row" }, ...nodes);
  const short = (text, limit = 100) => text.replace(/\s+/g, " ").slice(0, limit);
  async function rpc(action) {
    const response = await chrome.runtime.sendMessage({ type: "ASSISTANT_DATA", action });
    if (!response?.ok) throw new Error(response?.error || "无法连接扩展，请刷新页面后重试");
    return response.data;
  }
  function download(content, filename, type = "application/json") {
    const url = URL.createObjectURL(new Blob([content], { type: `${type};charset=utf-8` }));
    const link = el("a", { href: url, download: filename });
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function copy(text) {
    await navigator.clipboard.writeText(text);
  }
  function mount(root, adapter = null) {
    let data = null, profileId = "default", tab = adapter ? "outline" : "templates";
    let quoted = "", searchQuery = "", searchRole = "all", searchResult = { matches: [], total: 0 }, activeMatch = -1;
    let templateFilter = "", templateCategory = "all", onlyCommon = false, favoriteFilter = "";
    let favoriteIndex = new Map(), outlineSignature = "";
    const views = new Map(), editDrafts = new Map();
    let activeView = null, firstOpen = true, requestedTab = false, statusTimer = 0;
    let searchTimer = 0, undoDelete = null, pendingBackup = null, disposed = false;
    try {
      profileId = sessionStorage.getItem("chatgpt-assistant-space") || "default";
      const previousTab = sessionStorage.getItem(adapter ? "chatgpt-assistant-tab" : "chatgpt-assistant-options-tab");
      if (previousTab && Object.hasOwn(names, previousTab) && (adapter || ["templates", "favorites", "drafts", "reading", "settings"].includes(previousTab))) { tab = previousTab; requestedTab = true; }
    } catch { /* storage may be blocked */ }
    const style = el("style", { text: css });
    const shell = el("section", { class: "assistant", "aria-label": "ChatGPT 使用增强助手" });
    const status = el("div", { class: "status", role: "status", "aria-live": "polite" });
    function notify(text, error = false, extra = null) {
      clearTimeout(statusTimer);
      status.classList.toggle("error", error); status.replaceChildren(document.createTextNode(text));
      if (extra) status.append(" ", extra);
      if (!error && !extra) statusTimer = setTimeout(() => status.replaceChildren(), 4200);
    }
    function button(text, fn, attrs = {}) {
      return el("button", { type: "button", ...attrs, text, onclick: async (event) => {
        const target = event.currentTarget; let awaiting = false;
        try {
          const result = fn(event);
          if (result?.then) { awaiting = true; target.dataset.busy = "true"; target.disabled = true; await result; }
        }
        catch (error) { notify(error.message || "操作失败，请重试", true); }
        finally { if (awaiting) { delete target.dataset.busy; if (target.isConnected) target.disabled = target.dataset.blocked === "true" || attrs.disabled === true; } }
      } });
    }
    const title = el("strong", { text: "ChatGPT 使用助手" });
    const count = el("div", { class: "count", text: "本地处理 · 正在载入" });
    const exportButton = button("导出 ↗", async () => {
      const result = await chrome.runtime.sendMessage({ type: "OPEN_EXPORT_POPUP" });
      if (!result?.ok) throw new Error(result?.error || "请点击浏览器扩展图标导出");
    }, { class: "small", hidden: !adapter });
    const headerActions = row(exportButton);
    const recoverButton = button("恢复草稿", () => activate("drafts", { fresh: true }), { class: "small", hidden: true });
    if (adapter) headerActions.append(button("收起", () => adapter.close(), { class: "small" }));
    const spaceSelect = el("select", { "aria-label": "当前资料空间", onchange: () => {
      stashView();
      profileId = spaceSelect.value;
      try { sessionStorage.setItem("chatgpt-assistant-space", profileId); } catch { /* optional preference */ }
      quoted = ""; undoDelete = null; pendingBackup = null;
      adapter?.clearUndo(); adapter?.clearSearch();
      apply(); restoreView(); notify(`已切换到「${current().name}」`);
    } });
    const header = el("header", {},
      el("div", { class: "brand" }, title, headerActions), count,
      el("div", { class: "space-row" }, el("span", { text: "资料空间" }), spaceSelect));
    const nav = el("nav", { "aria-label": "助手功能", role: "tablist" });
    const main = el("main", { tabindex: "-1", id: "assistant-view", role: "tabpanel" });
    shell.append(header, recoverButton, nav, main, status); root.append(style, shell);
    function current() { return data?.profiles.find((item) => item.id === profileId) || data?.profiles[0]; }
    function enabled(key) { return current()?.settings.modules[key] !== false; }
    function updateSpaces() {
      if (!data.profiles.some((item) => item.id === profileId)) profileId = data.profiles[0].id;
      spaceSelect.replaceChildren(...data.profiles.map((item) => el("option", { value: item.id, text: item.name })));
      spaceSelect.value = profileId;
      spaceSelect.parentElement.hidden = data.profiles.length < 2;
    }
    function apply() {
      updateSpaces();
      favoriteIndex = new Map(current().favorites.map((item) => [`${item.url}\0${item.role}\0${item.messageId}\0${item.fingerprint}`, item]));
      adapter?.applySettings(current().settings, current());
      syncDraftSettings();
      if (activeView && !enabled(tab) && tab !== "settings") activate("settings");
      renderNav(); updateCount();
    }
    async function mutate(action, message = "已保存") {
      const space = action.profileId || profileId;
      const updated = await rpc({ profileId, ...action });
      if (["restore", "clearProfile"].includes(action.op)) for (const cache of [views, editDrafts]) for (const key of cache.keys()) if (key.startsWith(`${space}:`)) cache.delete(key);
      if (!data || updated.revision >= data.revision) data = updated;
      apply();
      if (message) notify(message);
    }
    function updateCount() {
      const entries = adapter?.entries() || [];
      count.textContent = adapter ? `当前已加载 ${entries.length} 条消息 · 仅本地处理` : "本地资料管理 · 不上传聊天内容";
      exportButton.dataset.blocked = String(!entries.length);
      exportButton.disabled = !entries.length || exportButton.dataset.busy === "true";
      const drafts = adapter?.draftCount?.() || 0;
      recoverButton.hidden = !enabled("drafts") || !drafts;
      recoverButton.textContent = `恢复草稿（${drafts}）`;
    }
    function syncDraftSettings() {
      const checkbox = main.querySelector('[aria-label="启用草稿"]');
      if (checkbox) checkbox.checked = enabled("drafts");
      const retention = main.querySelector('[aria-label="草稿保留时间"]');
      if (retention) retention.value = String(current().settings.drafts.retentionDays);
    }
    function tabs() { return adapter ? Object.keys(names) : ["templates", "favorites", "drafts", "reading", "settings"]; }
    function viewKey(key = tab) { return `${profileId}:${key}`; }
    function stashView() {
      if (!activeView || !main.childNodes.length) return;
      activeView.scroll = main.scrollTop;
      activeView.content = document.createDocumentFragment();
      activeView.content.append(...main.childNodes);
      views.set(activeView.key, activeView);
    }
    function setScreen(...nodes) {
      activeView = { key: viewKey(), scroll: 0 };
      views.delete(activeView.key);
      main.replaceChildren(...nodes); main.scrollTop = 0;
    }
    function finishView(view) {
      if (activeView === view) render();
      else if (views.get(view.key) === view) views.delete(view.key);
    }
    function restoreView() {
      const saved = views.get(viewKey());
      if (!saved) { render(); return; }
      activeView = saved; views.delete(saved.key);
      main.replaceChildren(saved.content); main.scrollTop = saved.scroll;
      if (tab === "search") {
        searchQuery = main.querySelector('input[type="search"]').value;
        searchRole = main.querySelector('select').value;
      } else if (tab === "templates" && main.querySelector("#template-list")) {
        templateFilter = main.querySelector('input[type="search"]').value;
        templateCategory = main.querySelector('select').value;
        onlyCommon = main.querySelector('input[type="checkbox"]').checked;
      } else if (tab === "favorites" && main.querySelector("#favorite-list")) {
        favoriteFilter = main.querySelector('input[type="search"]').value;
      } else if (tab === "settings") {
        for (const key of core.MODULES) {
          const checkbox = main.querySelector(`[aria-label="启用${names[key]}"]`);
          if (checkbox) checkbox.checked = enabled(key);
        }
      }
      if (tab === "drafts") renderDrafts();
      if (tab === "settings") syncDraftSettings();
      outlineSignature = ""; renderNav(); live(); updateTemplates(); updateFavorites();
    }
    function activate(key, { fresh = false, focus = false } = {}) {
      if (!tabs().includes(key)) return;
      if (key !== "settings" && !enabled(key)) key = "settings";
      requestedTab = true;
      if (!fresh && key === tab && activeView?.key === viewKey()) {
        if (key === "search") main.querySelector('input[type="search"]')?.focus();
        return;
      }
      if (tab === "search") { clearTimeout(searchTimer); adapter?.clearSearch(); }
      stashView(); tab = key;
      try { sessionStorage.setItem(adapter ? "chatgpt-assistant-tab" : "chatgpt-assistant-options-tab", tab); } catch { /* optional */ }
      if (fresh) views.delete(viewKey());
      restoreView();
      if (focus === "tab") nav.querySelector('[aria-selected="true"]')?.focus();
      else if (tab === "search") main.querySelector('input[type="search"]')?.focus();
      else main.focus({ preventScroll: true });
    }
    function renderNav() {
      nav.replaceChildren(...tabs().map((key) => button(names[key], () => activate(key), {
        role: "tab", id: `assistant-tab-${key}`, "aria-controls": "assistant-view",
        "aria-selected": String(tab === key), "aria-pressed": String(tab === key), tabindex: tab === key ? "0" : "-1",
        disabled: key !== "settings" && !enabled(key)
      })));
      main.setAttribute("aria-labelledby", `assistant-tab-${tab}`);
    }
    nav.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const available = tabs().filter((key) => key === "settings" || enabled(key));
      const currentIndex = available.indexOf(tab);
      const index = event.key === "Home" ? 0 : event.key === "End" ? available.length - 1
        : (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + available.length) % available.length;
      activate(available[index], { focus: "tab" });
    });
    function render() {
      if (!enabled(tab) && tab !== "settings") tab = "settings";
      renderNav(); setScreen();
      if (!data) return;
      ({ outline: renderOutline, search: renderSearch, templates: renderTemplates, quote: renderQuote,
        favorites: renderFavorites, drafts: renderDrafts, reading: renderReading, settings: renderSettings })[tab]();
    }
    function renderOutline() {
      outlineSignature = "";
      main.append(el("h2", { text: "对话目录" }), hint("按提问定位，只包含当前页面已加载的消息。"),
        row(button("↑ 上一问", () => adapter.stepQuestion(-1)), button("↓ 下一问", () => adapter.stepQuestion(1)), button("回到底部", () => adapter.bottom())),
        el("div", { id: "outline-list", class: "stack", style: "margin-top:14px" }));
      updateOutline();
    }
    function updateOutline() {
      const list = main.querySelector("#outline-list"); if (!list) return;
      const questions = adapter.entries().filter((entry) => entry.role === "user");
      const signature = JSON.stringify(questions.map((entry) => [entry.key, entry.fingerprint]));
      if (outlineSignature === signature) return;
      outlineSignature = signature;
      list.replaceChildren(...questions.map((entry, index) => button(`${index + 1}. ${short(entry.text, 140) || "（非文本消息）"}`,
        () => adapter.jump(entry.key), { class: "item", title: short(entry.text, 500) })));
      if (!questions.length) list.append(empty("还没有问题", "开始聊天后，提问会自动出现在这里。"));
    }
    function runSearch() {
      if (!adapter || tab !== "search" || !enabled("search")) return;
      searchResult = adapter.search(searchQuery, searchRole);
      activeMatch = Math.min(activeMatch, searchResult.matches.length - 1);
      const output = main.querySelector("#search-count");
      if (output) output.textContent = searchResult.total > 1000 ? `共 ${searchResult.total} 处匹配，展示前 1000 处，请缩小关键词范围` : `共 ${searchResult.total} 处匹配`;
      main.querySelectorAll("[data-search-step]").forEach((control) => { control.disabled = !searchResult.matches.length; });
      const list = main.querySelector("#search-results"); if (!list) return;
      list.replaceChildren();
      const entries = new Map(adapter.entries().map((entry) => [entry.key, entry]));
      // Render a page around the active match, keeping long-conversation navigation responsive.
      const start = Math.max(0, Math.floor(Math.max(0, activeMatch) / 40) * 40);
      searchResult.matches.slice(start, start + 40).forEach((match, offset) => {
        const entry = entries.get(match.key); if (!entry) return;
        list.append(button(`${start + offset + 1}. ${entry.role === "user" ? "你" : "GPT"} · ${short(entry.text.slice(Math.max(0, match.start - 24), match.end + 70), 120)}`,
          () => goMatch(start + offset), { class: `item${start + offset === activeMatch ? " active" : ""}` }));
      });
      if (searchResult.matches.length > 40) list.append(hint(`当前展示第 ${start + 1}–${Math.min(start + 40, searchResult.matches.length)} 处；用上一处 / 下一处浏览全部结果。`));
      if (!searchResult.total) list.append(empty(searchQuery ? "没有找到匹配内容" : "查找这段对话", "搜索不包含未加载的历史内容。"));
    }
    function goMatch(index) {
      if (!searchResult.matches.length) return;
      activeMatch = (index + searchResult.matches.length) % searchResult.matches.length;
      adapter.jumpMatch(searchResult.matches[activeMatch]); runSearch();
      notify(`第 ${activeMatch + 1} / ${searchResult.matches.length} 处`);
    }
    function stepMatch(direction) {
      clearTimeout(searchTimer); runSearch();
      if (!searchResult.matches.length) return;
      goMatch(activeMatch < 0 ? (direction > 0 ? 0 : searchResult.matches.length - 1) : activeMatch + direction);
    }
    function renderSearch() {
      const query = el("input", { type: "search", value: searchQuery, placeholder: "输入关键词…", "aria-label": "搜索当前对话", oninput: () => {
        searchQuery = query.value; activeMatch = -1;
        clearTimeout(searchTimer); searchTimer = setTimeout(runSearch, 160);
      }, onkeydown: (event) => { if (event.key === "Enter" && !event.isComposing) { event.preventDefault(); stepMatch(event.shiftKey ? -1 : 1); } } });
      const role = el("select", { "aria-label": "搜索消息角色", onchange: () => { searchRole = role.value; activeMatch = -1; runSearch(); } },
        el("option", { value: "all", text: "全部角色" }), el("option", { value: "user", text: "只看我的问题" }), el("option", { value: "assistant", text: "只看 GPT 回复" }));
      role.value = searchRole;
      main.append(el("h2", { text: "当前对话搜索" }), hint("只搜索当前已加载内容；Enter 下一处，Shift + Enter 上一处。"), query, field("角色", role),
        row(button("← 上一处", () => stepMatch(-1), { "data-search-step": "previous" }), button("下一处 →", () => stepMatch(1), { "data-search-step": "next" })),
        el("p", { id: "search-count", class: "hint" }), el("div", { id: "search-results" })); runSearch();
    }
    function previewDraft(text, parent = main, { auto = false } = {}) {
      main.querySelector(".draft")?.remove();
      let generated = text, edited = false, missing = [];
      const input = el("textarea", { value: text, "aria-label": "可编辑草稿" });
      const message = hint(""); message.setAttribute("aria-live", "polite");
      const validate = () => {
        if (missing.length) throw new Error(`请先填写：${missing.join("、")}`);
        if (!input.value.trim()) throw new Error("草稿为空，请先输入内容");
      };
      const insertButton = adapter ? button("插入输入框", async () => {
        validate();
        const result = await adapter.insert(input.value);
        notify(result === false ? "这份草稿已在输入框中，无需重复插入。" : "已追加到输入框，检查后可自行发送。");
        undo.disabled = false;
      }, { class: "primary" }) : null;
      const copyButton = button("复制草稿", async () => { validate(); await copy(input.value); notify("已复制草稿"); });
      const undo = button("撤销插入", () => { adapter.undo(); undo.disabled = true; notify("已恢复插入前的草稿"); }, { disabled: !adapter?.canUndo() });
      const reset = button("更新预览", () => { input.value = generated; edited = false; refreshState(); }, { class: "small", hidden: true });
      function refreshState() {
        const blocked = missing.length > 0 || !input.value.trim();
        for (const control of [insertButton, copyButton].filter(Boolean)) {
          control.dataset.blocked = String(blocked); control.disabled = blocked || control.dataset.busy === "true";
        }
        reset.hidden = !edited || input.value === generated;
        message.textContent = missing.length ? `待填写：${missing.join("、")}`
          : edited ? "已保留你的手动修改。需要重新应用变量时，点击“更新预览”。"
          : "可直接编辑；插入时保留已有输入，不会自动发送。";
      }
      input.addEventListener("input", () => { edited = input.value !== generated; refreshState(); });
      const actions = row(insertButton, copyButton, adapter ? undo : null); actions.classList.add("draft-actions");
      const box = el("section", { class: "draft" }, el("div", { class: "row spread" }, el("h3", { text: "预览并编辑" }), reset), input, message, actions);
      parent.append(box); refreshState(); if (!auto) input.focus();
      return { input, update(value, emptyVariables = []) {
        generated = value; missing = emptyVariables;
        if (!edited) input.value = value;
        refreshState();
      } };
    }
    function renderTemplates() {
      const query = el("input", { type: "search", value: templateFilter, placeholder: "搜索模板名称或正文", "aria-label": "搜索模板", oninput: () => { templateFilter = query.value; updateTemplates(); } });
      const category = el("select", { "aria-label": "模板分类", onchange: () => { templateCategory = category.value; updateTemplates(); } },
        el("option", { value: "all", text: "全部分类" }), ...[...new Set(current().templates.map((item) => item.category || "未分类"))].map((name) => el("option", { value: name, text: name })));
      category.value = templateCategory;
      if (!category.value) { category.value = "all"; templateCategory = "all"; }
      const common = el("input", { type: "checkbox", checked: onlyCommon, onchange: () => { onlyCommon = common.checked; updateTemplates(); } });
      main.append(el("h2", { text: "提示词模板" }), hint("保存常用提问，用 {变量名} 留出需要填写的部分。"),
        row(button("＋ 新建模板", () => editTemplate(), { class: "primary" }), button("自由提问辅助", () => useTemplate({ title: "提问辅助", body: "", id: "" }))),
        field("搜索", query), field("分类", category), el("label", { class: "check" }, common, "仅常用"), el("div", { id: "template-list", class: "stack" })); updateTemplates();
    }
    function updateTemplates() {
      const list = main.querySelector("#template-list"); if (!list) return;
      const items = current().templates.filter((item) => (!onlyCommon || item.favorite)
        && (templateCategory === "all" || (item.category || "未分类") === templateCategory)
        && `${item.title}\n${item.body}`.toLocaleLowerCase().includes(templateFilter.toLocaleLowerCase()));
      items.sort((a, b) => Number(b.favorite) - Number(a.favorite));
      list.replaceChildren(...items.map((item) => el("article", { class: "card" },
        el("span", { class: "badge", text: `${item.category || "未分类"}${item.favorite ? " · 常用" : ""}` }), el("h3", { text: item.title }),
        el("p", { text: short(item.body, 130) }), row(button("使用", () => useTemplate(item), { class: "primary" }), button("编辑", () => editTemplate(item)),
          button(item.favorite ? "取消常用" : "设为常用", async () => { await mutate({ op: "saveTemplate", value: { ...item, favorite: !item.favorite } }); updateTemplates(); }, { class: "small" })))));
      if (!items.length) list.append(empty("没有匹配模板", "试试其他关键词，或新建一个模板。"));
    }
    function editTemplate(item = null) {
      setScreen(el("h2", { text: item ? "编辑模板" : "新建模板" }));
      const view = activeView, draftKey = `${profileId}:${item?.id || "new"}`;
      const draft = editDrafts.get(draftKey) || item;
      const titleInput = el("input", { value: draft?.title || "", maxlength: "100", required: "" });
      const category = el("input", { value: draft?.category || "", maxlength: "60" });
      const body = el("textarea", { value: draft?.body || "", maxlength: "30000", required: "", style: "min-height:180px" });
      const favorite = el("input", { type: "checkbox", checked: draft?.favorite || false });
      const keepDraft = () => editDrafts.set(draftKey, { title: titleInput.value, category: category.value, body: body.value, favorite: favorite.checked });
      for (const input of [titleInput, category, body, favorite]) {
        input.addEventListener("input", keepDraft); input.addEventListener("change", keepDraft);
      }
      main.append(field("名称", titleInput), field("分类", category), field("正文（例如：请解释 {主题}）", body), el("label", { class: "check" }, favorite, "设为常用"),
        row(button("保存模板", async () => {
          if (!titleInput.reportValidity() || !body.reportValidity()) return;
          await mutate({ op: "saveTemplate", value: { id: item?.id || crypto.randomUUID(), title: titleInput.value.trim(), category: category.value.trim(), body: body.value, favorite: favorite.checked } }); editDrafts.delete(draftKey); finishView(view);
        }, { class: "primary" }), button("返回列表（保留草稿）", () => { keepDraft(); render(); })));
      if (item) main.append(button("删除模板", async () => {
        const originalSpace = profileId;
        await mutate({ op: "deleteTemplate", id: item.id }, "模板已删除"); editDrafts.delete(draftKey); finishView(view);
        notify("模板已删除", false, button("撤销", async () => { await mutate({ op: "saveTemplate", profileId: originalSpace, value: item }); updateTemplates(); }, { class: "small" }));
      }, { class: "danger", style: "margin-top:20px" }));
    }
    function useTemplate(item) {
      setScreen(row(button("← 返回模板", render, { class: "small" })), el("h2", { text: item.title }), hint("填写变量即可预览，检查后直接插入输入框。"));
      const inputs = new Map(core.variables(item.body).map((name) => [name, el("textarea", { "aria-label": name, required: "", style: "min-height:60px" })]));
      for (const [name, input] of inputs) main.append(field(name, input));
      const extras = new Map(["目标", "背景", "输出格式", "限制条件"].map((name) => [name, el("textarea", { "aria-label": name, style: "min-height:55px" })]));
      const details = el("details", {}, el("summary", { text: "补充提问信息（可选）" }));
      if (!item.body) details.open = true;
      for (const [name, input] of extras) details.append(field(name, input));
      main.append(details);
      const preview = previewDraft("", main, { auto: true });
      function updatePreview() {
        const values = Object.fromEntries([...inputs].map(([key, input]) => [key, input.value]));
        const result = core.renderTemplate(item.body, values);
        const sections = [...extras].filter(([, input]) => input.value.trim()).map(([name, input]) => `${name}：${input.value.trim()}`);
        preview.update([result.text, ...sections].filter(Boolean).join("\n\n"), result.missing);
      }
      for (const input of [...inputs.values(), ...extras.values()]) input.addEventListener("input", updatePreview);
      updatePreview();
    }
    function renderQuote() {
      main.append(el("h2", { text: "引用与追问" }), hint("在 GPT 回复中选中一段文字，再使用页面上的“引用追问”按钮；也可以在这里填写引用。"));
      const input = el("textarea", { value: quoted, "aria-label": "引用原文", placeholder: "引用原文…", oninput: () => { quoted = input.value; } });
      main.append(field("引用原文", input));
      const actions = [
        ["解释这段", "请解释这段内容，说明关键概念。"], ["举个例子", "请为这段内容给出一个具体例子。"],
        ["翻译", "请翻译这段内容：若原文为中文则译为英文，否则译为中文，保留原意。"],
        ["检查依据", "请检查这段内容的依据，区分已证实的事实、推断和不确定之处，并提供可核查的来源。"],
        ["自定义动作", current().settings.customAction]
      ];
      main.append(row(...actions.map(([label, action]) => button(label, () => {
        if (!input.value.trim()) throw new Error("请先选中或输入需要引用的原文");
        if (!action.trim()) throw new Error("请先在设置中填写自定义追问动作");
        previewDraft(core.quoteDraft(input.value, action));
      }))));
    }
    function renderFavorites() {
      const query = el("input", { type: "search", value: favoriteFilter, placeholder: "搜索收藏内容、标题或备注", "aria-label": "搜索收藏", oninput: () => { favoriteFilter = query.value; updateFavorites(); } });
      main.append(el("h2", { text: "消息收藏" }), hint("只保存你主动收藏的消息快照。点击消息旁的 ☆ 收藏，可随时回来查看。"), query,
        el("div", { id: "favorite-list", class: "stack", style: "margin-top:14px" })); updateFavorites();
    }
    async function removeFavorite(item) {
      const view = activeView;
      const space = profileId;
      const latest = current().favorites.find((saved) => saved.id === item.id) || item;
      await mutate({ op: "deleteFavorite", id: item.id }, "已取消收藏");
      undoDelete = { item: latest, profileId: space };
      finishView(view);
      notify("已取消收藏", false, button("撤销", async () => {
        if (!undoDelete) return;
        await mutate({ op: "saveFavorite", profileId: undoDelete.profileId, value: undoDelete.item });
        undoDelete = null; updateFavorites();
      }, { class: "small" }));
    }
    function updateFavorites() {
      const list = main.querySelector("#favorite-list"); if (!list) return;
      const query = favoriteFilter.toLocaleLowerCase();
      const items = current().favorites.filter((item) => `${item.title}\n${item.text}\n${item.note}`.toLocaleLowerCase().includes(query)).slice().reverse();
      list.replaceChildren(...items.map((item) => el("article", { class: "card" },
        el("span", { class: "badge", text: `${item.role === "user" ? "我的问题" : "GPT 回复"} · ${new Date(item.createdAt).toLocaleDateString()}` }),
        el("h3", { text: item.title }), el("p", { text: short(item.text, 130) }), item.note ? el("p", { text: `备注：${short(item.note, 100)}` }) : null,
        row(button("查看 / 备注", () => viewFavorite(item)), button("复制", async () => { await copy(item.markdown); notify("已复制收藏内容"); }),
          button("取消收藏", () => removeFavorite(item), { class: "small" })))));
      if (!items.length) list.append(empty("暂无匹配收藏", "收藏后会在当前资料空间保留一份本地快照。"));
    }
    function viewFavorite(item) {
      setScreen(el("h2", { text: item.title }), hint(`保存于 ${new Date(item.createdAt).toLocaleString()} · 内容为保存时的快照`),
        el("div", { class: "snapshot", text: item.markdown }));
      const note = el("textarea", { value: item.note, maxlength: "5000", "aria-label": "收藏备注" });
      main.append(field("备注", note), row(button("保存备注", async () => {
        await mutate({ op: "note", id: item.id, note: note.value });
      }, { class: "primary" }), button("复制内容", async () => { await copy(item.markdown); notify("已复制"); }),
        button("导出 .md", () => download(`# ${item.title}\n\n${item.markdown}\n\n${note.value ? `备注：${note.value}\n\n` : ""}来源：${item.url}\n`,
          global.ChatGPTExporterCore.createFilename(item.title, "md"), "text/markdown")),
        adapter ? button("定位原消息", () => adapter.locateFavorite(item)) : null),
        el("p", {}, el("a", { href: item.url, target: "_blank", rel: "noopener noreferrer", text: "打开来源会话 ↗" })),
        hint("原消息已编辑、重新生成或尚未加载时，定位可能不可用；此处快照仍可阅读。"),
        row(button("返回收藏", render), button("取消收藏", () => removeFavorite(item), { class: "danger" })));
    }
    function renderReading() {
      const view = activeView;
      main.append(el("h2", { text: "阅读体验" }), hint("设置自动保存；消息和代码块旁的按钮可折叠内容，导出仍保留全文。"));
      const settings = current().settings.reading;
      for (const [key, label, min, max, step] of [["width", "正文最大宽度（px）", 560, 1400, 20], ["fontSize", "正文字号（px）", 12, 28, 1], ["lineHeight", "行距", 1.2, 2.5, 0.05]]) {
        const input = el("input", { type: "number", value: settings[key], min: String(min), max: String(max), step: String(step), "aria-label": label });
        input.addEventListener("change", async () => {
          try {
            if (!input.reportValidity() || !input.value) return;
            await mutate({ op: "settings", patch: { reading: { [key]: Number(input.value) } } });
            input.value = current().settings.reading[key];
          } catch (error) { input.value = current().settings.reading[key]; notify(error.message, true); }
        });
        main.append(field(label, input));
      }
      const focus = el("input", { type: "checkbox", checked: settings.focus });
      focus.addEventListener("change", async () => {
        try { await mutate({ op: "settings", patch: { reading: { focus: focus.checked } } }); }
        catch (error) { focus.checked = current().settings.reading.focus; notify(error.message, true); }
      });
      main.append(el("label", { class: "check" }, focus, "专注模式：隐藏站点导航栏"),
        row(button("恢复默认阅读设置", async () => { await mutate({ op: "settings", patch: { reading: core.DEFAULT_SETTINGS.reading } }); finishView(view); }),
          adapter ? button("展开所有折叠内容", () => { adapter.expandAll(); notify("已展开全部内容"); }) : null),
        hint("可在设置中关闭整个阅读模块，恢复网页原有样式。"));
    }
    async function renderDrafts() {
      const view = activeView, space = profileId, url = adapter?.url();
      const list = el("div", { id: "saved-drafts", class: "stack" });
      main.replaceChildren(el("h2", { text: adapter ? "当前会话草稿" : "已保存的文字草稿" }),
        hint("只保存开启后编辑的输入框文字。每个标签页单独保存；恢复时保留已有输入，由你检查后发送。附件不包含在内。"),
        button("刷新草稿列表", renderDrafts), list);
      try {
        const result = await globalThis.ChatGPTAssistantDrafts.request({ op: "list", profileId: space, url });
        if (disposed || activeView !== view || profileId !== space || adapter && adapter.url() !== url || !list.isConnected) return;
        const items = result.items.sort((a, b) => b.updatedAt - a.updatedAt);
        if (!items.length) list.append(empty("没有可恢复的草稿", "开启后输入文字即可自动保存；发送成功或过期后清理。"));
        for (const item of items) {
          const preview = el("textarea", { value: item.text, maxlength: "100000", "aria-label": "已保存草稿内容" });
          const details = el("details", {}, el("summary", { text: "预览并编辑草稿" }), preview);
          const restore = adapter ? button("恢复到输入框", async () => {
            const result = await adapter.restoreDraft(item, preview.value);
            notify(result === false ? "输入框已包含这份草稿。" : "已追加草稿，请检查后发送。");
          }, { class: "primary" }) : null;
          list.append(el("article", { class: "card" }, el("h3", { text: item.title || "新对话" }),
            hint(`${item.owner === result.owner ? "当前标签页" : "其他标签页"} · ${new Date(item.updatedAt).toLocaleString()} · ${new Date(item.expiresAt).toLocaleDateString()} 过期`),
            el("p", { class: "snippet", text: short(item.text, 120) }), details,
            el("a", { href: item.url, target: "_blank", rel: "noopener noreferrer", text: "打开来源会话 ↗" }),
            row(restore, button("复制草稿", async () => { await copy(preview.value); notify("已复制草稿"); }),
              button("删除草稿", async () => {
                await globalThis.ChatGPTAssistantDrafts.request({ op: "delete", profileId: space, id: item.id });
                if (activeView === view && profileId === space) renderDrafts();
                notify("草稿已删除");
              }, { class: "danger" }))));
        }
      } catch (error) { if (activeView === view) notify(error.message, true); }
    }
    function renderSettings() {
      const view = activeView;
      main.append(el("h2", { text: "功能与本地资料" }), hint("模块可以独立关闭。资料仅保存在当前浏览器中。"));
      const switches = el("div", { class: "switch-grid" });
      for (const key of core.MODULES) {
        const input = el("input", { type: "checkbox", checked: enabled(key), "aria-label": `启用${names[key]}` });
        input.addEventListener("change", async () => {
          try { await mutate({ op: "settings", patch: { modules: { [key]: input.checked } } }); }
          catch (error) { input.checked = enabled(key); notify(error.message, true); }
        });
        switches.append(el("label", { class: "check" }, input, names[key]));
      }
      const custom = el("textarea", { value: current().settings.customAction, maxlength: "2000", "aria-label": "自定义追问动作" });
      main.append(switches, field("自定义追问动作", custom), button("保存追问动作", () => mutate({ op: "settings", patch: { customAction: custom.value } })), el("hr"));
      const retention = el("select", { "aria-label": "草稿保留时间" },
        ...[1, 7, 30].map((days) => el("option", { value: String(days), text: `${days} 天` })));
      retention.value = String(current().settings.drafts.retentionDays);
      retention.addEventListener("change", async () => {
        try { await mutate({ op: "settings", patch: { drafts: { retentionDays: Number(retention.value) } } }); }
        catch (error) { retention.value = String(current().settings.drafts.retentionDays); notify(error.message, true); }
      });
      main.append(el("h3", { text: "草稿恢复（默认关闭）" }),
        hint("勾选上方“草稿”后，按会话、资料空间和标签页在本机保存未发送文字。关闭会清除当前空间的已存草稿。草稿不纳入备份；恢复备份后需重新开启。"),
        field("草稿保留时间", retention), button("立即清除当前空间草稿", () => mutate({ op: "clearDrafts" }, "已清除当前空间草稿；再次编辑输入框后开始保存"), { class: "danger" }), el("hr"));
      const name = el("input", { maxlength: "60", placeholder: "例如：工作账号", "aria-label": "新资料空间名称" });
      main.append(el("h3", { text: "资料空间" }), hint("无法自动可靠识别 ChatGPT 账号。切换账号时，请手动切换到对应资料空间；各空间的模板、收藏和设置相互独立。空间选择只作用于当前标签页。"), name,
        button("创建资料空间", async () => {
          if (!name.value.trim()) throw new Error("请输入资料空间名称");
          const newId = crypto.randomUUID();
          await mutate({ op: "createProfile", id: newId, name: name.value.trim() });
          profileId = newId;
          try { sessionStorage.setItem("chatgpt-assistant-space", profileId); } catch { /* optional */ }
          adapter?.clearUndo(); apply(); render();
        }, { style: "margin-top:8px" }), el("hr"));
      main.append(el("h3", { text: "备份与恢复" }), hint(`当前空间：${current().templates.length} 个模板、${current().favorites.length} 条收藏。备份包含正文和备注，请保存在你信任的位置。`),
        button("下载当前空间备份", () => download(JSON.stringify(core.backup(current()), null, 2), `chatgpt-assistant-${new Date().toISOString().slice(0, 10)}.json`)));
      const file = el("input", { type: "file", accept: ".json,application/json", "aria-label": "选择资料备份" });
      const restoreArea = el("div", { class: "stack" });
      file.addEventListener("change", async () => {
        pendingBackup = null; restoreArea.replaceChildren();
        try {
          const chosen = file.files[0]; if (!chosen) return;
          if (chosen.size > 8 * 1024 * 1024) throw new Error("备份超过 8 MB，请缩小文件后重试");
          const parsed = JSON.parse((await chosen.text()).replace(/^\uFEFF/, ""));
          const restored = core.parseBackup(parsed); pendingBackup = parsed;
          restoreArea.append(hint(`将用「${restored.name}」的 ${restored.templates.length} 个模板和 ${restored.favorites.length} 条收藏替换当前空间的资料与设置。其他空间不受影响。`),
            button("确认替换当前空间", async () => {
              if (!pendingBackup) return;
              await mutate({ op: "restore", backup: pendingBackup }, "备份已恢复"); pendingBackup = null; finishView(view);
            }, { class: "danger" }));
        } catch (error) { notify(`无法读取备份：${error.message}`, true); }
      });
      main.append(field("选择备份文件", file), restoreArea, el("hr"));
      const confirm = el("input", { placeholder: "输入 清除 以确认", "aria-label": "确认清除当前空间" });
      main.append(el("h3", { text: "清理当前空间" }), hint("删除当前空间的模板、收藏、草稿和设置；保留原有导出设置与其他空间。建议先下载备份。"), confirm,
        button("清除当前空间资料", async () => {
          if (confirm.value.trim() !== "清除") throw new Error("请先输入“清除”以确认");
          await mutate({ op: "clearProfile" }, "当前空间已清空"); finishView(view);
        }, { class: "danger", style: "margin-top:8px" }));
      if (adapter) main.append(el("hr"), button("在独立页面管理资料 ↗", async () => {
        const response = await chrome.runtime.sendMessage({ type: "OPEN_ASSISTANT_OPTIONS" });
        if (!response?.ok) throw new Error(response?.error || "无法打开设置页");
      }));
    }
    function live() {
      if (!data || disposed) return;
      updateCount();
      if (tab === "outline") updateOutline();
      if (tab === "search") runSearch();
    }
    const storageChanged = (changes, area) => {
      if (area !== "local" || !changes[core.STORAGE_KEY]?.newValue) return;
      try {
        const updated = core.validateData(changes[core.STORAGE_KEY].newValue);
        if (data && updated.revision < data.revision) return;
        data = updated;
        const oldTab = tab; apply();
        if (oldTab !== tab) render();
        else { live(); updateTemplates(); updateFavorites(); }
      } catch (error) { notify(error.message, true); }
    };
    chrome.storage.onChanged.addListener(storageChanged);
    const ready = rpc().then((value) => { data = value; apply(); render(); }).catch((error) => {
      main.replaceChildren(empty("资料暂时不可用", "可刷新页面重试；已保存内容不会被重置。")); notify(error.message, true);
    });
    return {
      ready, live, notify, shell, draftsChanged: updateCount,
      setTheme(theme) { shell.dataset.theme = theme; },
      settings() { return current()?.settings || core.settings(); },
      async saveFavorite(entry) {
        await ready;
        if (!enabled("favorites")) return;
        const snapshot = adapter.snapshot(entry);
        const exists = current().favorites.find((item) => item.url === snapshot.url && item.messageId === snapshot.messageId
          && item.fingerprint === snapshot.fingerprint && item.text === snapshot.text && item.role === snapshot.role);
        if (exists) { activate("favorites"); viewFavorite(exists); adapter.open(); return; }
        await mutate({ op: "saveFavorite", value: { ...snapshot, id: crypto.randomUUID(), note: "", createdAt: new Date().toISOString() } }, "已收藏消息，可在收藏中添加备注");
        if (tab === "favorites") updateFavorites();
        const saved = current().favorites.find((item) => item.url === snapshot.url && item.messageId === snapshot.messageId && item.fingerprint === snapshot.fingerprint);
        if (saved) {
          const edit = () => { activate("favorites"); viewFavorite(saved); adapter.open(); };
          if (adapter.isOpen()) notify("已收藏这条消息", false, button("添加备注", edit, { class: "small" }));
          else adapter.toast("已收藏这条消息", "添加备注", edit);
        }
      },
      isFavorite(entry) {
        const item = favoriteIndex.get(`${adapter.url()}\0${entry.role}\0${entry.stableId}\0${entry.fingerprint}`);
        return !!item && item.text === entry.text;
      },
      openTab(key) { activate(key); },
      quote(text) { quoted = text; activate("quote", { fresh: true }); },
      routeChanged() {
        quoted = ""; searchResult = { matches: [], total: 0 }; activeMatch = -1;
        for (const key of views.keys()) if (key.endsWith(":quote")) views.delete(key);
        for (const scope of [main, ...[...views.values()].map((view) => view.content).filter(Boolean)]) {
          scope.querySelectorAll("button").forEach((control) => { if (control.textContent === "撤销插入") control.disabled = true; });
        }
        if (["quote", "drafts"].includes(tab)) render(); live();
      },
      close() { adapter?.clearSearch(); },
      opened() {
        if (firstOpen) {
          firstOpen = false;
          if (!requestedTab && adapter) activate(adapter.entries().length ? "outline" : "templates");
        }
        if (tab === "search") runSearch();
      },
      destroy() { disposed = true; views.clear(); editDrafts.clear(); clearTimeout(statusTimer); clearTimeout(searchTimer); chrome.storage.onChanged.removeListener(storageChanged); style.remove(); shell.remove(); }
    };
  }
  global.ChatGPTAssistantUI = { mount, css, el };
})(globalThis);
