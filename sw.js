/**
 * 📦 模組：Service Worker - PWA 自動更新系統
 * 🕒 最後更新：2025-06-18T15:30:00+08:00
 * 🧑‍💻 作者/更新者：@s123104
 * 🔢 版本：v2.1.0
 * 📝 摘要：智能PWA模態窗重構、系統自動檢測、近期記錄UI優化、編輯功能完善
 *
 * 🎯 影響範圍：PWA 緩存策略、自動更新機制、智能安裝指引
 * ✅ 測試狀態：已完成PWA模態窗和記錄編輯功能測試
 * 🔒 安全考量：HTTPS 限制、版本驗證、系統檢測安全
 * 📊 效能影響：優化緩存策略，支援離線使用，智能裝置檢測
 * 🏛️ 架構決策：採用 stale-while-revalidate 策略，智能PWA引導
 */

// 版本控制 - 每次更新必須修改此版本號
const VERSION = "v2.1.0";
const INTERNAL_VERSION = "v15"; // 內部版本，用於強制更新檢測
const CACHE_NAME = `work-freedom-card-${VERSION}`;
const DYNAMIC_CACHE_NAME = `dynamic-cache-${VERSION}`;
const APP_VERSION_KEY = "app_version_sw";

// 核心文件列表 - 需要預先緩存的重要文件
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./script.js",
  "./styles.css",
  "./manifest.json",
  "./icon.png",
  "./icon-192.png",
  "./icon-512.png",
];

// 擴展文件列表 - 次要文件，可以按需緩存
const EXTENDED_ASSETS = [
  "./tailwind.config.js",
  "./og-image.png",
  "./robots.txt",
  "./sitemap.xml",
  "./llms.txt",
  "./README.md",
  "./CHANGELOG.md",
  "./google38eac8d0f17cb8e8.html",
];

// 網路優先的文件模式
const NETWORK_FIRST_PATTERNS = [
  /\/api\//,
  /\.json$/,
  /script\.js$/,
  /styles\.css$/,
];

// 緩存優先的文件模式
const CACHE_FIRST_PATTERNS = [
  /\.(png|jpg|jpeg|gif|svg|webp|ico)$/,
  /\.(woff|woff2|ttf|eot)$/,
  /manifest\.json$/,
];

// 安裝事件 - 預緩存核心資源
self.addEventListener("install", (event) => {
  console.log(
    `🔄 Service Worker 安裝中... 版本: ${VERSION} (${INTERNAL_VERSION})`
  );

  // 強制跳過等待，立即激活新版本
  self.skipWaiting();

  event.waitUntil(
    (async () => {
      try {
        // 打開新的緩存
        const cache = await caches.open(CACHE_NAME);

        // 預緩存核心資源
        console.log("📦 預緩存核心資源...");
        await cache.addAll(CORE_ASSETS);

        // 嘗試緩存擴展資源（失敗不影響安裝）
        try {
          console.log("📦 預緩存擴展資源...");
          await cache.addAll(EXTENDED_ASSETS);
        } catch (error) {
          console.warn("⚠️ 部分擴展資源緩存失敗:", error);
        }

        // 廣播安裝完成事件
        broadcastMessage({
          type: "SW_INSTALLED",
          version: VERSION,
          internalVersion: INTERNAL_VERSION,
        });

        console.log("✅ Service Worker 安裝完成");
      } catch (error) {
        console.error("❌ Service Worker 安裝失敗:", error);
      }
    })()
  );
});

// 激活事件 - 清理舊緩存並接管客戶端
self.addEventListener("activate", (event) => {
  console.log(`🎯 Service Worker 激活中... 版本: ${VERSION}`);

  event.waitUntil(
    (async () => {
      try {
        // 清理舊緩存
        const cacheNames = await caches.keys();
        const deletePromises = cacheNames
          .filter(
            (cacheName) =>
              cacheName.startsWith("work-freedom-card-") &&
              cacheName !== CACHE_NAME &&
              cacheName !== DYNAMIC_CACHE_NAME
          )
          .map((cacheName) => {
            console.log("🗑️ 清除舊緩存:", cacheName);
            return caches.delete(cacheName);
          });

        await Promise.all(deletePromises);

        // 強制接管所有客戶端
        await self.clients.claim();

        // 通知所有客戶端激活完成
        const clients = await self.clients.matchAll();
        clients.forEach((client) => {
          client.postMessage({
            type: "SW_ACTIVATED",
            version: VERSION,
            internalVersion: INTERNAL_VERSION,
          });
        });

        // 檢查並處理版本更新
        await handleVersionUpdate();

        console.log("✅ Service Worker 激活完成，已接管所有客戶端");
      } catch (error) {
        console.error("❌ Service Worker 激活失敗:", error);
      }
    })()
  );
});

