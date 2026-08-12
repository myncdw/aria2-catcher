/*
 * welcome/welcome.js —— 欢迎页（安装后自动打开）
 * 功能：展示使用说明，并提供“打开设置”入口
 */

document.addEventListener("DOMContentLoaded", async () => {
  const cfg = await getStoredConfig();
  applyTheme(cfg.darkMode);

  document.getElementById("btnOptions").addEventListener("click", () => {
    browser.runtime.openOptionsPage();
  });
});
