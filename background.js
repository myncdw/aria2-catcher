/*
 * background.js —— 扩展后台服务
 * 职责：
 *  1. 下载截获（downloads.onCreated + cancel）
 *  2. 弹窗调度（浏览器窗口 / 页面内覆盖）
 *  3. Aria2 RPC 调用（aria2.addUri）
 *  4. 下载完成轮询与 Windows 通知
 */

// ---------- 全局状态 ----------
let pendingDownload = null;         // 待用户选择的下载信息
const notifyPollers = new Map();    // gid -> { timer, timeoutTimer }
const popupWindows = new Map();     // windowId -> true（记录本扩展创建的弹窗）
const MAX_POLL_MS = 60 * 60 * 1000; // 完成状态轮询上限：1 小时

// ---------- 安装后打开欢迎页 ----------
browser.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    browser.tabs.create({ url: browser.runtime.getURL("welcome/welcome.html") });
  }
});

// ---------- 下载截获 ----------
browser.downloads.onCreated.addListener(async (item) => {
  try {
    const cfg = await getStoredConfig();

    // 规则 D-03：全局开关关闭时完全放行
    if (!cfg.enabled) return;

    // 规则 D-04：排除扩展自身触发的下载（“保存”方式）
    if (item.byExtensionId || item.byExtensionName) return;

    const url = item.url || "";

    // 规则 D-05：仅拦截 HTTP/HTTPS，其余协议直接交给浏览器
    if (!/^https?:\/\//i.test(url)) return;

    // 取消 Firefox 原生下载（此时尚未真正落盘）
    try {
      await browser.downloads.cancel(item.id);
    } catch (err) {
      // 无法取消（可能已瞬间完成），保持浏览器原生行为
      return;
    }

    // 将已取消的下载项从下载管理器历史中移除，避免残留“已取消”记录
    removeFromDownloadHistory(item.id);

    // 组装透传信息（referrer / cookies / UA）
    const info = await buildDownloadInfo(item);
    pendingDownload = info;

    // 规则 PW-01：按配置选择弹窗形式
    await showDownloadChoice(info, cfg);
  } catch (err) {
    console.error("[aria2] 下载截获失败:", err);
  }
});

// 移除被截获（已取消）下载项在下载管理器中的记录
function removeFromDownloadHistory(id) {
  const onChanged = (delta) => {
    if (delta.id !== id) return;
    // 仅当进入终态（interrupted/complete）后才允许 erase
    if (delta.state && (delta.state.current === "interrupted" || delta.state.current === "complete")) {
      browser.downloads.onChanged.removeListener(onChanged);
      // erase 接受 DownloadQuery 对象（{id: ...}），返回被移除的 id 数组
      browser.downloads.erase({ id: id }).catch(() => {});
    }
  };
  browser.downloads.onChanged.addListener(onChanged);
  // 兜底：若 cancel 后状态已进入终态，立即尝试移除
  browser.downloads.erase({ id: id }).catch(() => {});
}

// 组装下载信息
async function buildDownloadInfo(item) {
  const url = item.url || "";
  let filename = item.filename || "";

  // 取路径最后一段作为文件名
  const parts = filename.split(/[\\/]/);
  filename = parts[parts.length - 1] || filename || "下载文件";

  const referrer = item.referrer || "";
  const cookie = await getCookieHeader([url, referrer]);
  const userAgent = navigator.userAgent;
  const tabId = await findTriggerTab(referrer, url);

  return { url, filename, referrer, cookie, userAgent, tabId };
}

// 收集指定 URL 的 Cookie 并拼成 Cookie 头
async function getCookieHeader(urls) {
  const seen = new Set();
  const pairs = [];
  for (const u of urls) {
    if (!u || !/^https?:\/\//i.test(u)) continue;
    try {
      const cookies = await browser.cookies.getAll({ url: u });
      for (const c of cookies) {
        if (seen.has(c.name)) continue;
        seen.add(c.name);
        pairs.push(c.name + "=" + c.value);
      }
    } catch (e) { /* ignore */ }
  }
  return pairs.join("; ");
}

// 查找触发下载的标签页（用于页面内覆盖弹窗）
async function findTriggerTab(referrer, url) {
  try {
    const tabs = await browser.tabs.query({});
    const norm = (u) => { try { return (u || "").split("#")[0]; } catch (e) { return u; } };
    const refNorm = norm(referrer);
    const urlNorm = norm(url);

    let match = tabs.find((t) => t.url && refNorm && norm(t.url) === refNorm);
    if (!match) match = tabs.find((t) => t.url && urlNorm && norm(t.url) === urlNorm);
    if (!match) match = tabs.find((t) => t.active);
    return match ? match.id : null;
  } catch (e) {
    return null;
  }
}

// 展示下载方式选择弹窗
async function showDownloadChoice(info, cfg) {
  // 规则 PW-01 ②：页面内右上角覆盖弹出（需能找到触发标签页）
  if (cfg.popupType === "overlay" && info.tabId != null) {
    try {
      await browser.tabs.sendMessage(info.tabId, {
        type: "show-overlay",
        info: info,
        cfg: cfg
      });
      return;
    } catch (err) {
      // 内容脚本不可达时，回退到浏览器窗口弹窗
    }
  }

  // 规则 PW-01 ①：浏览器窗口弹窗（宽 500，高度由页面内容自适应）
  const win = await browser.windows.create({
    url: browser.runtime.getURL("download-popup/window.html"),
    type: "popup",
    width: 500,
    height: 340,
    allowScriptsToClose: true
  });
  if (win && win.id) popupWindows.set(win.id, true);
}

// 弹窗窗口关闭时，清除待处理下载（视为取消）
browser.windows.onRemoved.addListener((windowId) => {
  if (popupWindows.has(windowId)) {
    popupWindows.delete(windowId);
    if (pendingDownload) pendingDownload = null;
  }
});

// ---------- 消息处理 ----------
browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg !== "object") return;
  const type = msg.type;
  if (type !== "get-pending" && type !== "download" && type !== "cancel") return;

  (async () => {
    try {
      switch (type) {
        case "get-pending": {
          const cfg = await getStoredConfig();
          sendResponse({ pending: pendingDownload, cfg: cfg });
          break;
        }
        case "download": {
          const res = await handleDownloadAction(msg);
          sendResponse(res);
          break;
        }
        case "cancel": {
          pendingDownload = null;
          sendResponse({ ok: true });
          break;
        }
      }
    } catch (err) {
      sendResponse({ ok: false, error: friendlyError(err) });
    }
  })();
  return true; // 保持通道异步返回
});

