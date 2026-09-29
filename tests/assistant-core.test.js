"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const crypto = require("node:crypto");
const core = require("../src/assistant-core.js");
const action = (data, value) => core.applyAction(data, { profileId: "default", ...value });
function sampleFavorite() {
  return { id: "favorite-1", title: "问题", url: "https://chatgpt.com/c/test", role: "assistant", messageId: "m-1", text: "完整回答", markdown: "**完整回答**", fingerprint: core.fingerprint("完整回答"), note: "", createdAt: "2026-09-21T00:00:00Z" };
}

test("template variables are deduplicated, omissions reported, dollar text preserved", () => {
  const result = core.renderTemplate("给{受众}解释{主题}，再总结{主题}", { 主题: "$& <script> 中文" });
  assert.deepEqual(result.missing, ["受众"]);
  assert.equal(result.text, "给{受众}解释$& <script> 中文，再总结$& <script> 中文");
});

test("literal Unicode search preserves offsets and role filtering", () => {
  const entries = [{ key: "u", role: "user", text: "İ ABC [a] 中文 中文" }, { key: "a", role: "assistant", text: "中文" }];
  assert.deepEqual(core.search(entries, "ABC").matches[0], { key: "u", start: 2, end: 5 });
  assert.equal(core.search(entries, "[a]").matches[0].start, 6);
  assert.equal(core.search(entries, "中文", "user", 1).total, 2);
  assert.equal(core.search(entries, "中文", "user", 1).matches.length, 1);
  assert.equal(core.search(entries, " ").total, 0);
});

test("settings merge individual modules without resetting other preferences", () => {
  let data = action(core.initialData(), { op: "settings", patch: { modules: { search: false }, reading: { width: 1000 } } });
  data = action(data, { op: "settings", patch: { modules: { quote: false }, reading: { fontSize: 20 } } });
  assert.equal(data.profiles[0].settings.modules.search, false);
  assert.equal(data.profiles[0].settings.reading.width, 1000);
  assert.equal(data.profiles[0].settings.reading.fontSize, 20);
});

test("backup roundtrip preserves templates, note, snapshot and settings", () => {
  let data = action(core.initialData(), { op: "saveFavorite", value: sampleFavorite() });
  data = action(data, { op: "note", id: "favorite-1", note: "可复用的结论" });
  const saved = data.profiles[0];
  const restored = action(core.initialData(), { op: "restore", backup: JSON.parse(JSON.stringify(core.backup(saved))) });
  assert.deepEqual(restored.profiles[0], saved);
});

test("backup validation rejects unknown versions, duplicate IDs and unsafe source URLs", () => {
  assert.throws(() => core.parseBackup({ format: "chatgpt-assistant-backup", version: 99 }), /备份/);
  const backup = core.backup(core.initialData().profiles[0]);
  backup.profile.templates.push(backup.profile.templates[0]);
  assert.throws(() => core.parseBackup(backup), /重复/);
  for (const url of ["javascript:alert(1)", "https://chatgpt.com.evil.test/c/x", "http://chatgpt.com/c/x", "https://example.com"]) {
    assert.throws(() => core.favorite({ ...sampleFavorite(), url }), /来源/);
  }
  assert.throws(() => core.validateData({ version: 22, profiles: [] }), /版本/);
});

test("manual profile actions do not cross into other profiles or mutate source", () => {
  const initial = core.initialData();
  let data = core.applyAction(initial, { op: "createProfile", id: "work", name: "工作" });
  data = core.applyAction(data, { op: "saveFavorite", profileId: "work", value: sampleFavorite() });
  data = action(data, { op: "clearProfile" });
  assert.equal(data.profiles[0].templates.length, 0);
  assert.equal(data.profiles[1].favorites.length, 1);
  assert.equal(initial.profiles.length, 1);
  assert.equal(initial.profiles[0].templates.length, 3);
});

test("delete and restore favorite retains exact snapshot", () => {
  let data = action(core.initialData(), { op: "saveFavorite", value: sampleFavorite() });
  const saved = data.profiles[0].favorites[0];
  data = action(data, { op: "deleteFavorite", id: saved.id });
  assert.equal(data.profiles[0].favorites.length, 0);
  data = action(data, { op: "saveFavorite", value: saved });
  assert.deepEqual(data.profiles[0].favorites[0], saved);
});

