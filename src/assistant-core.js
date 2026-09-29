(function initAssistantCore(global) {
  "use strict";
  if (global.ChatGPTAssistantCore) return;
  const VERSION = 1;
  const STORAGE_KEY = "assistantData";
  const DRAFT_STORAGE_KEY = "assistantDrafts";
  const MODULES = ["outline", "search", "templates", "quote", "reading", "favorites", "drafts"];
  const DEFAULT_SETTINGS = {
    modules: Object.fromEntries(MODULES.map((key) => [key, key !== "drafts"])),
    reading: { width: 860, fontSize: 16, lineHeight: 1.75, focus: false },
    drafts: { retentionDays: 7 },
    customAction: "请解释这段内容，并给出一个具体例子。"
  };
  const clone = (value) => JSON.parse(JSON.stringify(value));
  function string(value, max, label, required = false) {
    if (typeof value !== "string" || value.length > max || (required && !value.trim())) {
      throw new Error(`${label}无效或超过 ${max} 字符`);
    }
    return value;
  }
  function id(value) { return string(value, 100, "标识", true); }
  function safeUrl(value) {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && ["chatgpt.com", "chat.openai.com"].includes(url.hostname)
        ? `${url.origin}${url.pathname}` : "";
    } catch { return ""; }
  }
  function settings(input = {}) {
    const result = clone(DEFAULT_SETTINGS);
    for (const key of MODULES) {
      if (typeof input.modules?.[key] === "boolean") result.modules[key] = input.modules[key];
    }
    for (const [key, min, max] of [["width", 560, 1400], ["fontSize", 12, 28], ["lineHeight", 1.2, 2.5]]) {
      const value = Number(input.reading?.[key]);
      if (Number.isFinite(value)) result.reading[key] = Math.min(max, Math.max(min, value));
    }
    result.reading.focus = input.reading?.focus === true;
    if ([1, 7, 30].includes(input.drafts?.retentionDays)) result.drafts.retentionDays = input.drafts.retentionDays;
    if (typeof input.customAction === "string") result.customAction = string(input.customAction, 2000, "自定义动作");
    return result;
  }
  function template(value) {
    return {
      id: id(value.id), title: string(value.title, 100, "模板标题", true),
      category: string(value.category || "", 60, "分类"),
      body: string(value.body, 30000, "模板正文", true), favorite: value.favorite === true
    };
  }
  function favorite(value) {
    const url = safeUrl(value.url);
    if (!url) throw new Error("收藏来源必须是 ChatGPT 页面");
    if (!["user", "assistant", "system", "tool"].includes(value.role)) throw new Error("消息角色无效");
    if (!Number.isFinite(Date.parse(value.createdAt))) throw new Error("收藏日期无效");
    return {
      id: id(value.id), title: string(value.title, 500, "会话标题"), url,
      messageId: string(value.messageId || "", 200, "消息标识"),
      fingerprint: string(value.fingerprint, 100, "内容指纹", true), role: value.role,
      text: string(value.text, 1000000, "消息内容", true),
      markdown: string(value.markdown || value.text, 1500000, "消息 Markdown"),
      note: string(value.note || "", 5000, "备注"), createdAt: value.createdAt
    };
  }
  function profile(value) {
    if (!Array.isArray(value.templates) || !Array.isArray(value.favorites)
      || value.templates.length > 1000 || value.favorites.length > 5000) throw new Error("资料列表无效或条目过多");
    const templates = value.templates.map(template), favorites = value.favorites.map(favorite);
    for (const list of [templates, favorites]) {
      if (new Set(list.map((item) => item.id)).size !== list.length) throw new Error("资料包含重复标识");
    }
    return { id: id(value.id), name: string(value.name, 60, "资料空间名称", true), settings: settings(value.settings), templates, favorites };
  }
  function createProfile(profileId = "default", name = "默认空间") {
    return profile({ id: profileId, name, settings: DEFAULT_SETTINGS, favorites: [], templates: [
      { id: "explain", title: "解释概念", category: "学习", favorite: true, body: "请向{受众}解释{主题}。先给出直观理解，再给出一个具体例子，说明常见误区。" },
      { id: "review", title: "代码审查", category: "编程", body: "请审查以下代码，优先指出正确性和边界条件问题，给出复现条件与修改建议：\n\n{代码}" },
      { id: "rewrite", title: "文字润色", category: "写作", body: "请将以下内容改写为{风格}，保留原有事实与意图：\n\n{内容}" }
    ] });
  }
  function initialData() { return { version: VERSION, revision: 0, profiles: [createProfile()] }; }
  function validateData(value) {
    if (value?.version !== VERSION) throw new Error("资料版本不受支持，请升级扩展后重试");
    if (!Array.isArray(value.profiles) || !value.profiles.length || value.profiles.length > 50) throw new Error("资料空间无效");
    const profiles = value.profiles.map(profile);
    if (new Set(profiles.map((item) => item.id)).size !== profiles.length) throw new Error("资料空间标识重复");
    return { version: VERSION, revision: Number.isSafeInteger(value.revision) && value.revision >= 0 ? value.revision : 0, profiles };
  }
  function applyAction(input, action) {
    const data = validateData(input);
    if (action.op === "createProfile") {
      if (data.profiles.some((item) => item.id === action.id)) throw new Error("资料空间已存在");
      data.profiles.push(createProfile(id(action.id), string(action.name, 60, "资料空间名称", true)));
      return validateData(data);
    }
    const current = data.profiles.find((item) => item.id === action.profileId);
    if (!current) throw new Error("找不到资料空间，请重新选择");
    const upsert = (list, item) => {
      const index = list.findIndex((existing) => existing.id === item.id);
      if (index >= 0) list[index] = item;
      else list.push(item);
    };
    switch (action.op) {
      case "settings":
        current.settings = settings({
          ...current.settings, ...action.patch,
          modules: { ...current.settings.modules, ...action.patch?.modules },
          reading: { ...current.settings.reading, ...action.patch?.reading },
          drafts: { ...current.settings.drafts, ...action.patch?.drafts }
        });
        break;
      case "saveTemplate": upsert(current.templates, template(action.value)); break;
      case "deleteTemplate": current.templates = current.templates.filter((item) => item.id !== action.id); break;
      case "saveFavorite": upsert(current.favorites, favorite(action.value)); break;
      case "note": {
        const item = current.favorites.find((entry) => entry.id === action.id);
        if (!item) throw new Error("收藏已被删除");
        item.note = string(action.note, 5000, "备注");
        break;
      }
      case "deleteFavorite": current.favorites = current.favorites.filter((item) => item.id !== action.id); break;
      case "clearProfile": current.templates = []; current.favorites = []; current.settings = settings(); break;
      case "clearDrafts": break; // The worker clears the separate draft store in the same transaction.
      case "restore": {
        const restored = parseBackup(action.backup);
        Object.assign(current, restored, { id: current.id, name: current.name });
        current.settings.modules.drafts = false;
        break;
      }
      default: throw new Error("未知资料操作");
    }
    return validateData(data);
  }
  function backup(current) {
    const saved = profile(current);
    saved.settings.modules.drafts = false;
    return { format: "chatgpt-assistant-backup", version: VERSION, profile: saved };
  }
  function parseBackup(value) {
    if (value?.format !== "chatgpt-assistant-backup" || value.version !== VERSION) throw new Error("不是受支持的助手备份文件");
    return profile(value.profile);
  }
  function variables(body) { return [...new Set([...body.matchAll(/\{([^{}\n]{1,40})\}/g)].map((match) => match[1]))]; }
  function renderTemplate(body, values) {
    const missing = variables(body).filter((key) => !String(values[key] ?? "").trim());
    return { text: body.replace(/\{([^{}\n]{1,40})\}/g, (match, key) => String(values[key] ?? "").trim() || match), missing };
  }
  function quoteDraft(text, action) {
    return `引用原文：\n${text.trim().split("\n").map((line) => `> ${line}`).join("\n")}\n\n${action.trim()}`;
  }
  function fingerprint(text) {
    let hash = 2166136261;
    for (let i = 0; i < text.length; i += 1) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
    return `${text.length}-${(hash >>> 0).toString(16)}`;
  }
  function search(entries, query, role = "all", limit = 1000) {
    const needle = query.trim();
    if (!needle) return { matches: [], total: 0 };
    // RegExp /iu keeps match offsets in the original text even for Unicode case folding.
    const pattern = new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "giu");
    const matches = []; let total = 0;
    for (const entry of entries) {
      if (role !== "all" && entry.role !== role) continue;
      pattern.lastIndex = 0;
      for (const match of entry.text.matchAll(pattern)) {
        total += 1;
        if (matches.length < limit) matches.push({ key: entry.key, start: match.index, end: match.index + match[0].length });
      }
    }
    return { matches, total };
  }
  function draftData(value) {
    if (!value) return { version: 1, revision: 0, epochs: {}, items: [] };
    if (value.version !== 1 || !Array.isArray(value.items) || value.items.length > 500) throw new Error("草稿资料格式无效或版本不受支持");
    const epochs = Object.fromEntries(Object.entries(value.epochs || {}).map(([key, epoch]) => [id(key), id(epoch)]));
    const items = value.items.map((item) => {
      const url = safeUrl(item.url);
      if (!url || !Number.isFinite(item.updatedAt) || !Number.isFinite(item.expiresAt) || item.expiresAt <= item.updatedAt) throw new Error("草稿来源或日期无效");
      return { id: id(item.id), profileId: id(item.profileId), owner: id(item.owner), url,
        title: string(item.title, 500, "草稿标题"), text: string(item.text, 100000, "草稿正文", true),
        updatedAt: item.updatedAt, expiresAt: item.expiresAt };
    });
    return { version: 1, revision: Number.isSafeInteger(value.revision) ? value.revision : 0, epochs, items };
  }
  function pruneDrafts(value, profiles, now = Date.now()) {
    const data = draftData(value);
    data.items = data.items.filter((item) => {
      const current = profiles.find((entry) => entry.id === item.profileId);
      if (!current?.settings.modules.drafts) return false;
      item.expiresAt = Math.min(item.expiresAt, item.updatedAt + current.settings.drafts.retentionDays * 86400000);
      return item.expiresAt > now;
    });
    return data;
  }
  const api = { VERSION, STORAGE_KEY, DRAFT_STORAGE_KEY, MODULES, DEFAULT_SETTINGS, settings, safeUrl, template, favorite, profile,
    draftData, pruneDrafts,
    createProfile, initialData, validateData, applyAction, backup, parseBackup, variables, renderTemplate, quoteDraft, fingerprint, search };
  global.ChatGPTAssistantCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(globalThis);
