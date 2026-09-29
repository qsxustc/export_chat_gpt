/* All writes run in the service worker, serialized across tabs and the options page. */
(function initAssistantStore() {
  "use strict";
  const core = globalThis.ChatGPTAssistantCore;
  let queue = Promise.resolve();
  async function ownerFor(sender) {
    if (!Number.isInteger(sender.tab?.id)) return "";
    // Browser-owned tab IDs distinguish duplicated tabs; session storage survives worker restarts.
    const key = `assistantDraftOwner:${sender.tab.id}`;
    const stored = await chrome.storage.session.get(key);
    if (stored[key]) return stored[key];
    const owner = crypto.randomUUID();
    await chrome.storage.session.set({ [key]: owner });
    return owner;
  }
  chrome.runtime.onMessage.addListener((request, sender, respond) => {
    if (request?.type === "OPEN_ASSISTANT_OPTIONS") {
      chrome.runtime.openOptionsPage().then(() => respond({ ok: true }), () => respond({ ok: false, error: "无法打开设置页" }));
      return true;
    }
    if (!["ASSISTANT_DATA", "ASSISTANT_DRAFTS"].includes(request?.type)) return;
    if (sender.id && sender.id !== chrome.runtime.id) return;
    const task = queue.then(async () => {
      const stored = await chrome.storage.local.get([core.STORAGE_KEY, core.DRAFT_STORAGE_KEY]);
      let data = stored[core.STORAGE_KEY] ? core.validateData(stored[core.STORAGE_KEY]) : core.initialData();
      let drafts = core.pruneDrafts(stored[core.DRAFT_STORAGE_KEY], data.profiles);
      const action = request.action || {};
      const writes = {};
      let result;
      if (request.type === "ASSISTANT_DATA") {
        if (request.action) data = core.applyAction(data, action);
        if (["clearProfile", "restore", "clearDrafts"].includes(action.op)
          || (action.op === "settings" && action.patch?.modules?.drafts === false)) {
          drafts.items = drafts.items.filter((item) => item.profileId !== action.profileId);
          drafts.epochs[action.profileId] = crypto.randomUUID();
        }
        drafts = core.pruneDrafts(drafts, data.profiles);
        if (request.action || !stored[core.STORAGE_KEY]) {
          data.revision += 1;
          writes[core.STORAGE_KEY] = data;
        }
        result = { data };
      } else {
        const current = data.profiles.find((item) => item.id === action.profileId);
        if (!current) throw new Error("找不到资料空间，请重新选择");
        const owner = await ownerFor(sender);
        const epoch = drafts.epochs[current.id] || "initial";
        const url = core.safeUrl(action.url);
        if (action.op === "save") {
          if (!owner || !url) throw new Error("无法识别草稿标签页或来源，请刷新后重试");
          if (!current.settings.modules.drafts || action.epoch !== epoch) return { owner, epoch, items: [], stale: true };
          if (typeof action.text !== "string" || !action.text.trim() || action.text.length > 100000) throw new Error("草稿为空或超过 100000 字符，请复制到本地文件保存");
          const previous = drafts.items.find((item) => item.profileId === current.id && item.owner === owner && item.url === url);
          if (previous?.text !== action.text) {
            const now = Date.now();
            const item = { id: crypto.randomUUID(), profileId: current.id, owner, url, title: String(action.title || "新对话").slice(0, 500),
              text: action.text, updatedAt: now, expiresAt: now + current.settings.drafts.retentionDays * 86400000 };
            drafts.items = drafts.items.filter((entry) => entry !== previous);
            drafts.items.push(item);
            drafts = core.draftData(drafts);
          }
        } else if (action.op === "sent") {
          if (!owner || !url) throw new Error("无法识别发送来源");
          // A newer draft typed while the response starts must survive delayed send confirmation.
          const normalize = (text) => text.replace(/\s+/g, " ").trim();
          drafts.items = drafts.items.filter((item) => !(item.profileId === current.id && item.owner === owner && item.url === url
            && normalize(item.text) === normalize(String(action.text || ""))));
        } else if (action.op === "delete") {
          drafts.items = drafts.items.filter((item) => item.profileId !== current.id || item.id !== action.id);
        } else if (action.op && action.op !== "list") throw new Error("未知草稿操作");
        result = { owner, epoch, items: drafts.items.filter((item) => item.profileId === current.id && (!url || item.url === url)) };
      }
      const before = stored[core.DRAFT_STORAGE_KEY];
      if (JSON.stringify(drafts) !== JSON.stringify(before || core.draftData())) {
        drafts.revision += 1;
        writes[core.DRAFT_STORAGE_KEY] = drafts;
      }
      if (request.type === "ASSISTANT_DRAFTS") result.revision = drafts.revision;
      if (Object.keys(writes).length) await chrome.storage.local.set(writes);
      return result;
    });
    queue = task.catch(() => {});
    task.then((result) => respond({ ok: true, ...result }), (error) => {
      respond({ ok: false, error: `本地资料操作失败：${error.message || "存储不可用"}。请重试，或复制内容后清理本地资料。` });
    });
    return true;
  });
})();