test("quote helper includes only provided fragment with every line quoted", () => {
  assert.equal(core.quoteDraft("第一行\n第二行", "解释"), "引用原文：\n> 第一行\n> 第二行\n\n解释");
});

function storeHarness() {
  let listener, failNext = false;
  const persisted = { exportSettings: { theme: "dark" } }, session = {};
  const chrome = {
    runtime: { id: "test", onMessage: { addListener(fn) { listener = fn; } } },
    storage: { session: { async get(key) { return { [key]: session[key] }; }, async set(value) { Object.assign(session, value); } }, local: {
      async get(key) { await new Promise((resolve) => setTimeout(resolve, 1)); return structuredClone(Object.fromEntries((Array.isArray(key) ? key : [key]).map((entry) => [entry, persisted[entry]]))); },
      async set(value) { if (failNext) { failNext = false; throw new Error("QUOTA_BYTES quota exceeded"); } Object.assign(persisted, structuredClone(value)); }
    } }
  };
  vm.runInNewContext(fs.readFileSync(require.resolve("../src/assistant-store.js"), "utf8"), { chrome, ChatGPTAssistantCore: core, Promise, crypto });
  return {
    persisted, fail() { failNext = true; },
    request(action) { return new Promise((resolve) => listener({ type: "ASSISTANT_DATA", action }, { id: "test" }, resolve)); },
    drafts(action, tab = 1) { return new Promise((resolve) => listener({ type: "ASSISTANT_DRAFTS", action: { profileId: "default", ...action } }, { id: "test", tab: tab === null ? undefined : { id: tab } }, resolve)); }
  };
}

test("service worker serializes simultaneous tab writes and preserves export settings", async () => {
  const store = storeHarness();
  const results = await Promise.all([
    store.request({ op: "saveFavorite", profileId: "default", value: sampleFavorite() }),
    store.request({ op: "saveTemplate", profileId: "default", value: { id: "tab2", title: "另一标签页", body: "中文" } })
  ]);
  assert.ok(results.every((item) => item.ok));
  assert.equal(store.persisted.assistantData.profiles[0].favorites.length, 1);
  assert.equal(store.persisted.assistantData.profiles[0].templates.length, 4);
  assert.deepEqual(store.persisted.exportSettings, { theme: "dark" });
});

test("failed storage write is reported, does not erase data or block later writes", async () => {
  const store = storeHarness(); await store.request();
  store.fail();
  const response = await store.request({ op: "clearProfile", profileId: "default" });
  assert.equal(response.ok, false);
  assert.match(response.error, /quota/);
  assert.equal(store.persisted.assistantData.profiles[0].templates.length, 3);
  assert.equal((await store.request({ op: "settings", profileId: "default", patch: { modules: { reading: false } } })).ok, true);
});

const draftUrl = "https://chatgpt.com/c/drafts";
async function enableDrafts(store, profileId = "default") {
  const response = await store.request({ op: "settings", profileId, patch: { modules: { drafts: true } } });
  assert.equal(response.ok, true);
  return (await store.drafts({ profileId, op: "list" })).epoch;
}
const saveDraft = (epoch, text = "未发送的中文草稿", extra = {}) => ({ op: "save", epoch, url: draftUrl, title: "测试会话", text, ...extra });

test("old profiles keep draft recovery disabled and backup restore never opts in", () => {
  const old = core.initialData();
  delete old.profiles[0].settings.drafts; delete old.profiles[0].settings.modules.drafts;
  assert.equal(core.validateData(old).profiles[0].settings.modules.drafts, false);
  const enabled = action(old, { op: "settings", patch: { modules: { drafts: true }, drafts: { retentionDays: 30 } } });
  const backup = core.backup(enabled.profiles[0]);
  assert.equal(backup.profile.settings.modules.drafts, false);
  backup.profile.settings.modules.drafts = true;
  assert.equal(action(enabled, { op: "restore", backup }).profiles[0].settings.modules.drafts, false);
  assert.equal(core.settings({ drafts: { retentionDays: -1 } }).drafts.retentionDays, 7);
});