// 版本更新處理
async function handleVersionUpdate() {
  try {
    const clients = await self.clients.matchAll({ type: "window" });
    if (clients.length > 0) {
      clients.forEach((client) => {
        client.postMessage({
          type: "FORCE_UPDATE_REQUIRED",
          version: VERSION,
          internalVersion: INTERNAL_VERSION,
          message: "檢測到新版本，建議立即更新以獲得最佳體驗",
        });
      });
    }
  } catch (error) {
    console.error("版本更新處理失敗:", error);
  }
}

// 廣播消息給所有客戶端
function broadcastMessage(message) {
  self.clients.matchAll().then((clients) => {
    clients.forEach((client) => {
      client.postMessage(message);
    });
  });
}

// 智能緩存策略
async function smartCacheStrategy(request) {
  const url = new URL(request.url);
  const isNavigationRequest = request.mode === "navigate";

  // 導航請求使用網路優先策略
  if (isNavigationRequest) {
    return networkFirstStrategy(request, CACHE_NAME);
  }

  // 檢查是否符合網路優先模式
  if (NETWORK_FIRST_PATTERNS.some((pattern) => pattern.test(url.pathname))) {
    return networkFirstStrategy(request, CACHE_NAME);
  }

  // 檢查是否符合緩存優先模式
  if (CACHE_FIRST_PATTERNS.some((pattern) => pattern.test(url.pathname))) {
    return cacheFirstStrategy(request, CACHE_NAME);
  }

  // 默認使用 stale-while-revalidate 策略
  return staleWhileRevalidateStrategy(request, DYNAMIC_CACHE_NAME);
}

// 網路優先策略
async function networkFirstStrategy(request, cacheName) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    console.log("網路請求失敗，嘗試從緩存提供:", request.url);
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }

    // 對於導航請求，返回主頁面
    if (request.mode === "navigate") {
      return caches.match("./index.html");
    }

    throw error;
  }
}

// 緩存優先策略
async function cacheFirstStrategy(request, cacheName) {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }

  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    console.error("緩存優先策略失敗:", error);
    throw error;
  }
}

// Stale-While-Revalidate 策略
async function staleWhileRevalidateStrategy(request, cacheName) {
  const cachedResponse = await caches.match(request);

  // 背景更新緩存
  const fetchPromise = fetch(request)
    .then((networkResponse) => {
      if (networkResponse.ok) {
        const cache = caches.open(cacheName);
        cache.then((c) => c.put(request, networkResponse.clone()));
      }
      return networkResponse;
    })
    .catch((error) => {
      console.log("背景更新失敗:", request.url, error);
    });

  // 如果有緩存，立即返回；否則等待網路響應
  return cachedResponse || fetchPromise;
}

// 請求攔截
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // 非 http(s) 直接忽略
  if (!req.url.startsWith("http")) return;

  // 跨域（Railway API、CDN、Google 字体等）一律交给浏览器，SW 不拦截
  if (url.origin !== self.location.origin) return;

  // 本站若误请求 /api/，也不要缓存
  if (url.pathname.startsWith("/api/")) return;

  // 只缓存同源静态资源
  event.respondWith(smartCacheStrategy(req));
});

// 監聽來自客戶端的消息
self.addEventListener("message", (event) => {
  const data = event.data || {};
  const type = data.type;
  if(!type) return;
  switch (type) {
    case "SKIP_WAITING":
      // 強制激活新版本
      self.skipWaiting();
      break;

    case "GET_VERSION":
      // 返回當前版本信息
      event.ports[0].postMessage({
        version: VERSION,
        internalVersion: INTERNAL_VERSION,
      });
      break;

    case "CLEAR_CACHE":
      // 清除指定緩存
      if (data && data.cacheName) {
        caches.delete(data.cacheName).then((success) => {
          event.ports[0].postMessage({ success });
        });
      }
      break;

    case "FORCE_REFRESH":
      // 強制刷新所有客戶端
      self.clients.matchAll().then((clients) => {
        clients.forEach((client) => {
          client.postMessage({ type: "FORCE_RELOAD" });
        });
      });
      break;

    default:
      console.log("未知消息類型:", type);
  }
});

// 推送通知處理（預留）
self.addEventListener("push", (event) => {
  console.log("收到推送通知:", event);
  // 這裡可以處理推送通知邏輯
});

// 後台同步處理（預留）
self.addEventListener("sync", (event) => {
  console.log("後台同步事件:", event.tag);
  // 這裡可以處理後台同步邏輯
});

// 錯誤處理
self.addEventListener("error", (event) => {
  console.error("Service Worker 錯誤:", event.error);
});

// 未處理的 Promise 拒絕
self.addEventListener("unhandledrejection", (event) => {
  console.error("Service Worker 未處理的 Promise 拒絕:", event.reason);
});

console.log(
  `🚀 Service Worker 載入完成 - 版本: ${VERSION} (${INTERNAL_VERSION})`
);
