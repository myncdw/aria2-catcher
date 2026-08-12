/*
 * content/content.js —— 内容脚本：页面内右上角覆盖弹窗（PW-01 ②）
 * 通过 Shadow DOM 隔离样式，避免与页面样式冲突。
 */

(function () {
  if (window.__aria2DownloadOverlayLoaded) return;
  window.__aria2DownloadOverlayLoaded = true;

  let overlay = null;  // 根元素
  let busy = false;

  // 主题变量
  const THEMES = {
    light: {
      card: "#ffffff", text: "#1e1e1e", muted: "#6b6b6b",
      border: "#e2e2e2", accent: "#2e7d32", inputBg: "#f5f5f5",
      danger: "#d32f2f", dangerBg: "#fdecea", btnBg: "#f0f0f0"
    },
    dark: {
      card: "#2b2b2b", text: "#e8e8e8", muted: "#9a9a9a",
      border: "#3c3c3c", accent: "#4caf50", inputBg: "#222222",
      danger: "#f44336", dangerBg: "rgba(244,67,54,0.12)", btnBg: "#3a3a3a"
    }
  };

  const STYLE = `
    * { box-sizing: border-box; }
    :host { all: initial; }
    .backdrop {
      position: fixed; inset: 0; z-index: 2147483000;
      background: transparent;
    }
    .card {
      position: fixed; top: 16px; right: 16px; z-index: 2147483001;
      width: 340px; max-width: calc(100vw - 32px);
      border-radius: 12px; border: 1px solid var(--border);
      background: var(--card); color: var(--text);
      box-shadow: 0 10px 36px rgba(0,0,0,.35);
      padding: 16px; display: flex; flex-direction: column; gap: 12px;
      font-family: system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif;
    }
    .header { display: flex; align-items: center; justify-content: space-between; }
    .title { font-size: 14px; font-weight: 600; }
    .close {
      border: none; background: transparent; color: var(--muted);
      font-size: 20px; line-height: 1; cursor: pointer; padding: 0 2px;
    }
    .close:hover { color: var(--text); }
    .field { display: flex; flex-direction: column; gap: 4px; }
    .field label { font-size: 12px; color: var(--muted); }
    .field input {
      border: 1px solid var(--border); background: var(--inputBg); color: var(--text);
      border-radius: 6px; padding: 7px 9px; font-size: 13px; width: 100%; outline: none;
    }
    .field input:focus { border-color: var(--accent); }
    .field input[readonly] { text-overflow: ellipsis; cursor: default; }
    .url-row { display: flex; gap: 6px; align-items: center; }
    .url-row input { flex: 1; min-width: 0; }
    .copy {
      border: 1px solid var(--border); background: transparent; color: var(--muted);
      border-radius: 6px; cursor: pointer; padding: 6px 9px; font-size: 13px; flex-shrink: 0;
    }
    .copy:hover { color: var(--accent); border-color: var(--accent); }
    .status { font-size: 13px; color: var(--accent); }
    .error-box {
      border: 1px solid var(--danger); background: var(--dangerBg);
      border-radius: 8px; padding: 9px 11px;
    }
    .error-summary {
      display: flex; align-items: center; gap: 6px;
      font-size: 13px; color: var(--danger);
    }
    .error-toggle {
      margin-left: auto; border: none; background: transparent;
      color: var(--danger); cursor: pointer; font-size: 12px;
    }
    .error-detail {
      margin: 8px 0 0; padding: 8px; background: var(--inputBg);
      border-radius: 6px; font-size: 12px; color: var(--text);
      white-space: pre-wrap; word-break: break-all; max-height: 140px; overflow: auto;
    }
    .actions { display: flex; gap: 8px; margin-top: 2px; }
    .btn {
      flex: 1; border: 1px solid var(--border); background: var(--btnBg); color: var(--text);
      border-radius: 8px; padding: 9px 0; font-size: 13px; cursor: pointer;
      transition: filter .12s;
    }
    .btn:not(:disabled):hover { filter: brightness(1.08); }
    .btn:disabled { opacity: .45; cursor: not-allowed; }
    .btn.primary {
      background: var(--accent); color: #fff; border-color: transparent; font-weight: 600;
    }
    .hidden { display: none; }
  `;

  // 接收后台消息，展示覆盖弹窗
  browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.type === "show-overlay") {
      showOverlay(msg.info, msg.cfg);
      sendResponse({ ok: true });
    }
  });

  function showOverlay(info, cfg) {
    // 若已存在覆盖层，先移除（不发送取消，避免误清空新的待下载信息）
    if (overlay) removeOverlay(false);

    const root = document.createElement("div");
    root.id = "aria2-download-overlay-root";
    const shadow = root.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    style.textContent = STYLE;
    shadow.appendChild(style);

    const wrap = document.createElement("div");
    wrap.appendChild(buildOverlay(cfg));
    shadow.appendChild(wrap);

    // 应用主题变量
    applyThemeVars(wrap, cfg.darkMode);

    // 填充信息
    const f = wrap.querySelector(".filename");
    const u = wrap.querySelector(".url");
    f.value = info.filename || "";
    u.value = info.url || "";
    u.title = info.url || "";

    (document.documentElement || document.body).appendChild(root);
    overlay = root;
    bindEvents(shadow);
  }

  // 用 DOM API 构建覆盖层（避免 innerHTML，满足 AMO 审核要求）
  function buildOverlay(cfg) {
    const name1 = (cfg.downloader1 && cfg.downloader1.name) || "下载器1";
    const name2 = (cfg.downloader2 && cfg.downloader2.name) || "下载器2";
    const d1ok = isConfigured(cfg.downloader1);
    const d2ok = isConfigured(cfg.downloader2);
    const d2Enabled = isEnabled(cfg.downloader2);

    const el = (tag, cls, text) => {
      const e = document.createElement(tag);
      if (cls) e.className = cls;
      if (text != null) e.textContent = text;
      return e;
    };

    const frag = document.createDocumentFragment();

    frag.appendChild(el("div", "backdrop"));

    const card = el("div", "card");

    const header = el("div", "header");
    header.appendChild(el("span", "title", "下载方式选择"));
    const close = el("button", "close", "×");
    close.title = "关闭（取消下载）";
    header.appendChild(close);
    card.appendChild(header);

    const fField = el("div", "field");
    fField.appendChild(el("label", null, "文件名"));
    const fInput = el("input", "filename");
    fInput.type = "text";
    fInput.spellcheck = false;
    fField.appendChild(fInput);
    card.appendChild(fField);

    const urlField = el("div", "field");
    urlField.appendChild(el("label", null, "链接"));
    const urlRow = el("div", "url-row");
    const urlInput = el("input", "url");
    urlInput.type = "text";
    urlInput.readOnly = true;
    urlRow.appendChild(urlInput);
    const copy = el("button", "copy", "⧉");
    copy.title = "复制链接";
    urlRow.appendChild(copy);
    urlField.appendChild(urlRow);
    card.appendChild(urlField);

    card.appendChild(el("div", "status hidden"));

    const errorBox = el("div", "error-box hidden");
    const errSummary = el("div", "error-summary");
    errSummary.appendChild(el("span", null, "✕ 下载失败"));
    const errToggle = el("button", "error-toggle", "错误详情 ▸");
    errSummary.appendChild(errToggle);
    errorBox.appendChild(errSummary);
    errorBox.appendChild(el("pre", "error-detail hidden"));
    card.appendChild(errorBox);

    const actions = el("div", "actions");
    const dl1 = el("button", "btn primary dl1", name1);
    if (!d1ok) { dl1.disabled = true; dl1.title = "请先在设置中配置下载器1"; }
    actions.appendChild(dl1);

    // 下载器2 未启用时隐藏其按钮，剩余两个按钮自动拉长
    if (d2Enabled) {
      const dl2 = el("button", "btn primary dl2", name2);
      if (!d2ok) { dl2.disabled = true; dl2.title = "请先在设置中配置下载器2"; }
      actions.appendChild(dl2);
    }

    actions.appendChild(el("button", "btn save", "保存"));
    card.appendChild(actions);

    frag.appendChild(card);
    return frag;
  }

  function bindEvents(shadow) {
    const close = shadow.querySelector(".close");
    const save = shadow.querySelector(".save");
    const dl1 = shadow.querySelector(".dl1");
    const dl2 = shadow.querySelector(".dl2");
    const copy = shadow.querySelector(".copy");
    const toggle = shadow.querySelector(".error-toggle");
    const backdrop = shadow.querySelector(".backdrop");

    close.addEventListener("click", () => removeOverlay(true));
    backdrop.addEventListener("click", () => removeOverlay(true)); // P-06 点击外部
    save.addEventListener("click", () => doAction("save"));
    dl1.addEventListener("click", () => doAction("dl", 1));
    dl2.addEventListener("click", () => doAction("dl", 2));
    copy.addEventListener("click", () => copyUrl(shadow));
    toggle.addEventListener("click", () => {
      const el = shadow.querySelector(".error-detail");
      const hidden = el.classList.toggle("hidden");
      toggle.textContent = hidden ? "错误详情 ▸" : "错误详情 ▾";
    });
    document.addEventListener("keydown", onKeydown);
  }

  function onKeydown(e) {
    if (e.key === "Escape" && overlay && !busy) {
      removeOverlay(true);
    }
  }

  async function doAction(action, downloader) {
    if (busy || !overlay) return;
    const shadow = overlay.shadowRoot;
    const filename = shadow.querySelector(".filename").value.trim();

    const msg = { type: "download", filename: filename };
    if (action === "save") {
      msg.action = "save";
    } else {
      msg.action = "download";
      msg.downloader = downloader;
    }

    setBusy(shadow, true, action === "save" ? "正在保存到浏览器..." : "正在调用 Aria2 RPC...");

    let resp = null;
    try {
      resp = await browser.runtime.sendMessage(msg);
    } catch (e) {
      resp = { ok: false, error: "无法连接扩展后台：" + String(e && e.message || e) };
    }

    if (resp && resp.ok) {
      removeOverlay(false);
    } else {
      setBusy(shadow, false);
      disableActions(shadow);
      showError(shadow, (resp && resp.error) || "未知错误");
    }
  }

  function setBusy(shadow, val, text) {
    busy = val;
    const status = shadow.querySelector(".status");
    if (val) {
      status.textContent = text;
      status.classList.remove("hidden");
    } else {
      status.classList.add("hidden");
    }
    shadow.querySelectorAll(".btn, .close, .copy").forEach((el) => { el.disabled = val; });
  }

  function disableActions(shadow) {
    shadow.querySelectorAll(".btn").forEach((el) => { el.disabled = true; });
  }

  function showError(shadow, message) {
    shadow.querySelector(".error-detail").textContent = message || "";
    shadow.querySelector(".error-box").classList.remove("hidden");
  }

  function copyUrl(shadow) {
    const url = shadow.querySelector(".url").value;
    const btn = shadow.querySelector(".copy");
    const done = () => {
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

  function removeOverlay(sendCancel) {
    if (!overlay) return;
    if (sendCancel) {
      browser.runtime.sendMessage({ type: "cancel" }).catch(() => {});
    }
    document.removeEventListener("keydown", onKeydown);
    overlay.remove();
    overlay = null;
    busy = false;
  }

  function applyThemeVars(root, dark) {
    const t = dark ? THEMES.dark : THEMES.light;
    Object.keys(t).forEach((key) => {
      root.style.setProperty("--" + key, t[key]);
    });
  }

  function isEnabled(d) {
    return !(d && d.enabled === false);
  }

  function isConfigured(d) {
    if (!d) return false;
    if (d.enabled === false) return false; // 未启用的下载器视为未配置
    const host = (d.host || "").trim();
    const port = Number(d.port);
    return host !== "" &&
           Number.isInteger(port) && port >= 1 && port <= 65535 &&
           typeof d.path === "string" && d.path.trim() !== "";
  }
})();