test("drafts require opt-in, isolate duplicate tabs, conversations and manual profiles", async () => {
  const store = storeHarness();
  assert.equal((await store.drafts(saveDraft("initial"))).stale, true);
  const epoch = await enableDrafts(store);
  await store.request({ op: "createProfile", id: "work", name: "工作" });
  await enableDrafts(store, "work");
  const results = await Promise.all([
    store.drafts(saveDraft(epoch, "标签一"), 1), store.drafts(saveDraft(epoch, "标签二"), 2),
    store.drafts(saveDraft(epoch, "另一会话", { url: "https://chatgpt.com/c/other" }), 1),
    store.drafts(saveDraft(epoch, "工作草稿", { profileId: "work" }), 1)
  ]);
  assert.ok(results.every((item) => item.ok));
  const listed = await store.drafts({ op: "list", url: draftUrl });
  assert.equal(listed.items.length, 2);
  assert.notEqual(listed.items[0].owner, listed.items[1].owner);
  await store.drafts(saveDraft(epoch, "标签一更新"), 1);
  assert.equal((await store.drafts({ op: "list" })).items.length, 3);
  assert.equal((await store.drafts({ op: "list", profileId: "work" })).items[0].text, "工作草稿");
  assert.equal((await store.drafts(saveDraft(epoch), null)).ok, false);
});

test("successful send only deletes the sending tab's matching draft, preserving newer edits", async () => {
  const store = storeHarness(), epoch = await enableDrafts(store);
  await store.drafts(saveDraft(epoch, "旧草稿"), 1);
  await store.drafts(saveDraft(epoch, "旧草稿"), 2);
  await store.drafts(saveDraft(epoch, "新草稿"), 1);
  await store.drafts({ op: "sent", url: draftUrl, text: "旧草稿" }, 1);
  assert.equal((await store.drafts({ op: "list" })).items.length, 2);
  await store.drafts({ op: "sent", url: draftUrl, text: "新草稿" }, 1);
  const remaining = (await store.drafts({ op: "list" })).items;
  assert.equal(remaining.length, 1); assert.equal(remaining[0].text, "旧草稿");
});

test("clearing or disabling invalidates delayed saves and leaves other spaces intact", async () => {
  const store = storeHarness(), epoch = await enableDrafts(store);
  await store.request({ op: "createProfile", id: "work", name: "工作" });
  await enableDrafts(store, "work");
  await store.drafts(saveDraft("initial", "工作", { profileId: "work" }));
  await store.drafts(saveDraft(epoch));
  await store.request({ op: "clearDrafts", profileId: "default" });
  assert.equal((await store.drafts(saveDraft(epoch, "迟到的保存"))).stale, true);
  assert.equal((await store.drafts({ op: "list" })).items.length, 0);
  assert.equal((await store.drafts({ op: "list", profileId: "work" })).items.length, 1);
  const next = (await store.drafts({ op: "list" })).epoch;
  await store.drafts(saveDraft(next));
  await store.request({ op: "settings", profileId: "default", patch: { modules: { drafts: false } } });
  assert.equal(store.persisted.assistantDrafts.items.length, 1);
  await enableDrafts(store);
  assert.equal((await store.drafts(saveDraft(next))).stale, true);
});

test("expiry pruning honors shorter retention without resurrecting expired drafts", async () => {
  const store = storeHarness(), epoch = await enableDrafts(store);
  await store.drafts(saveDraft(epoch));
  const item = store.persisted.assistantDrafts.items[0];
  item.updatedAt = Date.now() - 2 * 86400000;
  await store.request({ op: "settings", profileId: "default", patch: { drafts: { retentionDays: 1 } } });
  assert.equal(store.persisted.assistantDrafts.items.length, 0);
  await store.drafts(saveDraft(epoch));
  store.persisted.assistantDrafts.items[0].updatedAt = Date.now() - 1000;
  store.persisted.assistantDrafts.items[0].expiresAt = Date.now() - 1;
  assert.equal((await store.drafts({ op: "list" })).items.length, 0);
});

test("draft storage failures preserve prior text and subsequent writes recover", async () => {
  const store = storeHarness(), epoch = await enableDrafts(store);
  await store.drafts(saveDraft(epoch, "可恢复的版本"));
  store.fail();
  const failed = await store.drafts(saveDraft(epoch, "失败的版本"));
  assert.equal(failed.ok, false); assert.match(failed.error, /quota/);
  assert.equal(store.persisted.assistantDrafts.items[0].text, "可恢复的版本");
  assert.equal((await store.drafts(saveDraft(epoch, "稍后重试"))).ok, true);
  assert.equal((await store.drafts(saveDraft(epoch, "x".repeat(100001)))).ok, false);
  assert.equal((await store.drafts(saveDraft(epoch, "错误来源", { url: "https://example.com" }))).ok, false);
});
