(function initDraftRecovery(global) {
  "use strict";
  if (global.ChatGPTAssistantDrafts) return;
  const core = global.ChatGPTAssistantCore;
  async function request(action) {
    const result = await chrome.runtime.sendMessage({ type: "ASSISTANT_DRAFTS", action });
    if (!result?.ok) throw new Error(result?.error || "草稿保存失败，请刷新扩展或复制到本地文件");
    return result;
  }
  function mount(adapter) {
    let context = null, profile = null, pending = null, submitted = null, items = [], timer = 0, composing = false, stopped = false;
    let listening = false, interval = 0, expiry = 0;
    const normalize = (text) => text.replace(/\s+/g, " ").trim();
    const text = () => { const node = adapter.composer(); return node ? adapter.text(node) : ""; };
    const changed = () => adapter.changed();
    const currentUrl = () => core.safeUrl(adapter.url());
    function valid(scope) { return !stopped && context === scope && scope?.enabled && scope.url === currentUrl(); }
    function fail(error) { if (!stopped) adapter.error(error); }
    function updateItems(value) {
      items = value.filter((item) => item.profileId === context?.profileId && item.url === context?.url && item.expiresAt > Date.now());
      changed();
    }
    async function load(scope) {
      try {
        const result = await request({ op: "list", profileId: scope.profileId, url: scope.url });
        if (!valid(scope)) return;
        scope.owner = result.owner;
        if (result.revision >= scope.revision) {
          if (scope.epoch !== null && scope.epoch !== result.epoch && pending?.scope === scope) pending = null;
          scope.epoch = result.epoch; scope.revision = result.revision;
          updateItems(result.items);
        }
        if (pending?.scope === scope) flush();
      } catch (error) { if (valid(scope)) fail(error); }
    }
    function configure(current) {
      profile = current;
      const url = currentUrl(), enabled = current.settings.modules.drafts;
      if (context?.profileId === current.id && context.url === url && context.enabled === enabled) return;
      flush();
      context = { profileId: current.id, url, enabled, epoch: null, owner: "", revision: -1 };
      clearTimeout(timer); pending = null; items = [];
      toggleListeners(enabled);
      changed();
      if (enabled) load(context);
    }
    function capture(event) {
      if (!context?.enabled || composing || event?.isComposing || event?.target !== adapter.composer()
        && !adapter.composer()?.contains(event?.target)) return;
      if (context.url !== currentUrl()) configure(profile);
      const value = text();
      // An empty editor alone is not evidence of a successful send.
      if (!value.trim()) return;
      pending = { scope: context, text: value, title: adapter.title() };
      clearTimeout(timer); timer = setTimeout(flush, 350);
      changed();
    }
    function flush() {
      clearTimeout(timer);
      const value = pending;
      if (!value || !value.scope.enabled || value.scope.epoch === null) return;
      pending = null;
      const { scope } = value;
      request({ op: "save", profileId: scope.profileId, url: scope.url, epoch: scope.epoch, text: value.text, title: value.title })
        .then((result) => {
          if (!valid(scope)) return;
          if (result.stale) { load(scope); return; }
          if (result.revision >= scope.revision) { scope.revision = result.revision; updateItems(result.items); }
        }).catch(fail);
    }
    function startSubmit(event) {
      const node = adapter.composer();
      if (!context?.enabled || !node || context.url !== currentUrl() || composing || event.isComposing) return;
      if (event.type === "keydown" && (event.key !== "Enter" || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey || !node.contains(event.target))) return;
      if (event.type === "click" && !event.target.closest?.('[data-testid="send-button"],#composer-submit-button,button[aria-label="Send prompt"],button[aria-label="发送提示"]')) return;
      if (event.type === "submit" && !event.target.contains(node)) return;
      const value = text(); if (!value.trim()) return;
      if (!submitted || submitted.scope !== context || submitted.text !== value || Date.now() - submitted.time > 250) {
        submitted = { scope: context, text: value, time: Date.now(), baseline: adapter.messages().map((entry) => ({
          node: entry.roleNode, id: entry.id || ""
        })) };
      }
      pending = { scope: context, text: value, title: adapter.title() }; flush();
    }
    function checkSent() {
      const value = submitted; if (!value) return;
      if (Date.now() - value.time > 120000 || value.scope.profileId !== profile?.id || !profile?.settings.modules.drafts) { submitted = null; return; }
      const nextUrl = currentUrl();
      // A new conversation acquires /c/<id> on its first successful send.
      if (nextUrl !== value.scope.url && (/\/c\//.test(value.scope.url) || !/\/c\//.test(nextUrl))) { submitted = null; return; }
      if (normalize(text()) === normalize(value.text)) return;
      const messages = adapter.messages();
      const index = messages.findIndex((entry) => entry.role === "user"
        && !value.baseline.some((old) => old.node === entry.roleNode || old.id && old.id === entry.id)
        && normalize(entry.roleNode.innerText) === normalize(value.text));
      // The user turn can appear optimistically even when the network request fails.
      // Keep the draft until the corresponding assistant reply actually has content.
      if (index < 0) return;
      const following = messages.slice(index + 1);
      const nextUser = following.findIndex((entry) => entry.role === "user");
      const reply = nextUser < 0 ? following : following.slice(0, nextUser);
      if (!reply.some((entry) => entry.role === "assistant" && entry.roleNode.innerText.trim())) return;
      submitted = null;
      if (pending?.scope === value.scope && pending.text === value.text) pending = null;
      request({ op: "sent", profileId: value.scope.profileId, url: value.scope.url, text: value.text }).catch(fail);
    }
    const onCompositionStart = (event) => { if (adapter.composer()?.contains(event.target)) { composing = true; clearTimeout(timer); } };
    const onCompositionEnd = (event) => { composing = false; capture(event); };
    const onVisibility = () => { if (document.visibilityState === "hidden") flush(); };
    const onStorage = (changes, area) => {
      const value = changes[core.DRAFT_STORAGE_KEY]?.newValue;
      if (area !== "local" || !value || !context?.enabled) return;
      if (value.revision < context.revision) return;
      context.revision = value.revision;
      const epoch = value.epochs?.[context.profileId] || "initial";
      if (context.epoch !== epoch && (context.epoch !== null || epoch !== "initial")) {
        clearTimeout(timer); pending = null; submitted = null;
      }
      context.epoch = epoch;
      updateItems(value.items || []);
    };
    function toggleListeners(enabled) {
      if (listening === enabled) return;
      listening = enabled;
      const method = enabled ? "addEventListener" : "removeEventListener";
      document[method]("input", capture, true);
      document[method]("compositionstart", onCompositionStart, true);
      document[method]("compositionend", onCompositionEnd, true);
      document[method]("keydown", startSubmit, true);
      document[method]("click", startSubmit, true);
      document[method]("submit", startSubmit, true);
      document[method]("visibilitychange", onVisibility);
      window[method]("pagehide", flush);
      chrome.storage.onChanged[enabled ? "addListener" : "removeListener"](onStorage);
      clearInterval(interval); clearInterval(expiry);
      if (enabled) {
        interval = setInterval(() => { checkSent(); if (context.url !== currentUrl()) configure(profile); }, 300);
        expiry = setInterval(() => load(context), 30000);
      } else { composing = false; submitted = null; }
    }
    return {
      configure,
      count: () => items.filter((item) => item.expiresAt > Date.now() && item.text !== text()).length,
      async restore(item, value) {
        if (!context?.enabled || item.profileId !== context.profileId || item.url !== currentUrl() || item.expiresAt <= Date.now()) throw new Error("草稿已过期或来源不同，请重新打开草稿列表");
        if (!value.trim()) throw new Error("草稿为空");
        const scope = context;
        const latest = await request({ op: "list", profileId: scope.profileId, url: scope.url });
        if (!valid(scope) || !latest.items.some((entry) => entry.id === item.id)) throw new Error("草稿已更新或清除，请刷新草稿列表后重试");
        if (text() === value) return false;
        return adapter.insert(value);
      },
      destroy() {
        flush(); stopped = true; clearTimeout(timer); toggleListeners(false);
      }
    };
  }
  global.ChatGPTAssistantDrafts = { request, mount };
})(globalThis);
