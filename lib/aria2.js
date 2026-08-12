/*
 * lib/aria2.js —— Aria2 JSON-RPC 客户端（HTTP / WebSocket 双通道）
 * 仅在 background 脚本中使用
 */

// 组装 RPC 地址：protocol://host:port/path
function buildRpcUrl(d) {
  const proto = (d.protocol || "http").toLowerCase();
  const host = (d.host || "").trim();
  const port = Number(d.port) || 0;
  const path = (d.path || "jsonrpc").replace(/^\/+/, "");
  return proto + "://" + host + ":" + port + "/" + path;
}

// 构造 JSON-RPC 请求载荷
function rpcPayload(method, params) {
  return {
    jsonrpc: "2.0",
    id: "aria2ext-" + Date.now() + "-" + Math.floor(Math.random() * 10000),
    method: method,
    params: params
  };
}

// 若配置了密钥，将 token 前置到 params
function applyToken(params, secret) {
  const s = (secret || "").trim();
  if (s !== "") {
    return ["token:" + s].concat(params);
  }
  return params;
}

/**
 * 调用 Aria2 JSON-RPC
 * @param {object} downloader 下载器配置 {protocol, host, port, path, secret}
 * @param {string} method     RPC 方法名，如 aria2.addUri
 * @param {Array}  params     方法参数（不含 token）
 * @param {number} timeoutMs  超时时间（毫秒），默认 10000
 * @returns {Promise<any>}    成功 resolve 返回值；失败 reject Error
 */
async function callAria2(downloader, method, params, timeoutMs) {
  const secret = (downloader && downloader.secret) || "";
  const fullParams = applyToken(params, secret);
  const payload = rpcPayload(method, fullParams);
  const proto = (downloader.protocol || "http").toLowerCase();
  const url = buildRpcUrl(downloader);
  const timeout = timeoutMs || 10000;

  if (proto === "ws" || proto === "wss") {
    return callViaWebSocket(url, payload, timeout);
  }
  return callViaHttp(url, payload, timeout);
}

// HTTP / HTTPS 通道（POST + JSON）
function callViaHttp(url, payload, timeout) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: controller.signal
  })
    .then(async (resp) => {
      if (!resp.ok) {
        throw new Error("HTTP " + resp.status + " " + resp.statusText);
      }
      let data;
      try {
        data = await resp.json();
      } catch (e) {
        throw new Error("RPC 响应不是有效的 JSON");
      }
      if (data && data.error) {
        throw new Error("Aria2 错误 " + data.error.code + ": " + (data.error.message || "未知错误"));
      }
      return data.result;
    })
    .catch((err) => {
      if (err && err.name === "AbortError") {
        throw new Error("请求超时（" + timeout + "ms）");
      }
      throw err;
    })
    .finally(() => clearTimeout(timer));
}

// WebSocket / WSS 通道
function callViaWebSocket(url, payload, timeout) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let ws;
    const timer = setTimeout(() => {
      finish(reject, new Error("请求超时（" + timeout + "ms）"));
    }, timeout);

    function finish(fn, val) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { if (ws) ws.close(); } catch (e) { /* ignore */ }
      fn(val);
    }

    try {
      ws = new WebSocket(url);
    } catch (e) {
      finish(reject, new Error("WebSocket 地址无效: " + url));
      return;
    }

    ws.onopen = () => {
      try {
        ws.send(JSON.stringify(payload));
      } catch (e) {
        finish(reject, new Error("发送 RPC 消息失败"));
      }
    };
    ws.onmessage = (ev) => {
      let data;
      try { data = JSON.parse(ev.data); } catch (e) { return; }
      if (!data || data.id !== payload.id) return; // 忽略无关消息
      if (data.error) {
        finish(reject, new Error("Aria2 错误 " + data.error.code + ": " + (data.error.message || "未知错误")));
      } else {
        finish(resolve, data.result);
      }
    };
    ws.onerror = () => {
      finish(reject, new Error("WebSocket 连接失败: " + url));
    };
    ws.onclose = () => {
      finish(reject, new Error("WebSocket 连接已关闭"));
    };
  });
}
