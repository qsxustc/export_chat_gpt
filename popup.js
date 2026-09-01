(function initPopup() {
  "use strict";

  const core = globalThis.ChatGPTExporterCore;
  const state = {
    tab: null,
    snapshot: null,
    pageSelectionIds: null,
    lastGeneratedFilename: "",
    saveTimer: null
  };

  const elements = {
    loading: document.getElementById("loading"),
    errorState: document.getElementById("errorState"),
    errorMessage: document.getElementById("errorMessage"),
    retryButton: document.getElementById("retryButton"),
    form: document.getElementById("exportForm"),
    title: document.getElementById("conversationTitle"),
    messageCount: document.getElementById("messageCount"),
    rangeFrom: document.getElementById("rangeFrom"),
    rangeTo: document.getElementById("rangeTo"),
    selectedCount: document.getElementById("selectedCount"),
    selectOnPageButton: document.getElementById("selectOnPageButton"),
    clearPageSelectionButton: document.getElementById("clearPageSelectionButton"),
    pageSelectionStatus: document.getElementById("pageSelectionStatus"),
    includeUser: document.getElementById("includeUser"),
    includeAssistant: document.getElementById("includeAssistant"),
    includeRoleLabels: document.getElementById("includeRoleLabels"),
    includeMetadata: document.getElementById("includeMetadata"),
    includeSeparators: document.getElementById("includeSeparators"),
    themeRow: document.getElementById("themeRow"),
    theme: document.getElementById("theme"),
    filename: document.getElementById("filename"),
    previewPanel: document.getElementById("previewPanel"),
    previewContent: document.getElementById("previewContent"),
    status: document.getElementById("actionStatus"),
    copyButton: document.getElementById("copyButton"),
    exportButton: document.getElementById("exportButton")
  };

  function selectedFormat() {
    return document.querySelector('input[name="format"]:checked')?.value || "markdown";
  }

  function isSupportedUrl(url) {
    return /^https:\/\/(chatgpt\.com|chat\.openai\.com)\//i.test(url || "");
  }

  async function sendToTab(message) {
    return chrome.tabs.sendMessage(state.tab.id, message);
  }

  async function ensureContentScript() {
    try {
      const response = await sendToTab({ type: "PING" });
      if (response?.ok) return;
    } catch {
      // Existing tabs do not receive new content scripts until refreshed, so inject now.
    }

    await chrome.scripting.executeScript({
      target: { tabId: state.tab.id },
      files: ["src/export-core.js", "src/content.js"]
    });
  }

  function showError(message) {
    elements.loading.hidden = true;
    elements.form.hidden = true;
    elements.errorMessage.textContent = message;
    elements.errorState.hidden = false;
  }

  function showStatus(message, isError = false) {
    elements.status.textContent = message;
    elements.status.classList.toggle("error", isError);
    if (message) {
      window.setTimeout(() => {
        if (elements.status.textContent === message) elements.status.textContent = "";
      }, 2600);
    }
  }

  async function restoreSettings() {
    try {
      const { exportSettings = {} } = await chrome.storage.local.get("exportSettings");
      const format = exportSettings.format === "html" ? "html" : "markdown";
      const radio = document.querySelector(`input[name="format"][value="${format}"]`);
      if (radio) radio.checked = true;
      if (typeof exportSettings.includeUser === "boolean") elements.includeUser.checked = exportSettings.includeUser;
      if (typeof exportSettings.includeAssistant === "boolean") elements.includeAssistant.checked = exportSettings.includeAssistant;
      if (typeof exportSettings.includeRoleLabels === "boolean") elements.includeRoleLabels.checked = exportSettings.includeRoleLabels;
      if (typeof exportSettings.includeMetadata === "boolean") elements.includeMetadata.checked = exportSettings.includeMetadata;
      if (typeof exportSettings.includeSeparators === "boolean") elements.includeSeparators.checked = exportSettings.includeSeparators;
      if (["system", "light", "dark"].includes(exportSettings.theme)) elements.theme.value = exportSettings.theme;
    } catch (error) {
      console.warn("[ChatGPT Exporter] 无法读取设置", error);
    }
  }

  function scheduleSaveSettings() {
    window.clearTimeout(state.saveTimer);
    state.saveTimer = window.setTimeout(() => {
      chrome.storage.local.set({
        exportSettings: {
          format: selectedFormat(),
          includeUser: elements.includeUser.checked,
          includeAssistant: elements.includeAssistant.checked,
          includeRoleLabels: elements.includeRoleLabels.checked,
          includeMetadata: elements.includeMetadata.checked,
          includeSeparators: elements.includeSeparators.checked,
          theme: elements.theme.value
        }
      }).catch((error) => console.warn("[ChatGPT Exporter] 无法保存设置", error));
    }, 120);
  }

  function getOptions() {
    return {
      from: Number.parseInt(elements.rangeFrom.value, 10) || 1,
      to: Number.parseInt(elements.rangeTo.value, 10) || state.snapshot.messages.length,
      selectedMessageIds: state.pageSelectionIds,
      roles: {
        user: elements.includeUser.checked,
        assistant: elements.includeAssistant.checked,
        system: true,
        tool: true
      },
      includeRoleLabels: elements.includeRoleLabels.checked,
      includeMetadata: elements.includeMetadata.checked,
      includeSource: elements.includeMetadata.checked,
      includeSeparators: elements.includeSeparators.checked,
      theme: elements.theme.value
    };
  }

  function createExport() {
    const format = selectedFormat();
    const options = getOptions();
    const messages = core.selectMessages(state.snapshot, options);
    if (!messages.length) throw new Error("当前筛选条件下没有可导出的消息");
    return {
      format,
      messages,
      content: format === "html"
        ? core.buildHtml(state.snapshot, options)
        : core.buildMarkdown(state.snapshot, options)
    };
  }

  function expectedExtension() {
    return selectedFormat() === "html" ? "html" : "md";
  }

  function generatedFilename() {
    return core.createFilename(state.snapshot?.title || "ChatGPT 对话", expectedExtension());
  }

  function refreshFilename(force = false) {
    const current = elements.filename.value;
    if (force || !current || current === state.lastGeneratedFilename) {
      state.lastGeneratedFilename = generatedFilename();
      elements.filename.value = state.lastGeneratedFilename;
    }
  }

  function finalFilename() {
    const extension = expectedExtension();
    const raw = elements.filename.value.trim().replace(/\.(?:md|html)$/i, "");
    return `${core.safeFilename(raw || state.snapshot.title)}.${extension}`;
  }

  function updateUi() {
    if (!state.snapshot) return;
    const hasPageSelection = Array.isArray(state.pageSelectionIds);
    const count = core.selectMessages(state.snapshot, getOptions()).length;
    elements.selectedCount.textContent = `已选 ${count} 条`;
    elements.rangeFrom.disabled = hasPageSelection;
    elements.rangeTo.disabled = hasPageSelection;
    elements.selectOnPageButton.querySelector("span").textContent = hasPageSelection
      ? "重新在页面选择"
      : "在页面逐条选择";
    elements.clearPageSelectionButton.hidden = !hasPageSelection;
    elements.pageSelectionStatus.hidden = !hasPageSelection;
    if (hasPageSelection) {
      elements.pageSelectionStatus.textContent = `页面已指定 ${state.pageSelectionIds.length} 条消息；角色筛选后将导出 ${count} 条。`;
    }
    elements.exportButton.disabled = count === 0;
    elements.copyButton.disabled = count === 0;
    elements.themeRow.hidden = selectedFormat() !== "html";
    refreshFilename();
    if (elements.previewPanel.open) refreshPreview();
    scheduleSaveSettings();
  }

  function refreshPreview() {
    try {
      const { content } = createExport();
      const limit = 30_000;
      elements.previewContent.textContent = content.length > limit
        ? `${content.slice(0, limit)}\n\n…（预览已截断，导出文件包含完整内容）`
        : content;
    } catch (error) {
      elements.previewContent.textContent = error.message;
    }
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      const copied = document.execCommand("copy");
      textarea.remove();
      if (!copied) throw new Error("浏览器拒绝了剪贴板访问");
    }
  }

  async function handleStartPageSelection() {
    try {
      elements.selectOnPageButton.disabled = true;
      const response = await sendToTab({
        type: "START_MESSAGE_SELECTION",
        initialMessageIds: state.pageSelectionIds || []
      });
      if (!response?.ok) throw new Error(response?.error || "无法进入逐条选择模式");
      window.close();
    } catch (error) {
      showStatus(error.message || "无法进入逐条选择模式", true);
      elements.selectOnPageButton.disabled = false;
    }
  }

  async function handleClearPageSelection() {
    state.pageSelectionIds = null;
    try {
      await sendToTab({ type: "CLEAR_MESSAGE_SELECTION" });
    } catch {
      // The selection was already consumed into this popup, so local cleanup is enough.
    }
    updateUi();
  }

  async function handleCopy() {
    try {
      elements.copyButton.disabled = true;
      const result = createExport();
      await copyText(result.content);
      showStatus(`已复制 ${result.messages.length} 条消息`);
    } catch (error) {
      showStatus(error.message || "复制失败", true);
    } finally {
      updateUi();
    }
  }

  async function handleExport(event) {
    event.preventDefault();
    try {
      elements.exportButton.disabled = true;
      const result = createExport();
      const filename = finalFilename();
      const response = await sendToTab({
        type: "DOWNLOAD_EXPORT",
        filename,
        content: result.content,
        mimeType: result.format === "html" ? "text/html" : "text/markdown"
      });
      if (!response?.ok) throw new Error(response?.error || "下载未能开始");
      elements.filename.value = filename;
      showStatus(`已导出 ${result.messages.length} 条消息`);
    } catch (error) {
      showStatus(error.message || "导出失败", true);
    } finally {
      updateUi();
    }
  }

  async function initialize() {
    elements.loading.hidden = false;
    elements.errorState.hidden = true;
    elements.form.hidden = true;

    try {
      await restoreSettings();
      [state.tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!state.tab?.id || !isSupportedUrl(state.tab.url)) {
        throw new Error("请先打开 chatgpt.com 中的一段对话，再点击扩展图标。");
      }
      await ensureContentScript();
      const response = await sendToTab({
        type: "EXTRACT_CONVERSATION",
        consumeMessageSelection: true
      });
      if (!response?.ok) throw new Error(response?.error || "页面内容读取失败");
      if (!response.snapshot?.messages?.length) {
        throw new Error("没有检测到对话消息。请打开具体会话，并等待回复加载完成。");
      }

      state.snapshot = response.snapshot;
      state.pageSelectionIds = Array.isArray(response.messageSelection?.messageIds)
        ? response.messageSelection.messageIds
        : null;
      const count = state.snapshot.messages.length;
      elements.title.textContent = state.snapshot.title;
      elements.title.title = state.snapshot.title;
      elements.messageCount.textContent = `${count} 条消息`;
      elements.rangeFrom.max = String(count);
      elements.rangeTo.max = String(count);
      elements.rangeTo.value = String(count);
      elements.loading.hidden = true;
      elements.form.hidden = false;
      refreshFilename(true);
      updateUi();
    } catch (error) {
      console.error("[ChatGPT Exporter]", error);
      showError(error.message || "无法访问当前页面");
    }
  }

  document.querySelectorAll('input[name="format"]').forEach((radio) => {
    radio.addEventListener("change", updateUi);
  });
  [
    elements.rangeFrom,
    elements.rangeTo,
    elements.includeUser,
    elements.includeAssistant,
    elements.includeRoleLabels,
    elements.includeMetadata,
    elements.includeSeparators,
    elements.theme
  ].forEach((control) => control.addEventListener("change", updateUi));
  [elements.rangeFrom, elements.rangeTo].forEach((control) => control.addEventListener("input", updateUi));
  elements.previewPanel.addEventListener("toggle", () => {
    if (elements.previewPanel.open) refreshPreview();
  });
  elements.selectOnPageButton.addEventListener("click", handleStartPageSelection);
  elements.clearPageSelectionButton.addEventListener("click", handleClearPageSelection);
  elements.copyButton.addEventListener("click", handleCopy);
  elements.form.addEventListener("submit", handleExport);
  elements.retryButton.addEventListener("click", initialize);

  initialize();
})();
