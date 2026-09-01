"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

require("../src/export-core.js");
const core = globalThis.ChatGPTExporterCore;

function fixture() {
  return {
    title: "测试 / 对话",
    url: "https://chatgpt.com/c/example",
    exportedAt: "2026-09-01T01:02:03.000Z",
    messages: [
      { id: "message-1", index: 1, role: "user", text: "你好", markdown: "你好", html: "<p>你好</p>" },
      { id: "message-2", index: 2, role: "assistant", text: "你好！", markdown: "**你好！**", html: "<p><strong>你好！</strong></p>" },
      { id: "message-3", index: 3, role: "user", text: "代码", markdown: "`code`", html: "<p><code>code</code></p>" }
    ]
  };
}

test("selectMessages supports range and role filters", () => {
  const selected = core.selectMessages(fixture(), {
    from: 2,
    to: 3,
    roles: { user: false, assistant: true }
  });
  assert.deepEqual(selected.map((message) => message.index), [2]);
});

test("selectMessages supports non-contiguous message IDs", () => {
  const selected = core.selectMessages(fixture(), {
    from: 2,
    to: 2,
    selectedMessageIds: ["message-1", "message-3", "message-1"]
  });
  assert.deepEqual(selected.map((message) => message.index), [1, 3]);
});

test("an explicit empty message selection exports nothing", () => {
  assert.deepEqual(core.selectMessages(fixture(), { selectedMessageIds: [] }), []);
});

test("buildMarkdown exports only explicitly selected non-contiguous messages", () => {
  const markdown = core.buildMarkdown(fixture(), {
    selectedMessageIds: ["message-1", "message-3"]
  });
  assert.match(markdown, /message_count: 2/);
  assert.match(markdown, /你好/);
  assert.match(markdown, /`code`/);
  assert.doesNotMatch(markdown, /\*\*你好！\*\*/);
});

test("role filters also apply to a non-contiguous message selection", () => {
  const selected = core.selectMessages(fixture(), {
    selectedMessageIds: ["message-1", "message-2", "message-3"],
    roles: { user: false, assistant: true }
  });
  assert.deepEqual(selected.map((message) => message.id), ["message-2"]);
});

test("buildMarkdown emits metadata and selected messages", () => {
  const markdown = core.buildMarkdown(fixture(), {
    from: 1,
    to: 2,
    roles: { user: true, assistant: true },
    includeMetadata: true
  });
  assert.match(markdown, /^---\ntitle: "测试 \/ 对话"/);
  assert.match(markdown, /message_count: 2/);
  assert.match(markdown, /## 👤 用户/);
  assert.match(markdown, /## 🤖 ChatGPT/);
  assert.doesNotMatch(markdown, /`code`/);
});

test("buildHtml creates a standalone themed document and escapes metadata", () => {
  const snapshot = fixture();
  snapshot.title = '<img src=x onerror="alert(1)">';
  const html = core.buildHtml(snapshot, { theme: "dark" });
  assert.match(html, /^<!doctype html>/);
  assert.match(html, /class="theme-dark"/);
  assert.match(html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
  assert.match(html, /<section class="message message-user"/);
  assert.match(html, /@media print/);
});

test("safeFilename strips reserved characters and trailing dots", () => {
  assert.equal(core.safeFilename('  A/B:C*D? "E"...  '), "A-B-C-D- -E");
  assert.equal(core.createFilename("标题/测试", "md", new Date(2026, 8, 1)), "标题-测试-2026-09-01.md");
});

test("empty selection still produces a valid document", () => {
  const snapshot = fixture();
  snapshot.messages = [];
  const markdown = core.buildMarkdown(snapshot);
  const html = core.buildHtml(snapshot);
  assert.match(markdown, /message_count: 0/);
  assert.match(html, /消息数量：0/);
});
