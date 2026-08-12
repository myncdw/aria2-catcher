# Aria2 Catcher（Firefox 扩展）

*此插件全部由AI编写*

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

根据 `PRD.md`实现的 Firefox 扩展：拦截浏览器下载请求，可转发至 **Aria2 RPC**（双下载器独立配置），或选择浏览器原生保存。仓库名 / 插件名：**aria2-catcher**。

## 功能特性

- ⚡ **下载自动截获**：全局开关开启时拦截 HTTP/HTTPS 下载，替换 Firefox 原生下载窗口
- 🗂 **下载方式选择弹窗**：展示可编辑文件名 + 下载链接，提供「下载器1 / 下载器2 / 保存」三选项
- 🔑 **Headers 透传**：完整透传当前页面的 `Referer`、`Cookie`、`User-Agent`
- 🖥 **双下载器独立配置**：分别配置名称、协议、IP、端口、路径、密钥（HTTP / WebSocket 双通道）；下载器2 默认关闭，可按需启用
- 👋 **安装欢迎页**：安装后自动打开使用说明，一键进入设置
- 🎛 **扩展图标控制面板**：全局开关 + 设置入口
- 🌙 **深色模式**：弹窗 / 面板 / 设置页全 UI 支持，默认深色，可手动切换
- 🔔 **下载完成通知**：Aria2 完成后通过系统通知提示（可选，默认关）
- 🪟 **两种弹窗形式**：浏览器独立窗口（默认） / 页面内右上角覆盖弹出

## 使用流程

### 方式一：使用 Aria2 下载

1. 点击工具栏图标 → 「⚙ 设置」
2. 配置下载器1（默认 `http://127.0.0.1:6800/jsonrpc`）或下载器2（默认 `ws://127.0.0.1:16800/jsonrpc`）的地址与密钥
3. 点击「💾 保存」
4. 点击网页中的下载链接 → 弹出下载方式选择窗口 → 点击对应下载器
5. 下载完成后（若开启提示）收到系统通知

### 方式二：浏览器原生保存

点击下载链接 → 弹窗中选择「保存」→ Firefox 原生下载。

### 方式三：临时关闭扩展

点击工具栏图标 → 关闭「全局开关」→ 所有下载走 Firefox 默认行为。

## 目录结构

```
aria2/
├── manifest.json          # 扩展清单（MV3）
├── background.js          # 后台：下载截获 / RPC 调用 / 通知
├── icons/                 # 扩展图标（16/32/48/128 多尺寸）
├── lib/
│   ├── defaults.js        # 默认配置与工具函数
│   └── aria2.js           # Aria2 JSON-RPC 客户端（HTTP/WS）
├── popup/                 # 工具栏图标面板
├── options/               # 设置页
├── download-popup/        # 下载选择弹窗（浏览器窗口形式）
├── content/               # 内容脚本（页面内覆盖弹窗）
└── welcome/               # 安装欢迎页（给用户看的自述）
```

## 注意事项

- Aria2 需启用 RPC（`--enable-rpc`），并根据配置开启对应端口与密钥
- 扩展仅传递 `url`、`out`、`referer`、`cookie`、`user-agent`，**不覆盖** Aria2 服务端的 `dir`、并发数等配置
- 仅拦截 HTTP/HTTPS 下载；`blob:` / `data:` / `ftp:` 等由 Firefox 原生处理
- `blob:` / `data:` / `ftp:` 等协议链接直接交给浏览器，不弹出扩展弹窗
- **CSP 说明**：Firefox MV3 默认 CSP 包含 `upgrade-insecure-requests`，会把 `ws://` 升级为 `wss://`、`http://` 升级为 `https://`，导致连接本地 Aria2 失败。本扩展已在 `manifest.json` 中显式声明 `content_security_policy`（`connect-src 'self' http: https: ws: wss:`）以排除该指令——仅放开连接权限，脚本来源仍被严格限制为扩展自身。若修改 manifest 时误删该项，本地 RPC 将无法连通。

## 许可证

[MIT](LICENSE) © 2026 myncdw
