"use strict";

const CHATGPT_URL = /^https:\/\/(chatgpt\.com|chat\.openai\.com)\//i;

function createMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "chatgpt-export-markdown",
      title: "导出当前 ChatGPT 对话为 Markdown",
      contexts: ["page"],
      documentUrlPatterns: ["https://chatgpt.com/*", "https://chat.openai.com/*"]
    });
    chrome.contextMenus.create({
      id: "chatgpt-export-html",
      title: "导出当前 ChatGPT 对话为 HTML",
      contexts: ["page"],
      documentUrlPatterns: ["https://chatgpt.com/*", "https://chat.openai.com/*"]
    });
  });
}

chrome.runtime.onInstalled.addListener(createMenus);

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request?.type !== "OPEN_EXPORT_POPUP") return;

  if (typeof chrome.action?.openPopup !== "function") {
    sendResponse({
      ok: false,
      error: "当前浏览器版本不支持从页面打开扩展弹窗，请点击浏览器工具栏中的扩展图标"
    });
    return;
  }

  const options = Number.isInteger(sender.tab?.windowId)
    ? { windowId: sender.tab.windowId }
    : undefined;

  try {
    const opened = options
      ? chrome.action.openPopup(options)
      : chrome.action.openPopup();
    Promise.resolve(opened).then(() => {
      sendResponse({ ok: true });
    }).catch((error) => {
      sendResponse({ ok: false, error: error?.message || String(error) });
    });
  } catch (error) {
    sendResponse({ ok: false, error: error?.message || String(error) });
  }

  return true;
});

async function ensureContentScript(tabId) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, { type: "PING" });
    if (response?.ok) return;
  } catch {
    // The extension may have just been installed while the ChatGPT tab was open.
  }

  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["src/export-core.js", "src/content.js"]
  });
}

async function quickExport(tab, format = "markdown") {
  if (!tab?.id || !CHATGPT_URL.test(tab.url || "")) return;
  try {
    await ensureContentScript(tab.id);
    await chrome.tabs.sendMessage(tab.id, { type: "QUICK_EXPORT", format });
  } catch (error) {
    console.error("[ChatGPT Exporter] 快捷导出失败", error);
  }
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "chatgpt-export-markdown") quickExport(tab, "markdown");
  if (info.menuItemId === "chatgpt-export-html") quickExport(tab, "html");
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "quick-export-markdown") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  await quickExport(tab, "markdown");
});
