"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const backgroundSource = fs.readFileSync(
  path.join(__dirname, "../src/background.js"),
  "utf8"
);

function loadBackground(overrides = {}) {
  const listeners = {};
  const calls = { openPopup: [] };
  const chrome = {
    action: {
      openPopup: async (options) => {
        calls.openPopup.push(options);
      }
    },
    commands: { onCommand: { addListener(listener) { listeners.command = listener; } } },
    contextMenus: {
      create() {},
      removeAll(callback) { callback(); },
      onClicked: { addListener(listener) { listeners.contextMenu = listener; } }
    },
    runtime: {
      onInstalled: { addListener(listener) { listeners.installed = listener; } },
      onMessage: { addListener(listener) { listeners.message = listener; } }
    },
    scripting: { executeScript: async () => {} },
    tabs: {
      query: async () => [],
      sendMessage: async () => ({ ok: true })
    }
  };

  Object.assign(chrome.action, overrides.action);
  vm.runInNewContext(backgroundSource, { chrome, console, Promise }, {
    filename: "src/background.js"
  });
  return { listeners, calls };
}

function dispatch(listener, request, sender = {}) {
  return new Promise((resolve) => {
    const keepChannelOpen = listener(request, sender, resolve);
    assert.equal(keepChannelOpen, true);
  });
}

test("page export request opens the action popup in the sender window", async () => {
  const { listeners, calls } = loadBackground();
  const response = await dispatch(
    listeners.message,
    { type: "OPEN_EXPORT_POPUP" },
    { tab: { id: 7, windowId: 23 } }
  );

  assert.equal(calls.openPopup.length, 1);
  assert.equal(calls.openPopup[0].windowId, 23);
  assert.equal(response.ok, true);
});

test("page export request reports openPopup failures", async () => {
  const { listeners } = loadBackground({
    action: {
      openPopup: async () => {
        throw new Error("popup blocked");
      }
    }
  });
  const response = await dispatch(
    listeners.message,
    { type: "OPEN_EXPORT_POPUP" },
    { tab: { windowId: 4 } }
  );

  assert.equal(response.ok, false);
  assert.equal(response.error, "popup blocked");
});

test("unrelated runtime messages are ignored", () => {
  const { listeners, calls } = loadBackground();
  let responded = false;
  const result = listeners.message({ type: "PING" }, {}, () => {
    responded = true;
  });

  assert.equal(result, undefined);
  assert.equal(responded, false);
  assert.deepEqual(calls.openPopup, []);
});
