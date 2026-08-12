/*
 * download-popup/window.js —— 下载方式选择弹窗（浏览器窗口形式）
 * 功能：展示/编辑文件名（P-01）、展示链接（P-02）、三按钮（P-03/P-04/P-07）、
 *       关闭即取消（P-06）、点击后执行下载（P-05/P-08）、RPC 失败提示（R-06）
 */

let info = null;   // 待下载信息
let cfg = null;    // 扩展配置
let busy = false;  // 是否正在执行下载

document.addEventListener("DOMContentLoaded", init);

async function init() {
  const resp = await browser.runtime.sendMessage({ type: "get-pending" });

  if (!resp || !resp.pending) {
    showError("没有待处理的下载请求。");
    return;
  }

  info = resp.pending;
  cfg = resp.cfg;
  applyTheme(cfg.darkMode);

  // P-01：文件名可编辑
  $("filename").value = info.filename || "";

  // P-02：链接只读 + hover 完整 + 复制按钮
  const urlInput = $("url");
  urlInput.value = info.url || "";
  urlInput.title = info.url || "";

  // P-04：按钮文字读取自定义名称
  $("btnDl1").textContent = (cfg.downloader1 && cfg.downloader1.name) || "下载器1";
  $("btnDl2").textContent = (cfg.downloader2 && cfg.downloader2.name) || "下载器2";

  // P-07：未配置完整的下载器按钮置灰禁用；未启用的下载器按钮直接隐藏
  if (!isDownloaderConfigured(cfg.downloader1)) {
    $("btnDl1").disabled = true;
    $("btnDl1").title = "请先在设置中配置下载器1";
  }
  if (!isDownloaderEnabled(cfg.downloader2)) {
    // 下载器2 未启用：隐藏按钮，剩余两个按钮自动拉长
    $("btnDl2").style.display = "none";
  } else if (!isDownloaderConfigured(cfg.downloader2)) {
    $("btnDl2").disabled = true;
    $("btnDl2").title = "请先在设置中配置下载器2";
  }

  bindEvents();
  // 渲染完成后按内容高度自适应弹窗大小（避免下方空白）
  fitWindowHeight();
}

// 根据内容实际高度动态调整弹窗窗口高度
async function fitWindowHeight() {
  try {
    const win = await browser.windows.getCurrent();
    if (!win || !win.id) return;
    const contentHeight = Math.max(
      document.body.scrollHeight || 0,
      document.documentElement.scrollHeight || 0
    );
    if (!contentHeight) return;
    const target = Math.ceil(contentHeight + 8); // 少量余量补偿窗口边框
    // 高度变化过小则不调整，避免抖动
    if (win.height && Math.abs(win.height - target) < 24) return;
    await browser.windows.update(win.id, { height: target });
  } catch (e) { /* ignore */ }
}

function bindEvents() {
  $("btnClose").addEventListener("click", cancel);
  $("btnSave").addEventListener("click", () => doAction("save"));
  $("btnDl1").addEventListener("click", () => doAction("dl", 1));
  $("btnDl2").addEventListener("click", () => doAction("dl", 2));
  $("btnCopy").addEventListener("click", copyUrl);
  $("btnToggleError").addEventListener("click", toggleErrorDetail);

  // ESC 关闭 = 取消（P-06）
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !busy) cancel();
  });

  // 关闭窗口 = 取消
  window.addEventListener("beforeunload", () => {
    browser.runtime.sendMessage({ type: "cancel" }).catch(() => {});
  });
}

// 执行下载动作（P-05 / P-08）
async function doAction(action, downloader) {
  if (busy) return;
  const filename = $("filename").value.trim();

  const msg = { type: "download", filename: filename };
  if (action === "save") {
    msg.action = "save";
  } else {
    msg.action = "download";
    msg.downloader = downloader;
  }

  setBusy(true, action === "save" ? "正在保存到浏览器..." : "正在调用 Aria2 RPC...");

  const resp = await browser.runtime.sendMessage(msg);

  if (resp && resp.ok) {
    // P-08：成功后弹窗关闭
    window.close();
  } else {
    // R-06：失败提示，取消本次下载（不重试）
    setBusy(false);
    disableActions();
    showError((resp && resp.error) || "未知错误");
  }
}

function cancel() {
  if (busy) return;
  browser.runtime.sendMessage({ type: "cancel" }).catch(() => {});
  window.close();
}

function setBusy(val, text) {
  busy = val;
  const status = $("status");
  if (val) {
    status.textContent = text;
    status.classList.remove("hidden");
  } else {
    status.classList.add("hidden");
  }
  ["btnDl1", "btnDl2", "btnSave", "btnClose", "btnCopy"].forEach((id) => {
    $(id).disabled = val;
  });
}

function disableActions() {
  ["btnDl1", "btnDl2", "btnSave"].forEach((id) => { $(id).disabled = true; });
}

function showError(message) {
  $("errorDetail").textContent = message || "";
  $("errorBox").classList.remove("hidden");
  fitWindowHeight();
}

function toggleErrorDetail() {
  const el = $("errorDetail");
  const btn = $("btnToggleError");
  const hidden = el.classList.toggle("hidden");
  btn.textContent = hidden ? "错误详情 ▸" : "错误详情 ▾";
  fitWindowHeight();
}

function copyUrl() {
  const url = $("url").value;
  const done = () => {
    const btn = $("btnCopy");
    btn.textContent = "✓";
    setTimeout(() => { btn.textContent = "⧉"; }, 1200);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(done).catch(() => legacyCopy(url, done));
  } else {
    legacyCopy(url, done);
  }
}

function legacyCopy(text, done) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand("copy"); done(); } catch (e) { /* ignore */ }
  document.body.removeChild(ta);
}

function $(id) { return document.getElementById(id); }
