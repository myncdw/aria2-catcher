/*
 * options/options.js —— 设置页逻辑
 * 功能：双下载器配置（S-02/S-03）、杂项配置（S-04）、保存（S-05）、
 *       恢复默认（S-06）、输入校验（S-07）、深色模式（DARK-01/02/03）
 */

document.addEventListener("DOMContentLoaded", init);

const $ = (id) => document.getElementById(id);
let loadedCfg = null;

async function init() {
  loadedCfg = await getStoredConfig();
  populate(loadedCfg);
  applyTheme(loadedCfg.darkMode);

  // 深色模式实时预览
  $("darkMode").addEventListener("change", () => {
    applyTheme($("darkMode").checked);
  });

  // 下载器2 启用开关：关闭时禁用其配置字段
  $("d2_enabled").addEventListener("change", () => {
    setD2Disabled(!$("d2_enabled").checked);
  });

  $("btnSave").addEventListener("click", save);
  $("btnReset").addEventListener("click", resetAll);
}

// 将配置填充到表单
function populate(cfg) {
  $("d1_name").value = cfg.downloader1.name;
  $("d1_protocol").value = cfg.downloader1.protocol;
  $("d1_host").value = cfg.downloader1.host;
  $("d1_port").value = cfg.downloader1.port;
  $("d1_path").value = cfg.downloader1.path;
  $("d1_secret").value = cfg.downloader1.secret;

  $("d2_enabled").checked = cfg.downloader2.enabled !== false;
  $("d2_name").value = cfg.downloader2.name;
  $("d2_protocol").value = cfg.downloader2.protocol;
  $("d2_host").value = cfg.downloader2.host;
  $("d2_port").value = cfg.downloader2.port;
  $("d2_path").value = cfg.downloader2.path;
  $("d2_secret").value = cfg.downloader2.secret;

  $("darkMode").checked = !!cfg.darkMode;
  $("notifyOnComplete").checked = !!cfg.notifyOnComplete;
  $("popupType").value = cfg.popupType;

  setD2Disabled(!$("d2_enabled").checked);
}

// 切换下载器2 配置字段的禁用状态
function setD2Disabled(disabled) {
  $("card-d2").classList.toggle("disabled", disabled);
  ["d2_name", "d2_protocol", "d2_host", "d2_port", "d2_path", "d2_secret"].forEach((id) => {
    $(id).disabled = disabled;
  });
}

// 从表单读取某个下载器配置
function readDownloader(n) {
  return {
    enabled: n === 2 ? $("d2_enabled").checked : true,
    name: $("d" + n + "_name").value.trim() || "下载器" + n,
    protocol: $("d" + n + "_protocol").value,
    host: $("d" + n + "_host").value.trim(),
    port: $("d" + n + "_port").value.trim(),
    path: $("d" + n + "_path").value.trim() || "jsonrpc",
    secret: $("d" + n + "_secret").value.trim()
  };
}

// ---------- 输入校验（S-07） ----------
const HOST_RE =
  /^(?=.{1,253}$)([a-zA-Z0-9_]([a-zA-Z0-9_-]{0,61}[a-zA-Z0-9_])?\.)*[a-zA-Z0-9_]([a-zA-Z0-9_-]{0,61}[a-zA-Z0-9_])?$/;

function isValidHost(host) {
  host = host.trim();
  if (!host) return false;
  if (host.includes(":")) {
    // IPv6：仅含十六进制与冒号
    return /^[0-9a-fA-F:]+$/.test(host) && host.length > 2;
  }
  return HOST_RE.test(host);
}

function isValidPort(port) {
  const p = Number(port);
  return port !== "" && Number.isInteger(p) && p >= 1 && p <= 65535;
}

function isValidPath(path) {
  const p = (path || "").trim();
  return p !== "" && !/\.\./.test(p) && !/[\\\s?#]/.test(p);
}

function validateDownloader(n, errors) {
  const d = readDownloader(n);
  const mark = (field, msg) => {
    $(field).classList.add("error");
    errors.push("下载器" + n + "：" + msg);
  };

  if (!d.host) {
    mark("d" + n + "_host", "地址不能为空");
  } else if (!isValidHost(d.host)) {
    mark("d" + n + "_host", "地址格式无效（IPv4 / IPv6 / 域名）");
  }

  if (!isValidPort(d.port)) {
    mark("d" + n + "_port", "端口需为 1-65535");
  }

  if (!isValidPath(d.path)) {
    mark("d" + n + "_path", "路径不能为空且不能包含 ../ 或 \\ 等特殊字符");
  }
  return d;
}

function clearErrors() {
  document.querySelectorAll(".row input").forEach((el) => el.classList.remove("error"));
  ["d1_hint", "d2_hint"].forEach((id) => { $(id).textContent = ""; });
}

// ---------- 保存 ----------
async function save() {
  clearErrors();
  const errors = [];
  const d1 = validateDownloader(1, errors);
  const d2Enabled = $("d2_enabled").checked;
  // 下载器2 未启用时跳过其字段校验（返回值已含 enabled 字段）
  const d2 = d2Enabled ? validateDownloader(2, errors) : readDownloader(2);

  if (errors.length) {
    showToast(errors.join("；"), "err");
    return;
  }

  const cfg = {
    enabled: (loadedCfg && loadedCfg.enabled !== undefined) ? loadedCfg.enabled : true,
    downloader1: d1,
    downloader2: d2,
    darkMode: $("darkMode").checked,
    notifyOnComplete: $("notifyOnComplete").checked,
    popupType: $("popupType").value
  };

  await setStoredConfig(cfg);
  loadedCfg = cfg;
  applyTheme(cfg.darkMode);
  showToast("保存成功", "ok");
}

// ---------- 恢复默认（S-06） ----------
function resetAll() {
  const defaults = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  defaults.enabled = (loadedCfg && loadedCfg.enabled !== undefined) ? loadedCfg.enabled : true;
  populate(defaults);
  applyTheme(defaults.darkMode);
  clearErrors();
  showToast("已恢复默认配置", "ok");
}

// ---------- Toast 提示 ----------
let toastTimer = null;
function showToast(message, type) {
  const el = $("toast");
  el.textContent = message;
  el.className = "toast " + type;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add("hidden"), 2600);
}
