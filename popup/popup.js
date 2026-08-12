/*
 * popup/popup.js —— 图标面板逻辑
 * 功能：全局开关（I-02）、状态提示（I-04）、设置入口（I-03）
 */

document.addEventListener("DOMContentLoaded", init);

async function init() {
  const cfg = await getStoredConfig();
  applyTheme(cfg.darkMode); // 规则 DARK-01：面板跟随深色模式

  const toggle = document.getElementById("toggleEnabled");
  toggle.checked = !!cfg.enabled;
  updateStatus(cfg.enabled);

  // 全局开关切换：状态持久化（I-02 / AC-15）
  toggle.addEventListener("change", async () => {
    cfg.enabled = toggle.checked;
    await setStoredConfig(cfg);
    updateStatus(cfg.enabled);
  });

  // 设置按钮：新标签页打开设置页（I-03 / AC-16）
  document.getElementById("btnSettings").addEventListener("click", () => {
    browser.runtime.openOptionsPage();
    window.close();
  });
}

function updateStatus(enabled) {
  const el = document.getElementById("statusText");
  if (enabled) {
    el.textContent = "● 已启用拦截";
    el.classList.add("on");
  } else {
    el.textContent = "○ 已禁用";
    el.classList.remove("on");
  }
}