// 执行下载动作（P-05：仅在用户点击按钮后触发）
async function handleDownloadAction(msg) {
  const cfg = await getStoredConfig();
  const info = pendingDownload;
  if (!info) {
    return { ok: false, error: "没有待处理的下载请求。" };
  }

  // “保存”：Firefox 内置下载
  if (msg.action === "save") {
    pendingDownload = null;
    try {
      await browser.downloads.download({
        url: info.url,
        filename: sanitizeFilename(msg.filename)
      });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: friendlyError(err) };
    }
  }

  // 下载器1 / 下载器2
  const dl = msg.downloader === 2 ? cfg.downloader2 : cfg.downloader1;
  if (!isDownloaderConfigured(dl)) {
    return { ok: false, error: "下载器未配置完整，请先在设置中配置。" };
  }

  const out = sanitizeFilename(msg.filename);

  // 规则 R-05：仅传递 url / out / referer / cookie / user-agent
  const options = {};
  if (out) options.out = out;
  if (info.referrer) options.referer = info.referrer;
  if (info.cookie) options.cookie = info.cookie;
  if (info.userAgent) options["user-agent"] = info.userAgent;

  try {
    const gid = await callAria2(dl, "aria2.addUri", [[info.url], options]);
    pendingDownload = null;

    // 规则 N-01：完成后是否提示
    if (cfg.notifyOnComplete && gid) {
      startCompletionMonitor(gid, out || info.filename, dl);
    }
    return { ok: true, gid: gid };
  } catch (err) {
    pendingDownload = null; // 规则 R-06 ③：取消本次下载（不重试）
    return { ok: false, error: friendlyError(err) };
  }
}

// 文件名清洗，防止路径穿越
function sanitizeFilename(name) {
  if (!name) return "";
  return String(name)
    .replace(/[\\/]/g, "_")
    .replace(/[<>:"|?*\u0000-\u001f]/g, "_")
    .trim();
}

function friendlyError(err) {
  if (!err) return "未知错误";
  if (err instanceof Error) return err.message || String(err);
  return String(err);
}

// ---------- 下载完成通知 ----------
function startCompletionMonitor(gid, filename, downloader) {
  if (notifyPollers.has(gid)) return;

  const timer = setInterval(async () => {
    try {
      const status = await callAria2(downloader, "aria2.tellStatus", [gid], 8000);
      if (!status) return;
      if (status.status === "complete") {
        stopCompletionMonitor(gid);
        sendCompleteNotification(filename);
      } else if (status.status === "error" || status.status === "removed") {
        stopCompletionMonitor(gid);
      }
    } catch (err) {
      // 临时网络错误，继续轮询
    }
  }, 3000);

  const timeoutTimer = setTimeout(() => stopCompletionMonitor(gid), MAX_POLL_MS);
  notifyPollers.set(gid, { timer: timer, timeoutTimer: timeoutTimer });
}

function stopCompletionMonitor(gid) {
  const entry = notifyPollers.get(gid);
  if (entry) {
    clearInterval(entry.timer);
    clearTimeout(entry.timeoutTimer);
    notifyPollers.delete(gid);
  }
}

// 规则 N-02：通知内容包含文件名
async function sendCompleteNotification(filename) {
  try {
    await browser.notifications.create({
      type: "basic",
      iconUrl: browser.runtime.getURL("icons/aria2-catcher-128.png"),
      title: "下载完成",
      message: filename || "文件已下载完成"
    });
  } catch (err) {
    console.error("[aria2] 发送通知失败:", err);
  }
}
