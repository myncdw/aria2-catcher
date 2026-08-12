/*
 * lib/defaults.js —— 共享默认配置与工具函数
 * 在 background / popup / options / window 弹窗页面中通过 <script> 引入
 */

// 默认配置（与 PRD 7.2 一致）
const DEFAULT_CONFIG = {
  enabled: true,               // 全局开关：是否启用下载截获
  downloader1: {               // 下载器1 默认：HTTP
    name: "下载器1",
    protocol: "http",
    host: "127.0.0.1",
    port: 6800,
    path: "jsonrpc",
    secret: ""
  },
  downloader2: {               // 下载器2 默认：WebSocket
    enabled: false,            // 是否启用：默认关闭（未启用时弹窗中隐藏对应按钮）
    name: "下载器2",
    protocol: "ws",
    host: "127.0.0.1",
    port: 16800,
    path: "jsonrpc",
    secret: ""
  },
  darkMode: true,              // 深色模式：默认开（深色）
  notifyOnComplete: false,     // 完成后是否提示：默认关
  popupType: "window"          // 弹窗方式：window(浏览器窗口) | overlay(页面内右上角覆盖)
};

const STORAGE_KEY = "aria2DownloaderConfig";

// 读取配置（合并默认值，防止字段缺失）
async function getStoredConfig() {
  try {
    const data = await browser.storage.local.get(STORAGE_KEY);
    const stored = data[STORAGE_KEY] || {};
    const base = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    return Object.assign(base, stored, {
      downloader1: Object.assign({}, base.downloader1, stored.downloader1 || {}),
      downloader2: Object.assign({}, base.downloader2, stored.downloader2 || {})
    });
  } catch (e) {
    return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  }
}

// 保存配置
async function setStoredConfig(cfg) {
  await browser.storage.local.set({ [STORAGE_KEY]: cfg });
}

// 判断下载器是否启用（默认启用，仅当显式 enabled === false 时视为关闭）
function isDownloaderEnabled(d) {
  return !(d && d.enabled === false);
}

// 判断下载器是否配置完整（名称、主机、端口、路径均有效）
function isDownloaderConfigured(d) {
  if (!d) return false;
  if (d.enabled === false) return false; // 未启用的下载器视为未配置
  const host = (d.host || "").trim();
  const port = Number(d.port);
  return host !== "" &&
         Number.isInteger(port) && port >= 1 && port <= 65535 &&
         typeof d.path === "string" && d.path.trim() !== "";
}

// 深色模式切换（HTML 页面使用）：在 <html> 上添加/移除 .dark
function applyTheme(dark) {
  document.documentElement.classList.toggle("dark", !!dark);
}
