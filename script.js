/*
 * 📦 模組：社畜解放卡 - 主要腳本
 * 🕒 最後更新：2025-06-15T02:50:46+08:00
 * 🧑‍💻 作者/更新者：@s123104
 * 🔢 版本：v2.3.0
 * 📝 摘要：恢復爛日子為bad狀態，添加破爛心情統計顯示
 *
 * 🎯 影響範圍：心情系統、統計顯示、圖表配置
 * ✅ 測試狀態：已完成功能測試
 * 🔒 安全考量：移除數據遷移邏輯，保持原始數據格式
 * 📊 效能影響：新增第5種心情狀態統計
 * 🏛️ 架構決策：保持向後兼容，支援舊版bad數據
 */
"use strict";

// ========== 云同步配置（阶段二） ==========
/* window.USER_TOKEN = localStorage.getItem("user_token") || null;
window.USER_ID = localStorage.getItem("user_id") || "usr_" + Date.now();
window.API_BASE = "http://localhost:3001"; */
// ========== 云同步 + 登录配置（替换原写死 Token 段） ==========
//window.API_BASE = "http://localhost:3001";  本地地址
window.API_BASE =
  location.hostname === "localhost" || location.hostname === "127.0.0.1"
    ? "http://localhost:3001"
    : "https://work-freedom-card.onrender.com"; // 部署后端后换成真实地址 https://work-freedom-card-production.up.railway.app
window.USER_TOKEN = localStorage.getItem("user_token") || null;
window.USER_ID = localStorage.getItem("user_id") || null;
// =========================================

// --- 執行狀態管理 ---
let isSavingEvent = false;
let isInitialized = false;

// --- 全域變數 ---
let deferredPrompt;
let filledDates = new Map();
let customPresets = [];
let longPressTimer = null;
let isLongPress = false;
let currentCell = null;
let dailyChart = null;
let quoteTimer = null;
let achievements = new Map();
let handwriteFonts = [
  "font-handwrite-1",
  "font-handwrite-2",
  "font-handwrite-3",
  "font-handwrite-4",
  "font-handwrite-5",
  "font-handwrite-6",
];
// ---------- 登录 UI 逻辑 ----------
let authMode = "login"; // login | register

function openAuthModal() {
  document.getElementById("authModal")?.classList.remove("hidden");
  setAuthMode("login");
}
 
function closeAuthModal() {
  document.getElementById("authModal")?.classList.add("hidden");
  document.getElementById("authError")?.classList.add("hidden");
  document.getElementById("authSuccess")?.classList.add("hidden");
}
 
function setAuthMode(mode) {
  authMode = mode;
  const title = document.getElementById("authTitle");
  const nick = document.getElementById("authNickname");
  const submit = document.getElementById("authSubmit");
  const tabLogin = document.getElementById("tabLogin");
  const tabRegister = document.getElementById("tabRegister");
 
  if (mode === "login") {
    if (title) title.textContent = "登录";
    if (nick) nick.classList.add("hidden");
    if (submit) submit.textContent = "登录";
    tabLogin?.classList.add("bg-blue-500", "text-white");
    tabLogin?.classList.remove("bg-gray-100", "text-gray-600");
    tabRegister?.classList.add("bg-gray-100", "text-gray-600");
    tabRegister?.classList.remove("bg-blue-500", "text-white");
  } else {
    if (title) title.textContent = "注册";
    if (nick) nick.classList.remove("hidden");
    if (submit) submit.textContent = "注册";
    tabRegister?.classList.add("bg-blue-500", "text-white");
    tabRegister?.classList.remove("bg-gray-100", "text-gray-600");
    tabLogin?.classList.add("bg-gray-100", "text-gray-600");
    tabLogin?.classList.remove("bg-blue-500", "text-white");
  }
}
 
async function handleAuthSubmit() {
  const email = document.getElementById("authEmail")?.value.trim() || "";
  const password = document.getElementById("authPassword")?.value || "";
  const nickname = document.getElementById("authNickname")?.value.trim() || "打工人";
  const errEl = document.getElementById("authError");
  const okEl = document.getElementById("authSuccess");
 
  errEl?.classList.add("hidden");
  okEl?.classList.add("hidden");
 
  if (!email || !password) {
    if (errEl) { errEl.textContent = "请填写邮箱和密码"; errEl.classList.remove("hidden"); }
    return;
  }
 
  const url = authMode === "login"
    ? `${window.API_BASE}/api/v1/auth/login`
    : `${window.API_BASE}/api/v1/auth/register`;
 
  const body = authMode === "login"
    ? { email, password }
    : { email, password, nickname };
 
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await res.json();
    if (!res.ok) {
      if (errEl) { errEl.textContent = result.error || "操作失败"; errEl.classList.remove("hidden"); }
      return;
    }
 
    // 存 Token
    localStorage.setItem("user_token", result.token);
    localStorage.setItem("user_id", result.user_id);
    localStorage.setItem("user_email", result.email || email);
    localStorage.setItem("user_nickname", result.nickname || nickname);
    window.USER_TOKEN = result.token;
    window.USER_ID = result.user_id;
 
    if (okEl) { okEl.textContent = result.message || "成功"; okEl.classList.remove("hidden"); }
    updateAuthButton();
    // 登录成功后从云端拉数据
    await pullCloudEvents();
    setTimeout(() => closeAuthModal(), 800);
  } catch (e) {
    if (errEl) { errEl.textContent = "网络错误，请确认后端已启动"; errEl.classList.remove("hidden"); }
  }
}
 
function updateAuthButton() {
  const btn = document.getElementById("authOpenBtn");
  if (!btn) return;
  if (window.USER_TOKEN) {
    const name = localStorage.getItem("user_nickname") || localStorage.getItem("user_email") || "已登录";
    btn.textContent = name;
    btn.classList.remove("bg-blue-500", "hover:bg-blue-600");
    btn.classList.add("bg-gray-500");
  } else {
    btn.textContent = "登录 / 注册";
    btn.classList.add("bg-blue-500", "hover:bg-blue-600");
    btn.classList.remove("bg-gray-500");
  }
}
 
function logout() {
  localStorage.removeItem("user_token");
  localStorage.removeItem("user_id");
  localStorage.removeItem("user_email");
  localStorage.removeItem("user_nickname");
  window.USER_TOKEN = null;
  window.USER_ID = null;
  updateAuthButton();
  alert("已退出登录");
}

// --- 應用程式核心初始化 ---
function initializeApplication() {
  if (isInitialized) return;

  try {
    console.log("開始初始化應用程式...");

    // 檢查並執行強制更新
    checkForceUpdate();

    // 確保全域變數正確初始化
    if (typeof window.filledDates === "undefined") {
      window.filledDates = new Map();
    }

    if (typeof window.handwriteFonts === "undefined") {
      window.handwriteFonts = [
        "font-handwrite-1",
        "font-handwrite-2",
        "font-handwrite-3",
        "font-handwrite-4",
        "font-handwrite-5",
        "font-handwrite-6",
      ];
    }

    if (typeof window.achievements === "undefined") {
      window.achievements = new Map();
    }

    if (typeof window.customPresets === "undefined") {
      window.customPresets = [];
    }

    // 載入已存在的資料
    loadExistingData();

    isInitialized = true;
    console.log("應用程式初始化完成");
  } catch (error) {
    console.error("應用程式初始化失敗:", error);
  }
}

// --- PWA 自動更新系統 ---
function checkForceUpdate() {
  const currentVersion = "v14";
  const lastVersion = localStorage.getItem("app_version");

  if (lastVersion !== currentVersion) {
    console.log(`檢測到版本更新: ${lastVersion} → ${currentVersion}`);

    // 執行數據遷移
    performDataMigration();

    // 更新版本記錄
    localStorage.setItem("app_version", currentVersion);

    // 顯示更新通知（僅在非首次載入時）
    if (lastVersion && lastVersion !== currentVersion) {
      showMigrationNotification();
    }
  }
}

// --- Service Worker 更新管理 ---
let swRegistration = null;
let isUpdateAvailable = false;

async function initServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    console.log("此瀏覽器不支援 Service Worker");
    return;
  }

  try {
    // 註冊 Service Worker
    swRegistration = await navigator.serviceWorker.register("/sw.js", {
      scope: "/",
      updateViaCache: "none", // 禁用 SW 文件的 HTTP 緩存
    });

    console.log("Service Worker 註冊成功:", swRegistration);

    // 監聽 SW 更新
    swRegistration.addEventListener("updatefound", handleServiceWorkerUpdate);

    // 監聽來自 SW 的消息
    navigator.serviceWorker.addEventListener(
      "message",
      handleServiceWorkerMessage
    );

    // 定期檢查更新（每 30 秒）
    setInterval(() => {
      if (swRegistration) {
        swRegistration.update();
      }
    }, 30000);

    // 頁面可見性改變時檢查更新
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && swRegistration) {
        swRegistration.update();
      }
    });

    // 檢查是否有等待中的 SW
    if (swRegistration.waiting) {
      handleServiceWorkerUpdate();
    }
  } catch (error) {
    console.error("Service Worker 註冊失敗:", error);
  }
}

// 處理 Service Worker 更新
function handleServiceWorkerUpdate() {
  const installingWorker = swRegistration.installing;
  if (!installingWorker) return;

  installingWorker.addEventListener("statechange", () => {
    if (installingWorker.state === "installed") {
      if (navigator.serviceWorker.controller) {
        // 有新版本可用
        isUpdateAvailable = true;
        showUpdatePrompt();
      } else {
        // 首次安裝
        console.log("Service Worker 首次安裝完成");
        showInstallNotification();
      }
    }
  });
}

// 處理來自 Service Worker 的消息
function handleServiceWorkerMessage(event) {
  const { type, version, internalVersion, message } = event.data;

  switch (type) {
    case "SW_INSTALLED":
      console.log(
        `Service Worker 安裝完成 - 版本: ${version} (${internalVersion})`
      );
      break;

    case "SW_ACTIVATED":
      console.log(
        `Service Worker 已激活 - 版本: ${version} (${internalVersion})`
      );
      break;

    case "FORCE_UPDATE_REQUIRED":
      console.log("強制更新要求:", message);
      showForceUpdatePrompt(version, message);
      break;

    case "FORCE_RELOAD":
      console.log("強制重新載入頁面");
      window.location.reload();
      break;

    default:
      console.log("收到未知 SW 消息:", event.data);
  }
}

// 顯示更新提示
function showUpdatePrompt() {
  const notification = document.createElement("div");
  notification.id = "update-prompt";
  notification.innerHTML = `
    <div class="fixed top-4 left-1/2 transform -translate-x-1/2 z-[9999] bg-gradient-to-r from-blue-500 to-indigo-600 text-white px-6 py-4 rounded-lg shadow-lg max-w-sm mx-4">
      <div class="flex items-center gap-3">
        <i class="fas fa-download animate-pulse text-xl"></i>
        <div class="flex-1">
          <div class="font-bold text-sm">新版本可用！</div>
          <div class="text-xs opacity-90 mt-1">點擊更新以獲得最新功能</div>
        </div>
      </div>
      <div class="flex gap-2 mt-3">
        <button id="update-btn" class="flex-1 bg-white text-blue-600 px-3 py-1 rounded text-sm font-medium hover:bg-gray-100 transition-colors">
          <i class="fas fa-sync-alt mr-1"></i>立即更新
        </button>
        <button id="dismiss-btn" class="px-3 py-1 border border-white/30 rounded text-sm hover:bg-white/10 transition-colors">
          稍後
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(notification);

  // 更新按鈕事件
  document.getElementById("update-btn").addEventListener("click", () => {
    applyUpdate();
  });

  // 稍後按鈕事件
  document.getElementById("dismiss-btn").addEventListener("click", () => {
    removeUpdatePrompt();
    // 5 分鐘後再次提醒
    setTimeout(() => {
      if (isUpdateAvailable) {
        showUpdatePrompt();
      }
    }, 5 * 60 * 1000);
  });
}

// 顯示強制更新提示
function showForceUpdatePrompt(version, message) {
  const notification = document.createElement("div");
  notification.id = "force-update-prompt";
  notification.innerHTML = `
    <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4">
      <div class="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
        <div class="text-center">
          <div class="text-3xl mb-4">🚀</div>
          <h3 class="text-lg font-bold text-gray-900 mb-2">重要更新</h3>
          <p class="text-gray-600 mb-4">${message}</p>
          <p class="text-sm text-gray-500 mb-6">版本: ${version}</p>
          <button id="force-update-btn" class="w-full bg-blue-500 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-600 transition-colors">
            <i class="fas fa-download mr-2"></i>立即更新
          </button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(notification);

  document.getElementById("force-update-btn").addEventListener("click", () => {
    applyUpdate();
  });
}

// 應用更新
async function applyUpdate() {
  try {
    removeUpdatePrompt();
    showUpdatingNotification();

    if (swRegistration && swRegistration.waiting) {
      // 通知 SW 跳過等待
      swRegistration.waiting.postMessage({ type: "SKIP_WAITING" });
    }

    // 清除所有緩存
    if ("caches" in window) {
      const cacheNames = await caches.keys();
      const deletePromises = cacheNames
        .filter((name) => name.startsWith("work-freedom-card-"))
        .map((name) => caches.delete(name));
      await Promise.all(deletePromises);
    }

    // 等待一下讓 SW 完成激活
    setTimeout(() => {
      window.location.reload();
    }, 1000);
  } catch (error) {
    console.error("更新失敗:", error);
    showUpdateErrorNotification();
  }
}

// 移除更新提示
function removeUpdatePrompt() {
  const prompts = [
    document.getElementById("update-prompt"),
    document.getElementById("force-update-prompt"),
  ];
  prompts.forEach((prompt) => {
    if (prompt && prompt.parentNode) {
      prompt.parentNode.removeChild(prompt);
    }
  });
}

// 顯示正在更新通知
function showUpdatingNotification() {
  const notification = document.createElement("div");
  notification.id = "updating-notification";
  notification.innerHTML = `
    <div class="fixed top-4 left-1/2 transform -translate-x-1/2 z-[9999] bg-gradient-to-r from-green-500 to-emerald-600 text-white px-6 py-4 rounded-lg shadow-lg">
      <div class="flex items-center gap-3">
        <i class="fas fa-sync-alt animate-spin text-xl"></i>
        <span class="font-medium">正在更新應用程式...</span>
      </div>
    </div>
  `;

  document.body.appendChild(notification);
}

// 顯示安裝通知
function showInstallNotification() {
  const notification = document.createElement("div");
  notification.innerHTML = `
    <div class="fixed top-4 left-1/2 transform -translate-x-1/2 z-[9999] bg-gradient-to-r from-green-500 to-emerald-600 text-white px-6 py-4 rounded-lg shadow-lg animate-bounce">
      <div class="flex items-center gap-3">
        <i class="fas fa-check-circle text-xl"></i>
        <span class="font-medium">應用程式已成功安裝！</span>
      </div>
    </div>
  `;

  document.body.appendChild(notification);

  setTimeout(() => {
    if (notification.parentNode) {
      notification.parentNode.removeChild(notification);
    }
  }, 3000);
}

// 顯示更新錯誤通知
function showUpdateErrorNotification() {
  const notification = document.createElement("div");
  notification.innerHTML = `
    <div class="fixed top-4 left-1/2 transform -translate-x-1/2 z-[9999] bg-gradient-to-r from-red-500 to-red-600 text-white px-6 py-4 rounded-lg shadow-lg">
      <div class="flex items-center gap-3">
        <i class="fas fa-exclamation-triangle text-xl"></i>
        <span class="font-medium">更新失敗，請重新整理頁面</span>
      </div>
    </div>
  `;

  document.body.appendChild(notification);

  setTimeout(() => {
    if (notification.parentNode) {
      notification.parentNode.removeChild(notification);
    }
  }, 5000);
}

// --- 數據遷移函數 ---
function performDataMigration() {
  console.log("數據遷移功能已完成，無需進一步遷移");
  // 數據遷移功能已完成，保留此函數以避免錯誤
}

// --- 顯示更新通知 ---
function showUpdateNotification() {
  // 創建通知元素
  const notification = document.createElement("div");
  notification.innerHTML = `
    <div class="fixed top-4 left-1/2 transform -translate-x-1/2 z-[9999] bg-gradient-to-r from-blue-500 to-purple-600 text-white px-6 py-4 rounded-lg shadow-lg flex items-center gap-3 animate-bounce">
      <i class="fas fa-sync-alt animate-spin"></i>
      <span class="font-medium">檢測到新版本，正在更新快取...</span>
    </div>
  `;

  document.body.appendChild(notification);

  // 2秒後移除通知
  setTimeout(() => {
    if (notification.parentNode) {
      notification.parentNode.removeChild(notification);
    }
  }, 1800);
}

// --- 顯示遷移通知 ---
function showMigrationNotification(count) {
  // 創建通知元素
  const notification = document.createElement("div");
  notification.innerHTML = `
    <div class="fixed top-20 left-1/2 transform -translate-x-1/2 z-[9999] bg-gradient-to-r from-green-500 to-blue-600 text-white px-6 py-4 rounded-lg shadow-lg flex items-center gap-3 animate-pulse">
      <i class="fas fa-database"></i>
      <span class="font-medium">數據遷移完成！已更新 ${count} 筆記錄</span>
    </div>
  `;

  document.body.appendChild(notification);

  // 3秒後移除通知
  setTimeout(() => {
    if (notification.parentNode) {
      notification.parentNode.removeChild(notification);
    }
  }, 3000);
}

// --- 安全的資料載入程序 ---
function loadExistingData() {
  try {
    const savedData = localStorage.getItem(STORAGE_KEY);
    if (savedData) {
      const parsedData = JSON.parse(savedData);
      if (parsedData.dates && Array.isArray(parsedData.dates)) {
        parsedData.dates.forEach(([index, data]) => {
          // 直接載入數據，不進行任何遷移
          filledDates.set(index, data);
        });
      }
      if (parsedData.presets && Array.isArray(parsedData.presets)) {
        customPresets = parsedData.presets;
      }
    }

    const savedAchievements = localStorage.getItem(ACHIEVEMENTS_KEY);
    if (savedAchievements) {
      const parsedAchievements = JSON.parse(savedAchievements);
      if (Array.isArray(parsedAchievements)) {
        parsedAchievements.forEach(([key, value]) => {
          achievements.set(key, value);
        });
      }
    }

    console.log("資料載入完成:", {
      filledDates: filledDates.size,
      customPresets: customPresets.length,
      achievements: achievements.size,
    });
  } catch (error) {
    console.error("資料載入失敗:", error);
    // 初始化為空資料結構
    filledDates = new Map();
    customPresets = [];
    achievements = new Map();
  }
}
const STORAGE_KEY = "resignationCard_v5";
const PRESETS_KEY = "resignationCard_presets_v2";
const ACHIEVEMENTS_KEY = "resignationCard_achievements_v1";
const TOTAL_CELLS = 100;

// --- 成就系統定義 ---
const ACHIEVEMENT_DEFINITIONS = {
  first_fill: {
    name: "初次踏入",
    description: "完成第一個格子",
    icon: '<i class="fas fa-running text-green-500"></i>',
    category: "入門",
    condition: (data) => data.totalFilled >= 1,
    animation: "sparkle",
    rarity: "common",
  },
  money_lover: {
    name: "賺錢狂魔",
    description: "累積5天選擇金錢心情",
    icon: '<i class="fas fa-coins text-yellow-500"></i>',
    category: "心情",
    condition: (data) => data.consecutiveMoney >= 5,
    animation: "goldShimmer",
    rarity: "rare",
  },
  burnout_master: {
    name: "燃燒殆盡",
    description: "單日身心俱疲心情達到10次",
    icon: '<i class="fas fa-fire text-red-500"></i>',
    category: "心情",
    condition: (data) => data.dailyBurnout >= 10,
    animation: "fireEffect",
    rarity: "rare",
  },
  annoyance_king: {
    name: "高压达人",
    description: "压力指數達到500",
    icon: '<i class="fas fa-crown text-purple-500"></i>',
    category: "压力",
    condition: (data) => data.totalAnnoyance >= 500,
    animation: "sparkle",
    rarity: "epic",
  },
  speed_demon: {
    name: "手速如飛",
    description: "10秒內完成5個格子",
    icon: '<i class="fas fa-bolt text-blue-500"></i>',
    category: "操作",
    condition: (data) => data.speedFills >= 5,
    animation: "lightningStrike",
    rarity: "rare",
  },
  weekend_warrior: {
    name: "週末戰士",
    description: "累積4個週末都有填寫",
    icon: '<i class="fas fa-umbrella-beach text-cyan-500"></i>',
    category: "堅持",
    condition: (data) => data.weekendStreak >= 4,
    animation: "sparkle",
    rarity: "rare",
  },
  midnight_worker: {
    name: "深夜工作者",
    description: "在凌晨12點後填寫格子",
    icon: '<i class="fas fa-moon text-indigo-500"></i>',
    category: "時間",
    condition: (data) => data.midnightFills >= 1,
    animation: "sparkle",
    rarity: "rare",
  },
  rainbow_collector: {
    name: "彩虹收集者",
    description: "一天內體驗所有6種心情",
    icon: '<i class="ri-rainbow-line text-pink-500"></i>',
    category: "心情",
    condition: (data) => data.rainbowDay,
    animation: "rainbowFlow",
    rarity: "epic",
  },
  persistence_master: {
    name: "堅持大師",
    description: "累積30天填寫",
    icon: '<i class="fas fa-trophy text-yellow-600"></i>',
    category: "堅持",
    condition: (data) => data.consecutiveDays >= 30,
    animation: "goldShimmer",
    rarity: "legendary",
  },
  freedom_seeker: {
    name: "自由追求者",
    description: "完成所有100個格子",
    icon: '<i class="fas fa-dove text-blue-400"></i>',
    category: "完成",
    condition: (data) => data.totalFilled >= 100,
    animation: "freedomBurst",
    rarity: "legendary",
  },
};

function toLocalDateStr(date) {
  return date.toLocaleDateString("en-CA");
}

// --- 心情圖示 SVG ---
const moodIcons = {
  money: `<svg viewBox="0 0 24 24" class="w-8 h-8 mx-auto stroke-current text-yellow-600"><path d="M9 10a1 1 0 11-2 0 1 1 0 012 0zm6 0a1 1 0 11-2 0 1 1 0 012 0zm-4 5a4 4 0 01-4-4h8a4 4 0 01-4 4zm4.5-8.5a1.5 1.5 0 00-3 0h3zm-4-3a.5.5 0 001 0h-1zM12 2a10 10 0 100 20 10 10 0 000-20z" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>`,
  burnout: `<svg viewBox="0 0 24 24" class="w-8 h-8 mx-auto stroke-current text-red-600"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zM9 15s1.5-2 3-2 3 2 3 2M9 9h.01M15 9h.01" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"></path></svg>`,
  annoying: `<svg viewBox="0 0 24 24" class="w-8 h-8 mx-auto stroke-current text-indigo-600"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zM8 9l8 6M8 15L16 9" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>`,
  stuck: `<svg viewBox="0 0 24 24" class="w-8 h-8 mx-auto stroke-current text-gray-600"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zM9 12h6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>`,
  bad: `<svg viewBox="0 0 24 24" class="w-8 h-8 mx-auto stroke-current text-green-600"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zM8 14s2-3 4-3 4 3 4 3M9 9h.01M15 9h.01" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"></path></svg>`,
  bullying: `<svg viewBox="0 0 24 24" class="w-8 h-8 mx-auto stroke-current text-orange-600"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zM8 8h8M8 12h8M8 16h8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M16 8l2-2M16 16l2 2M8 8l-2-2M8 16l-2 2" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>`,
};

// --- 心情顏色配置 ---
const moodColors = {
  money: { bg: "rgba(245, 158, 11, 0.2)", border: "#f59e0b" },
  burnout: { bg: "rgba(239, 68, 68, 0.2)", border: "#ef4444" },
  annoying: { bg: "rgba(99, 102, 241, 0.2)", border: "#6366f1" },
  stuck: { bg: "rgba(107, 114, 128, 0.2)", border: "#6b7280" },
  //bad: { bg: "rgba(34, 197, 94, 0.2)", border: "#22c55e" },
  bad: { bg: "rgba(59, 130, 246, 0.2)", border: "#3b82f6" }, // 心态崩了，与格子蓝色一致
  bullying: { bg: "rgba(234, 88, 12, 0.2)", border: "#ea580c" },
};

// --- 擴充後的压力指數關鍵字庫 ---
const annoyanceKeywords = new Map([
  // 強烈髒話 (10分)
  ["幹你娘", 10],
  ["操你媽", 10],
  ["機掰", 10],
  ["雞掰", 10],
  ["三小", 10],
  // 常見髒話 (8分)
  ["幹", 8],
  ["操", 8],
  ["靠", 8],
  ["靠杯", 8],
  ["靠北", 8],
  ["媽的", 8],
  ["媽蛋", 8],
  // 侮辱性詞彙 (7分)
  ["白痴", 7],
  ["智障", 7],
  ["腦殘", 7],
  ["低能", 7],
  ["廢物", 7],
  ["垃圾", 7],
  ["北七", 7],
  ["白癡", 7],
  // 職場負面行為 (6分)
  ["甩鍋", 6],
  ["推卸", 6],
  ["卸責", 6],
  ["畫大餅", 6],
  ["凹人", 6],
  ["壓榨", 6],
  ["慣老闆", 6],
  ["空降", 6],
  // 人物相關 (5分)
  ["老闆", 5],
  ["主管", 5],
  ["客戶", 5],
  ["老闆娘", 5],
  ["豬隊友", 5],
  ["小人", 5],
  ["機車", 5],
  ["雞歪", 5],
  ["無能", 5],
  // 工作內容 (4分)
  ["加班", 4],
  ["報告", 4],
  ["會議", 4],
  ["開會", 4],
  ["文件", 4],
  ["需求", 4],
  ["改來改去", 4],
  ["沒效率", 4],
  // 薪資與福利 (5分)
  ["薪水", 5],
  ["加薪", 5],
  ["年終", 5],
  ["分紅", 5],
  ["低薪", 5],
  ["沒錢", 5],
  // 情緒與狀態 (3分)
  ["不爽", 3],
  ["煩", 3],
  ["累", 3],
  ["壓力", 3],
  ["崩潰", 3],
  ["心累", 3],
  ["想死", 3],
  ["痛苦", 3],
  ["絕望", 3],
  ["沒意義", 3],
  ["無力", 3],
  ["倦怠", 3],
  ["鳥事", 3],
  ["爛", 3],
  ["瞎", 3],
  ["傻眼", 3],
  // 其他台灣常用語 (2-4分)
  ["搞事", 4],
  ["有事嗎", 3],
  ["三八", 2],
  ["哭喔", 3],
  ["是在哈囉", 2],
  ["炎上", 4],
  ["出包", 4],
  ["打槍", 4],
  ["銃康", 4],
]);

// --- 初始化 ---
document.addEventListener("DOMContentLoaded", () => {
  loadData();
  loadAchievements();
  generateGrid();
  renderMoodIcons();
  renderPresetButtons();
  updateAllStats();
  initChart();
  setupEventListeners();
  checkAndShowPwaPrompt();
  scheduleDailyUpdate();
  renderAchievements();
  setTimeout(
    () =>
      document
        .querySelector("#gridContainer")
        .classList.add("animate-bounce-in"),
    500
  );
});

// --- PWA & 核心功能 ---
function checkAndShowPwaPrompt() {
  const isIOS =
    /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const isInStandaloneMode =
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone;
  const optOut = localStorage.getItem("iosPwaPromptOptOut");

  if (isIOS && !isInStandaloneMode && optOut !== "true") {
    if (!localStorage.getItem("iosPwaPromptShown")) {
      setupSmartPwaModal();
      openModal("iosPwaModal");
      localStorage.setItem("iosPwaPromptShown", "true");
    }
  } else {
    // Android 或其他平台
    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      deferredPrompt = e;

      // 顯示自定義安裝提示
      if (optOut !== "true") {
        setupSmartPwaModal();
        openModal("iosPwaModal");
      }
    });
  }
}

// 智能PWA模態窗設置
function setupSmartPwaModal() {
  const deviceInfo = detectUserDevice();
  generateInstallationInstructions(deviceInfo);
  setupPrimaryInstallButton(deviceInfo);
}

// 檢測用戶設備和瀏覽器
function detectUserDevice() {
  const userAgent = navigator.userAgent.toLowerCase();
  const platform = navigator.platform.toLowerCase();

  const isIOS = /ipad|iphone|ipod/.test(userAgent) && !window.MSStream;
  const isAndroid = /android/.test(userAgent);
  const isMac = /mac/.test(platform);
  const isWindows = /win/.test(platform);
  const isLinux = /linux/.test(platform) && !isAndroid;

  const isChrome = /chrome/.test(userAgent) && !/edg/.test(userAgent);
  const isEdge = /edg/.test(userAgent);
  const isSafari = /safari/.test(userAgent) && !/chrome/.test(userAgent);
  const isFirefox = /firefox/.test(userAgent);

  return {
    platform: {
      isIOS,
      isAndroid,
      isMac,
      isWindows,
      isLinux,
      isMobile: isIOS || isAndroid,
      isDesktop: !isIOS && !isAndroid,
    },
    browser: {
      isChrome,
      isEdge,
      isSafari,
      isFirefox,
      name: isChrome
        ? "Chrome"
        : isEdge
        ? "Edge"
        : isSafari
        ? "Safari"
        : isFirefox
        ? "Firefox"
        : "Unknown",
    },
    supportsInstall: isChrome || isEdge || (isSafari && isIOS),
  };
}

// 生成安裝指引
function generateInstallationInstructions(deviceInfo) {
  const container = document.getElementById("installationInstructions");
  let instructions = "";

  if (deviceInfo.platform.isIOS && deviceInfo.browser.isSafari) {
    instructions = generateIOSInstructions();
  } else if (deviceInfo.platform.isAndroid && deviceInfo.browser.isChrome) {
    instructions = generateAndroidInstructions();
  } else if (
    deviceInfo.platform.isDesktop &&
    (deviceInfo.browser.isChrome || deviceInfo.browser.isEdge)
  ) {
    instructions = generateDesktopInstructions(deviceInfo.browser.name);
  } else {
    instructions = generateGenericInstructions(deviceInfo);
  }

  container.innerHTML = instructions;
}

// iOS Safari 安裝指引
function generateIOSInstructions() {
  return `
    <div class="bg-gradient-to-r from-blue-50 to-indigo-50 p-6 rounded-2xl border border-blue-200 shadow-sm">
      <h3 class="font-bold text-blue-900 mb-4 flex items-center text-lg">
        <i class="fab fa-apple mr-3 text-blue-600"></i>iPhone / iPad 安裝步驟
      </h3>
      <div class="space-y-4">
        <div class="flex items-start gap-4">
          <div class="w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold">1</div>
          <div class="flex-1">
            <p class="text-blue-800 font-medium mb-1">點擊底部分享按鈕</p>
            <p class="text-blue-600 text-sm">在 Safari 瀏覽器底部找到 <i class="fas fa-share mx-1 text-blue-500"></i> 分享圖示並點擊</p>
          </div>
        </div>
        <div class="flex items-start gap-4">
          <div class="w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold">2</div>
          <div class="flex-1">
            <p class="text-blue-800 font-medium mb-1">選擇「加入主畫面」</p>
            <p class="text-blue-600 text-sm">向下滑動選單，找到 <i class="fas fa-plus-square mx-1 text-green-500"></i> 「加入主畫面」選項</p>
          </div>
        </div>
        <div class="flex items-start gap-4">
          <div class="w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold">3</div>
          <div class="flex-1">
            <p class="text-blue-800 font-medium mb-1">完成安裝</p>
            <p class="text-blue-600 text-sm">點擊右上角「新增」按鈕 <i class="fas fa-check-circle mx-1 text-green-500"></i> 完成安裝</p>
          </div>
        </div>
      </div>
    </div>
  `;
}

// Android Chrome 安裝指引
function generateAndroidInstructions() {
  return `
    <div class="bg-gradient-to-r from-green-50 to-emerald-50 p-6 rounded-2xl border border-green-200 shadow-sm">
      <h3 class="font-bold text-green-900 mb-4 flex items-center text-lg">
        <i class="fab fa-android mr-3 text-green-600"></i>Android 安裝步驟
      </h3>
      <div class="space-y-4">
        <div class="flex items-start gap-4">
          <div class="w-8 h-8 bg-green-500 text-white rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold">1</div>
          <div class="flex-1">
            <p class="text-green-800 font-medium mb-1">點擊選單按鈕</p>
            <p class="text-green-600 text-sm">點擊瀏覽器右上角的 <i class="fas fa-ellipsis-v mx-1 text-green-500"></i> 三點選單</p>
          </div>
        </div>
        <div class="flex items-start gap-4">
          <div class="w-8 h-8 bg-green-500 text-white rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold">2</div>
          <div class="flex-1">
            <p class="text-green-800 font-medium mb-1">選擇安裝選項</p>
            <p class="text-green-600 text-sm">找到 <i class="fas fa-download mx-1 text-green-500"></i> 「安裝應用程式」或「加到主畫面」</p>
          </div>
        </div>
        <div class="flex items-start gap-4">
          <div class="w-8 h-8 bg-green-500 text-white rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold">3</div>
          <div class="flex-1">
            <p class="text-green-800 font-medium mb-1">確認安裝</p>
            <p class="text-green-600 text-sm">點擊「安裝」確認 <i class="fas fa-check-circle mx-1 text-green-500"></i> 應用程式將出現在主畫面</p>
          </div>
        </div>
      </div>
    </div>
  `;
}

// 桌面版安裝指引
function generateDesktopInstructions(browserName) {
  return `
    <div class="bg-gradient-to-r from-purple-50 to-indigo-50 p-6 rounded-2xl border border-purple-200 shadow-sm">
      <h3 class="font-bold text-purple-900 mb-4 flex items-center text-lg">
        <i class="fas fa-desktop mr-3 text-purple-600"></i>桌面版 ${browserName} 安裝步驟
      </h3>
      <div class="space-y-4">
        <div class="flex items-start gap-4">
          <div class="w-8 h-8 bg-purple-500 text-white rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold">1</div>
          <div class="flex-1">
            <p class="text-purple-800 font-medium mb-1">尋找安裝圖示</p>
            <p class="text-purple-600 text-sm">在網址列右側找到 <i class="fas fa-plus-circle mx-1 text-purple-500"></i> 安裝圖示</p>
          </div>
        </div>
        <div class="flex items-start gap-4">
          <div class="w-8 h-8 bg-purple-500 text-white rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold">2</div>
          <div class="flex-1">
            <p class="text-purple-800 font-medium mb-1">點擊安裝</p>
            <p class="text-purple-600 text-sm">點擊圖示，然後選擇 <i class="fas fa-download mx-1 text-purple-500"></i> 「安裝」</p>
          </div>
        </div>
        <div class="flex items-start gap-4">
          <div class="w-8 h-8 bg-purple-500 text-white rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold">3</div>
          <div class="flex-1">
            <p class="text-purple-800 font-medium mb-1">完成安裝</p>
            <p class="text-purple-600 text-sm">應用程式將出現在開始選單 <i class="fas fa-check-circle mx-1 text-purple-500"></i> 或應用程式列表中</p>
          </div>
        </div>
      </div>
    </div>
  `;
}

// 通用安裝指引
function generateGenericInstructions(deviceInfo) {
  let platformText = deviceInfo.platform.isMobile ? "手機" : "電腦";
  let browserText = deviceInfo.browser.name || "您的瀏覽器";

  return `
    <div class="bg-gradient-to-r from-gray-50 to-slate-50 p-6 rounded-2xl border border-gray-200 shadow-sm">
      <h3 class="font-bold text-gray-900 mb-4 flex items-center text-lg">
        <i class="fas fa-globe mr-3 text-gray-600"></i>${platformText} (${browserText}) 安裝說明
      </h3>
      <div class="text-gray-700 space-y-3">
        <p class="text-sm leading-relaxed">
          您的 ${browserText} 瀏覽器可能支援 PWA 安裝功能。請尋找以下安裝選項：
        </p>
        <ul class="space-y-2 text-sm list-disc list-inside text-gray-600 ml-4">
          <li>網址列中的安裝圖示 <i class="fas fa-plus-circle mx-1"></i></li>
          <li>瀏覽器選單中的「安裝應用程式」選項</li>
          <li>「加到主畫面」或「加到桌面」選項</li>
        </ul>
      </div>
    </div>
  `;
}

// 設置主要安裝按鈕
function setupPrimaryInstallButton(deviceInfo) {
  const btn = document.getElementById("primaryInstallBtn");
  const text = document.getElementById("primaryInstallText");

  if (deferredPrompt) {
    text.textContent = "立即安裝";
    btn.onclick = () => {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then((choiceResult) => {
          if (choiceResult.outcome === "accepted") {
            handleIosPwaClose();
          }
          deferredPrompt = null;
        });
      }
    };
  } else if (deviceInfo.supportsInstall) {
    text.textContent = "我知道了";
    btn.onclick = handleIosPwaClose;
  } else {
    text.textContent = "繼續使用";
    btn.onclick = handleIosPwaClose;
  }
}

// 處理主要安裝動作
function handlePrimaryInstallAction() {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then((choiceResult) => {
      if (choiceResult.outcome === "accepted") {
        handleIosPwaClose();
      }
      deferredPrompt = null;
    });
  } else {
    handleIosPwaClose();
  }
}

async function installPWA() {
  if (deferredPrompt) deferredPrompt.prompt();
}

function handleIosPwaClose() {
  if (document.getElementById("iosPwaDontShow").checked) {
    localStorage.setItem("iosPwaPromptOptOut", "true");
  }
  closeModal("iosPwaModal");
}

// Service Worker 註冊已移至 HTML 底部，這裡不再重複註冊

// --- 資料處理 ---
function loadData() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) filledDates = new Map(JSON.parse(saved).dates || []);
    const savedPresets = localStorage.getItem(PRESETS_KEY);
    customPresets = savedPresets
      ? JSON.parse(savedPresets)
      : ["開不完的會", "慣老闆", "豬隊友", "突發任務"];
  } catch (e) {
    console.error("載入資料失敗:", e);
  }
}

function saveData() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ dates: Array.from(filledDates.entries()) })
    );
    localStorage.setItem(PRESETS_KEY, JSON.stringify(customPresets));
  } catch (e) {
    console.error("儲存資料失敗:", e);
  }
}

// ---------- 云同步：保存事件 ----------
async function saveMoodEvent(eventData) {
  // 本地备份
  try {
    let localData = JSON.parse(localStorage.getItem("work_freedom_data") || "{}");
    localData.events = localData.events || [];
    localData.events.push({ ...eventData, syncedAt: new Date().toISOString() });
    localStorage.setItem("work_freedom_data", JSON.stringify(localData));
  } catch (e) {
    console.warn("本地额外备份失败", e);
  }
 
  if (!window.USER_TOKEN) return; // 未登录只本地
 
  try {
    const res = await fetch(`${window.API_BASE}/api/v1/mood/events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${window.USER_TOKEN}`,
      },
      body: JSON.stringify({
        category_code: eventData.mood,
        score: eventData.score || 1,
        note: eventData.description || "",
        date: eventData.date || undefined,
      }),
    });
    if (res.ok) {
      const result = await res.json();
      console.log("✅ 云端同步成功", result);
    } else if (res.status === 401) {
      console.warn("Token 失效，请重新登录");
      logout();
    } else {
      console.warn("云端同步失败", res.status);
    }
  } catch (err) {
    console.warn("云端同步失败，仅本地保存", err);
  }
}
 
// ---------- 云同步：登录后拉取并合并到本地 ----------
async function pullCloudEvents() {
  if (!window.USER_TOKEN) return;
 
  try {
    const res = await fetch(`${window.API_BASE}/api/v1/mood/events`, {
      headers: { Authorization: `Bearer ${window.USER_TOKEN}` },
    });
    if (!res.ok) {
      if (res.status === 401) logout();
      return;
    }
    const { events } = await res.json();
    if (!events || !events.length) {
      console.log("云端暂无数据");
      return;
    }
 
    // 合并策略：按 date + mood + note 去重，云端有而本地没有的写入 filledDates
    let added = 0;
    events.forEach((ev) => {
      const dateStr = (ev.recordedAt || "").slice(0, 10);
      if (!dateStr) return;
 
      // 找一个空格子或已有同日期格子
      let targetIndex = null;
      for (const [idx, data] of filledDates.entries()) {
        if (data.date === dateStr && data.mood === ev.categoryCode) {
          targetIndex = idx; // 已有，跳过新增
          break;
        }
      }
      if (targetIndex !== null) return;
 
      // 找第一个空格子
      for (let i = 0; i < TOTAL_CELLS; i++) {
        if (!filledDates.has(i)) {
          targetIndex = i;
          break;
        }
      }
      if (targetIndex === null) return;
 
      const record = {
        date: dateStr,
        displayDate: dateStr.slice(5).replace("-", "/"),
        mood: ev.categoryCode,
        description: ev.note || "",
        timestamp: ev.recordedAt,
        annoyanceIndex: 0,
        fontStyle: handwriteFonts[Math.floor(Math.random() * handwriteFonts.length)],
      };
      filledDates.set(targetIndex, record);
      const cell = document.querySelector(`[data-index="${targetIndex}"]`);
      if (cell) fillCell(cell, record);
      added++;
    });
 
    if (added > 0) {
      saveData();
      updateAllStats();
      console.log(`✅ 已从云端合并 ${added} 条记录`);
      alert(`已从云端同步 ${added} 条记录到本地`);
    }
  } catch (err) {
    console.warn("拉取云端数据失败", err);
  }
}

// ========== 双模式保存（本地 + 云端） ==========
/* async function saveMoodEvent(eventData) {
  // 1. 本地 LocalStorage 优先写入（兼容原有逻辑）
  try {
    let localData = JSON.parse(localStorage.getItem("work_freedom_data") || "{}");
    localData.events = localData.events || [];
    localData.events.push({
      ...eventData,
      syncedAt: new Date().toISOString(),
    });
    localStorage.setItem("work_freedom_data", JSON.stringify(localData));
  } catch (e) {
    console.warn("本地额外备份失败", e);
  }

  // 2. 如果有 Token，异步同步到云端
  if (window.USER_TOKEN) {
    try {
      const res = await fetch(`${window.API_BASE}/api/v1/mood/events`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${window.USER_TOKEN}`,
        },
        body: JSON.stringify({
          user_id: window.USER_ID,
          category_code: eventData.mood, // 对应前端的 mood 字段
          score: eventData.score || 1,
          note: eventData.description || "",
        }),
      });

      if (res.ok) {
        const result = await res.json();
        console.log("✅ 云端同步成功", result);
        // 可选：在页面上显示同步成功提示
      } else {
        console.warn("云端同步失败，状态码：", res.status);
      }
    } catch (err) {
      console.warn("云端同步失败，仅本地保存", err);
    }
  }
} */

// --- 成就系統 ---
function loadAchievements() {
  try {
    const saved = localStorage.getItem(ACHIEVEMENTS_KEY);
    if (saved) {
      achievements = new Map(JSON.parse(saved));
    }
  } catch (e) {
    console.error("載入成就資料失敗:", e);
  }
}

function saveAchievements() {
  try {
    localStorage.setItem(
      ACHIEVEMENTS_KEY,
      JSON.stringify(Array.from(achievements.entries()))
    );
  } catch (e) {
    console.error("儲存成就資料失敗:", e);
  }
}

function checkAchievements() {
  const stats = calculateUserStats();
  let newAchievements = [];

  Object.entries(ACHIEVEMENT_DEFINITIONS).forEach(([key, achievement]) => {
    if (!achievements.has(key) && achievement.condition(stats)) {
      achievements.set(key, {
        ...achievement,
        unlockedAt: new Date().toISOString(),
        id: key,
      });
      newAchievements.push(achievement);
    }
  });

  if (newAchievements.length > 0) {
    saveAchievements();
    showAchievementNotification(newAchievements);
  }
}

function calculateUserStats() {
  const now = new Date();
  const today = toLocalDateStr(now);
  const filledArray = Array.from(filledDates.values());

  // 計算各種統計數據
  const stats = {
    totalFilled: filledDates.size,
    totalAnnoyance: filledArray.reduce(
      (sum, data) => sum + (data.annoyanceIndex || 0),
      0
    ),
    consecutiveDays: calculateConsecutiveDays(),
    consecutiveMoney: calculateConsecutiveMood("money"),
    dailyBurnout: calculateDailyMoodCount("burnout", today),
    speedFills: parseInt(localStorage.getItem("speedFills") || "0"),
    weekendStreak: calculateWeekendStreak(),
    midnightFills: parseInt(localStorage.getItem("midnightFills") || "0"),
    rainbowDay: checkRainbowDay(today),
  };

  return stats;
}

function calculateConsecutiveDays() {
  const dates = Array.from(filledDates.keys())
    .map((key) => new Date(filledDates.get(key).date))
    .sort((a, b) => b - a);

  if (dates.length === 0) return 0;

  let consecutive = 1;
  for (let i = 1; i < dates.length; i++) {
    const diffDays = Math.abs(dates[i - 1] - dates[i]) / (1000 * 60 * 60 * 24);
    if (diffDays <= 1) {
      consecutive++;
    } else {
      break;
    }
  }
  return consecutive;
}

function calculateConsecutiveMood(mood) {
  const today = new Date();
  let consecutive = 0;

  for (let i = 0; i < 30; i++) {
    const checkDate = new Date(today);
    checkDate.setDate(today.getDate() - i);
    const dateStr = toLocalDateStr(checkDate);

    let hasMood = false;
    filledDates.forEach((data, key) => {
      if (data.date === dateStr && data.mood === mood) {
        hasMood = true;
      }
    });

    if (hasMood) {
      consecutive++;
    } else {
      break;
    }
  }
  return consecutive;
}

function calculateDailyMoodCount(mood, date) {
  let count = 0;
  filledDates.forEach((data, key) => {
    if (data.date === date && data.mood === mood) {
      count++;
    }
  });
  return count;
}

function calculateWeekendStreak() {
  const weekends = [];
  const now = new Date();

  for (let i = 0; i < 52; i++) {
    const checkDate = new Date(now);
    checkDate.setDate(now.getDate() - i * 7);

    // 找到週末 (週六和週日)
    const saturday = new Date(checkDate);
    saturday.setDate(checkDate.getDate() - checkDate.getDay() + 6);
    const sunday = new Date(saturday);
    sunday.setDate(saturday.getDate() + 1);

    const satStr = toLocalDateStr(saturday);
    const sunStr = toLocalDateStr(sunday);

    let hasWeekendFill = false;
    filledDates.forEach((data, key) => {
      if (data.date === satStr || data.date === sunStr) {
        hasWeekendFill = true;
      }
    });

    if (hasWeekendFill) {
      weekends.push(i);
    } else {
      break;
    }
  }

  return weekends.length;
}

function checkRainbowDay(date) {
  const moods = new Set();
  filledDates.forEach((data, key) => {
    if (data.date === date) {
      moods.add(data.mood);
    }
  });
  return moods.size >= 6; // 需要包含所有6種心情：money, burnout, annoying, stuck, bad, bullying
}

function showAchievementNotification(achievements) {
  achievements.forEach((achievement, index) => {
    setTimeout(() => {
      createAchievementPopup(achievement);
      playAchievementAnimation(achievement.animation);
      playAchievementSound(achievement.rarity);
    }, index * 1000);
  });
}

function createAchievementPopup(achievement) {
  const popup = document.createElement("div");
  popup.className = `achievement-popup fixed top-4 right-4 z-50 bg-gradient-to-r from-purple-600 to-pink-600 text-white p-4 rounded-lg shadow-lg max-w-sm animate-slide-in-right`;

  const rarityColors = {
    common: "from-gray-500 to-gray-600",
    uncommon: "from-green-500 to-green-600",
    rare: "from-blue-500 to-blue-600",
    epic: "from-purple-500 to-purple-600",
    legendary: "from-yellow-500 to-yellow-600",
  };

  popup.className = popup.className.replace(
    "from-purple-600 to-pink-600",
    rarityColors[achievement.rarity]
  );

  popup.innerHTML = `
    <div class="flex items-center space-x-3">
      <div class="text-3xl animate-bounce">${achievement.icon}</div>
      <div>
        <div class="font-bold text-lg">🎉 成就解鎖！</div>
        <div class="font-semibold">${achievement.name}</div>
        <div class="text-sm opacity-90">${achievement.description}</div>
        <div class="text-xs opacity-75 mt-1">${
          achievement.category
        } • ${achievement.rarity.toUpperCase()}</div>
      </div>
    </div>
  `;

  document.body.appendChild(popup);

  setTimeout(() => {
    popup.classList.add("animate-fade-out");
    setTimeout(() => {
      document.body.removeChild(popup);
    }, 500);
  }, 5000);
}

function playAchievementAnimation(animationType) {
  switch (animationType) {
    case "sparkle":
      createSparkleEffect();
      break;
    case "goldShimmer":
      createGoldShimmerEffect();
      break;
    case "fireEffect":
      createFireEffect();
      break;
    case "lightningStrike":
      createLightningEffect();
      break;
    case "rainbowFlow":
      createRainbowEffect();
      break;
    case "freedomBurst":
      createFreedomBurst();
      break;
    default:
      createSparkleEffect();
  }
}

function playAchievementSound(rarity) {
  // 使用 Web Audio API 生成音效
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  const frequencies = {
    common: [261.63, 329.63],
    uncommon: [261.63, 329.63, 392.0],
    rare: [261.63, 329.63, 392.0, 523.25],
    epic: [261.63, 329.63, 392.0, 523.25, 659.25],
    legendary: [261.63, 329.63, 392.0, 523.25, 659.25, 783.99],
  };

  frequencies[rarity].forEach((freq, index) => {
    setTimeout(() => {
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.setValueAtTime(freq, audioContext.currentTime);
      oscillator.type = "sine";

      gainNode.gain.setValueAtTime(0, audioContext.currentTime);
      gainNode.gain.linearRampToValueAtTime(
        0.1,
        audioContext.currentTime + 0.01
      );
      gainNode.gain.exponentialRampToValueAtTime(
        0.001,
        audioContext.currentTime + 0.5
      );

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.5);
    }, index * 100);
  });
}

// --- UI 生成與互動 ---
function generateGrid() {
  const container = document.getElementById("gridContainer");
  container.innerHTML = "";
  for (let i = 0; i < TOTAL_CELLS; i++) {
    const cell = document.createElement("div");
    cell.className =
      "grid-cell aspect-square cursor-pointer flex items-center justify-center text-center relative";
    cell.dataset.index = i;
    if (filledDates.has(i)) fillCell(cell, filledDates.get(i));
    // Event listeners will be attached in setupEventListeners
    container.appendChild(cell);
  }
}

function setupEventListeners() {
  document
    .getElementById("gridContainer")
    .addEventListener("pointerdown", handlePointerDown);
  document
    .getElementById("gridContainer")
    .addEventListener("pointerup", handlePointerUp);
  document
    .getElementById("gridContainer")
    .addEventListener("pointerleave", cancelLongPress);
  document
    .getElementById("shareBtnTrigger")
    .addEventListener("click", () => openModal("shareModal"));
  document.getElementById("quoteDisplay").addEventListener("click", hideQuote);
}

function handlePointerDown(e) {
  if (!e.target.closest(".grid-cell")) return;
  const cell = e.target.closest(".grid-cell");
  const index = parseInt(cell.dataset.index, 10);
  isLongPress = false;
  currentCell = cell;
  cell.classList.add("long-pressing");
  // 添加視覺提示元素
  const ripple = document.createElement("div");
  ripple.className =
    "absolute inset-0 bg-primary-300 rounded-md opacity-0 scale-0 transition-all duration-800";
  ripple.style.transform = "scale(0)";
  ripple.style.opacity = "0";
  cell.appendChild(ripple);
  // 動畫效果
  setTimeout(() => {
    ripple.style.transform = "scale(0.8)";
    ripple.style.opacity = "0.3";
  }, 10);
  longPressTimer = setTimeout(() => {
    isLongPress = true;
    cell.classList.remove("long-pressing");
    // 長按完成後移除視覺提示
    if (ripple && ripple.parentNode) {
      ripple.style.transform = "scale(1)";
      ripple.style.opacity = "0";
      setTimeout(() => ripple.remove(), 300);
    }
    openEventModal(index);
    if (navigator.vibrate) navigator.vibrate(50);
  }, 800);
}

function handlePointerUp(e) {
  if (!currentCell) return;
  const cell = e.target.closest(".grid-cell");
  const index = parseInt(currentCell.dataset.index, 10);
  clearTimeout(longPressTimer);
  currentCell.classList.remove("long-pressing");
  // 移除所有視覺提示元素
  const ripples = currentCell.querySelectorAll(".bg-primary-300");
  ripples.forEach((r) => r.remove());
  // 添加點擊粒子效果
  createParticles(e.clientX, e.clientY);
  if (!isLongPress) handleQuickMark(index, currentCell);
  currentCell = null;
}

// 創建粒子效果
function createParticles(x, y) {
  const colors = ["#3da35d", "#eab308", "#ec4899", "#6366f1", "#ef4444"];
  const particlesCount = 15;
  for (let i = 0; i < particlesCount; i++) {
    const particle = document.createElement("div");
    particle.className = "particle";
    // 隨機大小
    const size = Math.floor(Math.random() * 8) + 4;
    particle.style.width = `${size}px`;
    particle.style.height = `${size}px`;
    // 隨機顏色
    particle.style.backgroundColor =
      colors[Math.floor(Math.random() * colors.length)];
    // 初始位置
    particle.style.left = `${x}px`;
    particle.style.top = `${y}px`;
    // 隨機方向和距離
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.random() * 80 + 20;
    const velocityX = Math.cos(angle) * distance;
    const velocityY = Math.sin(angle) * distance;
    // 設定動畫
    particle.style.transform = `translate(${velocityX}px, ${velocityY}px)`;
    document.body.appendChild(particle);
    // 移除粒子
    setTimeout(() => {
      if (particle.parentNode) {
        particle.parentNode.removeChild(particle);
      }
    }, 1000);
  }
}

function cancelLongPress() {
  clearTimeout(longPressTimer);
  if (currentCell) {
    currentCell.classList.remove("long-pressing");
    // 移除所有視覺提示元素
    const ripples = currentCell.querySelectorAll(".bg-primary-300");
    ripples.forEach((r) => r.remove());
  }
  currentCell = null;
}

function handleQuickMark(index, cell) {
  if (filledDates.has(index)) {
    clearCell(cell);
    filledDates.delete(index);
  } else {
    const today = new Date();
    const data = {
      date: toLocalDateStr(today),
      displayDate: `${today.getMonth() + 1}/${today.getDate()}`,
      mood: "bad",
      description: "",
      timestamp: today.toISOString(),
      fontStyle:
        handwriteFonts[Math.floor(Math.random() * handwriteFonts.length)],
      annoyanceIndex: 0,
    };
    fillCell(cell, data);
    filledDates.set(index, data);
    animateCell(cell);
    showRandomQuote();
    // 檢查是否集滿100點
    if (filledDates.size === TOTAL_CELLS) {
      setTimeout(() => createFireworks(), 500);
    }
	// ↓↓↓ 新增这一行（只在新增时同步） ↓↓↓
    saveMoodEvent(data);
  }
  saveData();
  updateAllStats();
}

function animateCell(cell) {
  cell.style.animation = "bounceIn 0.8s";
  setTimeout(() => (cell.style.animation = ""), 800);
  // 添加集點飛回效果
  const point = document.createElement("div");
  point.className =
    "absolute w-6 h-6 bg-primary-500 text-white rounded-full flex items-center justify-center";
  point.textContent = "+1";
  point.style.animation = "collectPoint 1s ease-out forwards";
  cell.appendChild(point);
  setTimeout(() => {
    if (point.parentNode) {
      point.parentNode.removeChild(point);
    }
  }, 1000);
}

function fillCell(cell, data) {
  cell.className =
    "grid-cell aspect-square cursor-pointer flex items-center justify-center text-center relative filled";
  if (data.mood !== "bad") cell.classList.add(`mood-${data.mood}`);
  cell.innerHTML = `<span class="date-text ${
    data.fontStyle ||
    handwriteFonts[Math.floor(Math.random() * handwriteFonts.length)]
  } text-xs sm:text-sm">${data.displayDate}</span>`;
}

function clearCell(cell) {
  cell.className =
    "grid-cell aspect-square cursor-pointer flex items-center justify-center text-center relative";
  cell.innerHTML = "";
}

// 煙火特效
function createFireworks() {
  const colors = [
    "#ff0000",
    "#00ff00",
    "#0000ff",
    "#ffff00",
    "#ff00ff",
    "#00ffff",
    "#ffffff",
  ];
  const fireworksCount = 5;
  for (let i = 0; i < fireworksCount; i++) {
    setTimeout(() => {
      const firework = document.createElement("div");
      firework.className = "firework";
      firework.style.backgroundColor =
        colors[Math.floor(Math.random() * colors.length)];
      firework.style.left = `${Math.random() * 80 + 10}%`;
      document.body.appendChild(firework);
      setTimeout(() => {
        const explosion = document.createElement("div");
        explosion.className = "explosion";
        explosion.style.top = firework.getBoundingClientRect().top + "px";
        explosion.style.left = firework.getBoundingClientRect().left + "px";
        document.body.appendChild(explosion);
        // 煙火粒子
        createFireworkParticles(
          explosion.getBoundingClientRect().left,
          explosion.getBoundingClientRect().top
        );
        setTimeout(() => {
          if (firework.parentNode) firework.parentNode.removeChild(firework);
          if (explosion.parentNode) explosion.parentNode.removeChild(explosion);
        }, 1500);
      }, 1000);
    }, i * 300);
  }
}

function createFireworkParticles(x, y) {
  const colors = [
    "#ff0000",
    "#ffa500",
    "#ffff00",
    "#00ff00",
    "#0000ff",
    "#4b0082",
    "#ee82ee",
  ];
  const particlesCount = 30;
  for (let i = 0; i < particlesCount; i++) {
    const particle = document.createElement("div");
    particle.className = "particle";
    // 隨機大小
    const size = Math.floor(Math.random() * 6) + 2;
    particle.style.width = `${size}px`;
    particle.style.height = `${size}px`;
    // 隨機顏色
    particle.style.backgroundColor =
      colors[Math.floor(Math.random() * colors.length)];
    // 初始位置
    particle.style.left = `${x}px`;
    particle.style.top = `${y}px`;
    // 隨機方向和距離
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.random() * 150 + 50;
    const velocityX = Math.cos(angle) * distance;
    const velocityY = Math.sin(angle) * distance;
    // 設定動畫
    particle.style.transform = `translate(${velocityX}px, ${velocityY}px)`;
    document.body.appendChild(particle);
    // 移除粒子
    setTimeout(() => {
      if (particle.parentNode) {
        particle.parentNode.removeChild(particle);
      }
    }, 1500);
  }
}

// --- 事件模態窗 ---
function openEventModal(index) {
  const modal = document.getElementById("eventModal");
  modal.dataset.currentIndex = index;
  const data = filledDates.get(index);
  document.getElementById("eventDate").value = data
    ? data.date
    : toLocalDateStr(new Date());
  document.getElementById("eventDescription").value = data
    ? data.description || ""
    : "";
  setMood(data ? data.mood : "bad");

  // 正確顯示模態窗：移除 hidden，添加 flex 和居中類
  modal.classList.remove("hidden");
  modal.classList.add("flex", "items-center", "justify-center");

  console.log("模態窗已打開，當前類:", modal.className);
}

function closeEventModal() {
  try {
    const modal = document.getElementById("eventModal");
    if (!modal) {
      console.warn("找不到事件模態窗");
      return;
    }

    console.log("關閉事件模態窗...");

    // 移除所有顯示相關的類並添加 hidden 類
    modal.classList.remove("flex", "items-center", "justify-center");
    modal.classList.add("hidden");

    console.log("事件模態窗已關閉");
  } catch (error) {
    console.error("關閉模態窗失敗:", error);
  }
}

function renderMoodIcons() {
  Object.keys(moodIcons).forEach(
    (mood) =>
      (document.getElementById(
        `moodIcon${mood.charAt(0).toUpperCase() + mood.slice(1)}`
      ).innerHTML = moodIcons[mood])
  );
  document
    .querySelectorAll(".mood-btn")
    .forEach((btn) => (btn.onclick = () => setMood(btn.dataset.mood)));
}

function setMood(mood) {
  document.querySelectorAll(".mood-btn").forEach((btn) => {
    const isSelected = btn.dataset.mood === mood;
    btn.classList.toggle("bg-gray-200", isSelected);
    btn.classList.toggle("border-2", isSelected);
    btn.classList.toggle("border-primary-500", isSelected);
    btn.dataset.selected = isSelected;
  });
}

function saveEvent() {
  // 防止重複執行
  if (isSavingEvent) {
    console.warn("儲存程序進行中，請稍候");
    return;
  }

  isSavingEvent = true;

  try {
    console.log("開始儲存事件...");

    // 確保應用程式已初始化
    if (!isInitialized) {
      initializeApplication();
    }

    // 基本驗證
    const modal = document.getElementById("eventModal");
    if (!modal) {
      throw new Error("找不到事件模態窗");
    }

    const index = parseInt(modal.dataset.currentIndex, 10);
    if (isNaN(index)) {
      throw new Error("無效的索引值");
    }

    // 確保必要變數存在
    if (!filledDates) {
      filledDates = new Map();
    }

    if (!handwriteFonts || !Array.isArray(handwriteFonts)) {
      handwriteFonts = [
        "font-handwrite-1",
        "font-handwrite-2",
        "font-handwrite-3",
        "font-handwrite-4",
        "font-handwrite-5",
        "font-handwrite-6",
      ];
    }

    // 心情驗證
    const selectedMood = document.querySelector(
      '.mood-btn[data-selected="true"]'
    );
    if (!selectedMood) {
      throw new Error("請選擇一種心情分類！");
    }

    // 建立事件資料
    const description = document
      .getElementById("eventDescription")
      .value.trim();
    const dateInput = document.getElementById("eventDate").value;
    const score = calculateAnnoyanceIndex(description);

    if (score > 0) {
      showAnnoyanceFeedback(score);
    }

    const eventData = {
      date: dateInput,
      displayDate: formatDisplayDate(dateInput),
      mood: selectedMood.dataset.mood,
      description: description,
      timestamp: new Date().toISOString(),
      fontStyle: getRandomFont(index),
      annoyanceIndex: score,
    };

    console.log("事件資料已建立:", eventData);

    // 安全的資料更新
    updateEventData(index, eventData);

    // 處理成就相關邏輯
    processAchievements();

    // 安全的介面更新
    updateUserInterface();

    // 關閉模態框
    closeEventModal();

    console.log("事件儲存完成");
  } catch (error) {
    console.error("儲存過程發生錯誤:", error);
    alert("儲存失敗：" + error.message);
  } finally {
    isSavingEvent = false;
  }
}

// --- 輔助函數 ---
function formatDisplayDate(dateInput) {
  try {
    const date = new Date(dateInput);
    return `${date.getMonth() + 1}/${date.getDate()}`;
  } catch (error) {
    console.error("日期格式化失敗:", error);
    return dateInput;
  }
}

function getRandomFont(index) {
  try {
    const existingFont = filledDates.get(index)?.fontStyle;
    if (existingFont) {
      return existingFont;
    }
    return handwriteFonts[Math.floor(Math.random() * handwriteFonts.length)];
  } catch (error) {
    console.error("字體選擇失敗:", error);
    return "font-handwrite-1";
  }
}

// --- 模組化的資料處理函數 ---
function updateEventData(index, eventData) {
  try {
    console.log("更新事件資料，索引:", index);

    // 更新記憶體中的資料
    filledDates.set(index, eventData);

    // 更新DOM元素
    const cellElement = document.querySelector(`[data-index="${index}"]`);
    if (cellElement) {
      fillCell(cellElement, eventData);
    }

    // 儲存至localStorage
    saveData();
	// ↓↓↓ 新增这一行（云同步） ↓↓↓
	saveMoodEvent(eventData);

    console.log("事件資料更新完成");
  } catch (error) {
    throw new Error("資料更新失敗: " + error.message);
  }
}

function processAchievements() {
  try {
    // 檢查速度填寫成就
    const currentTime = Date.now();
    const speedFillKey = "lastSpeedFills";
    let speedFills = JSON.parse(localStorage.getItem(speedFillKey) || "[]");
    speedFills = speedFills.filter((time) => currentTime - time < 10000); // 10秒內
    speedFills.push(currentTime);
    localStorage.setItem(speedFillKey, JSON.stringify(speedFills));
    localStorage.setItem("speedFills", speedFills.length.toString());

    // 檢查深夜填寫成就
    const now = new Date();
    if (now.getHours() >= 0 && now.getHours() < 6) {
      const midnightFills =
        parseInt(localStorage.getItem("midnightFills") || "0") + 1;
      localStorage.setItem("midnightFills", midnightFills.toString());
    }
  } catch (error) {
    console.warn("成就處理失敗:", error);
  }
}

function updateUserInterface() {
  // 分別處理不同的介面更新，避免連鎖反應
  try {
    updateAllStats();
  } catch (error) {
    console.warn("統計更新失敗:", error);
  }

  // 延遲執行成就檢查，避免循環調用
  setTimeout(() => {
    try {
      checkAchievements();
    } catch (error) {
      console.warn("成就檢查失敗:", error);
    }
  }, 50);
}

// --- 爛事標籤 & 压力指數 ---
function renderPresetButtons() {
  const container = document.getElementById("presetButtonsContainer");
  container.innerHTML = customPresets
    .map(
      (p) =>
        `<button class="bg-gray-100 text-gray-700 text-xs px-3 py-1.5 rounded-full" onclick="appendPreset('${p}')">${p}</button>`
    )
    .join("");
}

function appendPreset(text) {
  const textarea = document.getElementById("eventDescription");
  textarea.value += (textarea.value ? " " : "") + text;
  textarea.focus();
}

function addCustomPreset() {
  const input = document.getElementById("customPresetInput");
  const text = input.value.trim();
  if (text && !customPresets.includes(text)) {
    customPresets.push(text);
    saveData();
    renderPresetButtons();
  }
  input.value = "";
}

function calculateAnnoyanceIndex(text) {
  let score = 0;
  if (!text) return 0;
  const lowerCaseText = text.toLowerCase();
  annoyanceKeywords.forEach((value, key) => {
    const matches = lowerCaseText.match(new RegExp(key, "g")) || [];
    score += matches.length * value;
  });
  return score;
}

function showAnnoyanceFeedback(score) {
  const feedbackEl = document.getElementById("annoyanceFeedback");
  feedbackEl.textContent = `压力+${score}`;
  feedbackEl.classList.remove("hidden");
  setTimeout(() => feedbackEl.classList.add("hidden"), 1900);
}

// --- 統計 & 圖表 ---
function updateAllStats() {
  updateProgress();
  updateRecentRecords();
  updateChart();
  updateAnnoyanceStats();
}

function updateProgress() {
  const totalCount = filledDates.size;
  const moodCounts = {
    money: 0,
    burnout: 0,
    annoying: 0,
    stuck: 0,
    bad: 0,
    bullying: 0,
  };

  Array.from(filledDates.values()).forEach((d) => {
    if (moodCounts.hasOwnProperty(d.mood)) {
      moodCounts[d.mood]++;
    }
  });

  const percentage = (totalCount / TOTAL_CELLS) * 100;

  // 更新基本統計
  document.getElementById("filledCount").textContent = totalCount;
  document.getElementById("completionRate").textContent = `${percentage.toFixed(
    1
  )}%`;

  // 更新六種心情的統計
  document.getElementById("moneyMoodCount").textContent = moodCounts.money;
  document.getElementById("burnoutMoodCount").textContent = moodCounts.burnout;
  document.getElementById("annoyingMoodCount").textContent =
    moodCounts.annoying;
  document.getElementById("stuckMoodCount").textContent = moodCounts.stuck;
  document.getElementById("badMoodCount").textContent = moodCounts.bad;
  document.getElementById("bullyingMoodCount").textContent =
    moodCounts.bullying;

  document.getElementById("progressCircle").style.strokeDasharray = `${
    percentage * 3.39292
  } 339.292`;

  const pText = document.getElementById("progressText");
  pText.textContent =
    totalCount === TOTAL_CELLS
      ? "🎉 恭喜集滿！準備離職！"
      : `還差 ${TOTAL_CELLS - totalCount} 格就自由了！`;
}

function updateRecentRecords() {
  const container = document.getElementById("recentRecords");
  const records = Array.from(filledDates.values())
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, 5);

  if (records.length === 0) {
    container.innerHTML = `
      <p class="text-neutral-500 text-center py-8">
        <i class="fas fa-inbox text-3xl mb-2 block"></i>
        尚無記錄
      </p>
    `;
    return;
  }

  // 使用正確的心情圖標映射
  const getMoodIcon = (mood) => {
    return moodIcons[mood] || '<i class="fas fa-circle text-gray-400"></i>';
  };

  // 心情名稱映射
  const getMoodName = (mood) => {
    const moodNames = {
      money: "画饼大师",
      burnout: "精力透支",
      annoying: "甩锅现场",
      stuck: "原地踏步",
      bad: "心态崩了",
      bullying: "职场霸凌",
    };
    return moodNames[mood] || "未知心情";
  };

  // 獲取压力分數顏色
  const getScoreColor = (score) => {
    if (score >= 8) return "bg-red-100 text-red-700";
    if (score >= 5) return "bg-orange-100 text-orange-700";
    if (score >= 3) return "bg-yellow-100 text-yellow-700";
    return "bg-green-100 text-green-700";
  };

  container.innerHTML = records
    .map((r, index) => {
      const recordIndex = Array.from(filledDates.entries()).find(
        ([key, value]) => value === r
      )?.[0];
      return `
        <div class="record-item flex items-start gap-3 p-3 bg-white/50 rounded-xl hover:bg-white/70 transition-colors group relative">
          <div class="text-2xl pt-1 flex-shrink-0">
            ${getMoodIcon(r.mood)}
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-start justify-between gap-2 mb-1">
              <h4 class="text-sm font-medium text-neutral-700">${getMoodName(
                r.mood
              )}</h4>
              <button 
                class="record-edit-btn" 
                onclick="editRecord(${recordIndex})"
                title="編輯記錄"
                aria-label="編輯記錄"
              >
                <i class="fas fa-edit"></i>
              </button>
            </div>
            <div class="record-content text-sm text-neutral-600 leading-relaxed mb-2">
              ${r.description || "快速標記"}
            </div>
            <div class="flex items-center justify-between">
              <p class="text-xs text-neutral-400">
                ${new Date(r.timestamp).toLocaleDateString("zh-TW")}
              </p>
              <span class="record-score ${getScoreColor(
                r.annoyanceIndex || 0
              )}">
                ${r.annoyanceIndex || 0} 分
              </span>
            </div>
          </div>
        </div>
      `;
    })
    .join("");
}

function updateAnnoyanceStats() {
  // ========== 手册公式：压力指数 = (当前点数 / 100) * 80 + 近3天增量 * 4 ==========
  const currentPoints = filledDates.size; // 当前点数（已填格子数）

  // 计算近 3 天增量
  const now = new Date();
  const threeDaysAgo = new Date(now);
  threeDaysAgo.setDate(now.getDate() - 3);
  const threeDaysAgoStr = toLocalDateStr(threeDaysAgo);

  let recentIncrement = 0;
  filledDates.forEach((d) => {
    if (d.date && d.date >= threeDaysAgoStr) {
      recentIncrement += 1; // 每条近 3 天记录算 1 点增量
    }
  });

  // 手册公式
  let disgustIndex = (currentPoints / 100) * 80 + recentIncrement * 4;
  // 限制在 0–100，避免超出
  disgustIndex = Math.min(100, Math.max(0, Number(disgustIndex.toFixed(1))));

  // 关键词统计（仍用于「主要压力来源」和关键词云，不参与总指数）
  const counts = new Map();
  const allWords = new Map();
  filledDates.forEach((d) => {
    if (d.description) {
      const words = d.description.toLowerCase().split(/\s+/);
      words.forEach((word) => {
        if (word.length >= 2) {
          allWords.set(word, (allWords.get(word) || 0) + 1);
          if (annoyanceKeywords.has(word)) {
            counts.set(word, (counts.get(word) || 0) + 1);
          }
        }
      });
      Array.from(annoyanceKeywords.keys()).forEach((keyword) => {
        if (
          keyword.includes(" ") &&
          d.description.toLowerCase().includes(keyword)
        ) {
          counts.set(keyword, (counts.get(keyword) || 0) + 1);
        }
      });
    }
  });

  // 更新页面显示
  const totalEl = document.getElementById("annoyanceIndexTotal");
  if (totalEl) totalEl.textContent = disgustIndex;

  const levelEl = document.getElementById("annoyanceLevel");
  if (levelEl) {
    levelEl.textContent =
      disgustIndex >= 80
        ? "高压预警"
        : disgustIndex >= 60
        ? "偏高压力"
        : disgustIndex >= 40
        ? "中度压力"
        : disgustIndex >= 20
        ? "轻度压力"
        : "内心毫无波澜";
  }

  // 更新压力来源列表
  const topKeywords = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const keywordsContainer = document.getElementById("topAnnoyanceKeywords");
  if (keywordsContainer) {
    if (topKeywords.length > 0) {
      keywordsContainer.innerHTML = topKeywords
        .map(
          ([k, c]) => `<li class="flex justify-between items-center py-1">
              <span class="text-neutral-700">${k}</span>
              <span class="text-sm text-neutral-500">${c} 次</span>
            </li>`
        )
        .join("");
    } else {
      keywordsContainer.innerHTML =
        '<li class="text-neutral-400 text-sm">尚无足够数据</li>';
    }
  }

  // 可选：把关键词云相关逻辑保留（若页面有对应容器）
  // 原有 allWords 逻辑可按需继续使用
  generateKeywordCloud(allWords);
}

/* function updateAnnoyanceStats() {
  let total = 0;
  const counts = new Map();
  const allWords = new Map(); // 用於關鍵字雲
  filledDates.forEach((d) => {
    total += d.annoyanceIndex || 0;
    if (d.description) {
      // 分析每個字詞是否在厭世關鍵字庫中
      const words = d.description.toLowerCase().split(/\s+/);
      words.forEach((word) => {
        if (word.length >= 2) {
          // 忽略單字符
          // 更新所有字詞頻率 (關鍵字雲用)
          allWords.set(word, (allWords.get(word) || 0) + 1);
          // 更新厭世關鍵字頻率
          if (annoyanceKeywords.has(word)) {
            counts.set(word, (counts.get(word) || 0) + 1);
          }
        }
      });
      // 分析多字詞關鍵字
      Array.from(annoyanceKeywords.keys()).forEach((keyword) => {
        if (
          keyword.includes(" ") &&
          d.description.toLowerCase().includes(keyword)
        ) {
          counts.set(keyword, (counts.get(keyword) || 0) + 1);
        }
      });
    }
  });
  document.getElementById("annoyanceIndexTotal").textContent = total;
  document.getElementById("annoyanceLevel").textContent =
    total > 200
      ? "地獄級厭世"
      : total > 100
      ? "重度厭世"
      : total > 50
      ? "中度厭世"
      : "輕度厭世";
  // 更新厭世來源列表
  const topKeywords = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const keywordsContainer = document.getElementById("topAnnoyanceKeywords");
  if (topKeywords.length > 0) {
    keywordsContainer.innerHTML = topKeywords
      .map(
        ([k, c]) => `<li class="flex justify-between items-center py-1">
              <span class="text-neutral-700">${k}</span>
              <span class="bg-red-100 text-red-700 px-2 py-0.5 rounded-full text-xs font-medium">${c}次</span>
            </li>`
      )
      .join("");
  } else {
    keywordsContainer.innerHTML = `<li>尚無數據</li>`;
  }
  // 生成關鍵字雲
  generateKeywordCloud(allWords);
} */

// 生成關鍵字雲
function generateKeywordCloud(wordMap) {
  const cloudContainer = document.getElementById("keywordCloud");
  // 如果沒有足夠的字詞，顯示提示訊息
  if (wordMap.size < 5) {
    cloudContainer.innerHTML =
      '<p class="text-neutral-500 text-center">尚無足夠數據生成關鍵字雲</p>';
    return;
  }
  // 排序字詞並取前 30 個最常出現的
  const sortedWords = Array.from(wordMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30);
  // 找出最大和最小頻率，用於計算字體大小
  const maxFreq = sortedWords[0][1];
  const minFreq = sortedWords[sortedWords.length - 1][1];
  // 生成關鍵字雲 HTML
  cloudContainer.innerHTML = sortedWords
    .map(([word, freq]) => {
      // 計算字體大小 (範圍從 12px 到 32px)
      const fontSize = 12 + ((freq - minFreq) / (maxFreq - minFreq || 1)) * 20;
      // 隨機顏色
      const colors = [
        "text-red-500",
        "text-blue-500",
        "text-green-500",
        "text-yellow-600",
        "text-purple-500",
        "text-pink-500",
        "text-indigo-500",
        "text-orange-500",
        "text-teal-500",
      ];
      const color = colors[Math.floor(Math.random() * colors.length)];
      // 隨機旋轉
      const rotation =
        Math.random() > 0.5
          ? `rotate-${Math.floor(Math.random() * 6) - 3}`
          : "";
      return `<span class="inline-block m-1 ${color} ${rotation}" style="font-size: ${fontSize}px; font-weight: ${
        300 + Math.floor((freq / maxFreq) * 400)
      };">${word}</span>`;
    })
    .join(" ");
}

function initChart() {
  const ctx = document.getElementById("dailyChart")?.getContext("2d");
  if (!ctx || typeof Chart === "undefined") {
    console.warn("Chart.js unavailable");
    return;
  }

  // 如果圖表已存在，先銷毀它
  if (dailyChart) {
    dailyChart.destroy();
    dailyChart = null;
  }

  dailyChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: [],
      datasets: [
        {
          label: "画饼大师",
          borderColor: moodColors.money.border,
          backgroundColor: moodColors.money.bg,
          fill: true,
          tension: 0.4,
        },
        {
          label: "精力透支",
          borderColor: moodColors.burnout.border,
          backgroundColor: moodColors.burnout.bg,
          fill: true,
          tension: 0.4,
        },
        {
          label: "甩锅现场",
          borderColor: moodColors.annoying.border,
          backgroundColor: moodColors.annoying.bg,
          fill: true,
          tension: 0.4,
        },
        {
          label: "原地踏步",
          borderColor: moodColors.stuck.border,
          backgroundColor: moodColors.stuck.bg,
          fill: true,
          tension: 0.4,
        },
        {
          label: "心态崩了",
          borderColor: moodColors.bad.border,
          backgroundColor: moodColors.bad.bg,
          fill: true,
          tension: 0.4,
        },
        {
          label: "职场霸凌",
          borderColor: moodColors.bullying.border,
          backgroundColor: moodColors.bullying.bg,
          fill: true,
          tension: 0.4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          ticks: { stepSize: 1 },
          title: {
            display: true,
            text: "心情次數",
          },
        },
        x: {
          title: {
            display: true,
            text: "日期",
          },
        },
      },
      plugins: {
        legend: {
          display: true,
          position: "top",
          labels: {
            usePointStyle: true,
            pointStyle: "circle",
          },
        },
        tooltip: {
          callbacks: {
            label: function (context) {
              return `${context.dataset.label}: ${context.parsed.y} 次`;
            },
          },
        },
      },
      interaction: {
        intersect: false,
        mode: "index",
      },
    },
  });
  updateChart(); // Initial paint
}

function updateChart() {
  if (!dailyChart) return;
  const labels = [];
  const moneyData = [];
  const burnoutData = [];
  const annoyingData = [];
  const stuckData = [];
  const badData = [];
  const bullyingData = [];

  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const ds = toLocalDateStr(d);
    labels.push(`${d.getMonth() + 1}/${d.getDate()}`);

    let money = 0,
      burnout = 0,
      annoying = 0,
      stuck = 0,
      bad = 0,
      bullying = 0;

    filledDates.forEach((data) => {
      if (data.date === ds) {
        switch (data.mood) {
          case "money":
            money++;
            break;
          case "burnout":
            burnout++;
            break;
          case "annoying":
            annoying++;
            break;
          case "stuck":
            stuck++;
            break;
          case "bad":
            bad++;
            break;
          case "bullying":
            bullying++;
            break;
        }
      }
    });

    moneyData.push(money);
    burnoutData.push(burnout);
    annoyingData.push(annoying);
    stuckData.push(stuck);
    badData.push(bad);
    bullyingData.push(bullying);
  }

  dailyChart.data.labels = labels;
  dailyChart.data.datasets[0].data = moneyData;
  dailyChart.data.datasets[1].data = burnoutData;
  dailyChart.data.datasets[2].data = annoyingData;
  dailyChart.data.datasets[3].data = stuckData;
  dailyChart.data.datasets[4].data = badData;
  dailyChart.data.datasets[5].data = bullyingData;
  dailyChart.update();
}

function scheduleDailyUpdate() {
  const now = new Date();
  const tomorrow = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1
  );
  setTimeout(() => {
    updateChart();
    scheduleDailyUpdate();
  }, tomorrow - now + 1000);
}

// --- 模態窗 & 提示 ---
function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    // 檢查是否是AI Export Modal，它使用不同的顯示方式
    if (modalId === "aiExportModal") {
      modal.classList.remove("hidden");
      modal.classList.add("flex");
    } else {
      modal.classList.add("show");
      // 移除 aria-hidden 以符合無障礙標準
      modal.removeAttribute("aria-hidden");
    }
  }
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    // 檢查是否是AI Export Modal，它使用不同的隱藏方式
    if (modalId === "aiExportModal") {
      modal.classList.remove("flex");
      modal.classList.add("hidden");
    } else {
      modal.classList.remove("show");
      // 重新設置 aria-hidden 以符合無障礙標準
      modal.setAttribute("aria-hidden", "true");
    }
  }
}

function showRandomQuote() {
  const qd = document.getElementById("quoteDisplay");
  const quotes = [
    // 35 社畜压力語錄 from Look Pretty 美日誌 (社畜压力語錄35選)
    "小孩子才做選擇，成年人根本別無選擇。",
    "上班前的我只是經濟有問題，上班後的我連精神都出問題。",
    "18歲的你心情不好可以翹課，25歲的你就算再難過也得七點起床上班。",
    "不是所有久別重逢都是開心的，例如放完連假後的第一天上班。",
    "我最大的不足就是餘額不足。",
    "一個人最完美的狀態，就是他在填求職表的時候。",
    "選擇比努力更重要，所以我選擇不努力。",
    "如果你覺得自己累得跟狗一樣，那你真的是誤會了，因為狗都沒你這麼累。",
    "上班打卡制，下班責任制，人生好内耗。",
    "準時下班需要的不是努力，是勇氣。",
    "凡事別想得太多，上班已經夠累了。",
    "職場唯一的真相：人不是被炒，而是累死。",
    "夢想被現實碾成了粉末。",
    "我的靈魂被桌子鎖住了。",
    "勞動不是榮耀，而是無盡的疲憊。",
    "每次被老闆罵完都很想去動物園。",
    "我上班領的不是薪水，是精神賠償金。",
    "我最大的抗壓適應能力，是以不變的薪水應萬變的物價。",
    "假期結束那一刻，我的靈魂都出竅了。",
    "辦公室就是另一個牢籠。",
    "領薪隔天就要還債。",
    "老闆一句話能讓我笑，也能讓我哭。",
    "人生苦短，別浪費在不喜歡的地方。",
    "我想辭職，但我還要生活。",
    "努力工作，只為證明我也配不上高薪。",
    "好好的離職是一種道德。",
    "辭職不難，可誰付房租？",
    "想逃離，卻發現我住在工位上。",
    "工作像無底洞，怎麼填也填不滿。",
    "上班是一場長達十小時的煉獄。",
    "世界上最短的距離，就是假期開始到結束。",
    "付款不是問題，問題是老闆不給加薪。",
    "我真的很想辭職，可是哪裡能找到更好的？」",
    // 15 額外語錄 from 聯合新聞網 (15句職場压力語錄)
    "工作時別跟我談夢想，我的夢想就是不工作。",
    "不要相信壓力會轉化為動力，你的壓力只會轉化為病歷。",
    "成人的世界，除了長胖，其他都不容易。",
    "大家總說要跨出舒適圈，但我連跨都沒跨進去過。",
    "我想打起精神來，卻不小心把它打死了。",
    "賺錢是一種能力，花錢是一種技術，我能力有限，卻技術高超。",
    "我的錢包就像顆洋蔥，每當打開它，我就會想哭。",
    "既然正義都會遲到，為什麼上班不行？",
    "既然地球都繞著太陽轉，為什麼我得繞著老闆轉？",
    "如果辭職能換回自由，我願意馬上轉身。",
    "最美的離別，不言歸期。",
    "辛苦半天，卻看不到明天。",
    "拼搏換來的是更多的打拼。",
    "夢想是用來辭職的藉口。",
    "職場沒有公正，只有利益。",
  ];

  // 檢查是否有其他模態窗或彈窗正在顯示
  const activeModals = document.querySelectorAll(
    ".modal-backdrop:not(.hidden)"
  );
  if (activeModals.length > 0) {
    return; // 如果有其他彈窗，不顯示引言
  }

  document.getElementById("quoteText").textContent =
    quotes[Math.floor(Math.random() * quotes.length)];
  qd.classList.remove("hidden");
  qd.classList.add("show");
  clearTimeout(quoteTimer);

  // 縮短顯示時間避免干擾用戶操作
  quoteTimer = setTimeout(hideQuote, 6000); // 從10秒縮短到6秒
}

function hideQuote() {
  const qd = document.getElementById("quoteDisplay");
  qd.classList.add("hidden");
  qd.classList.remove("show");
}

function showClearConfirm() {
  if (filledDates.size > 0) openModal("confirmModal");
}

function confirmClearAll() {
  filledDates.clear();
  saveData();
  generateGrid();
  updateAllStats();
  closeModal("confirmModal");
}

// --- AI & 分享功能 ---
function getShareText() {
  const count = filledDates.size;
  const totalAnnoy = Array.from(filledDates.values()).reduce(
    (s, d) => s + (d.annoyanceIndex || 0),
    0
  );
  if (count === 0)
    return `我開始用「離職集點卡」記錄我的社畜人生了，一起來吧！ 压力指數 ${totalAnnoy}`;
  if (count >= TOTAL_CELLS)
    return `我集滿 ${TOTAL_CELLS} 點離職點數了！我自由啦！压力指數 ${totalAnnoy}，快來看看這個有趣的 App！`;
  return `我的「離職集點卡」進度 ${count}/${TOTAL_CELLS}！压力指數 ${totalAnnoy}，距離自由又更近一步了！你也來試試看吧！`;
}

function setupShareButtons() {
  const text = getShareText();
  const url =
    "https://www.threads.com/@azlife_1224/post/DK23VZSTI-8?xmt=AQF0pFJJeLeuO34ahomA7xvjtTcCy9dXpVknrK4avaMX8Q";
  const encodedText = encodeURIComponent(text + "\n" + url);
  const totalAnnoy = Array.from(filledDates.values()).reduce(
    (s, d) => s + (d.annoyanceIndex || 0),
    0
  );
  const display = document.getElementById("shareAnnoyanceIndex");
  if (display) display.textContent = `压力指數：${totalAnnoy}`;
  document.getElementById("copyLinkBtn").onclick = () =>
    copyToClipboard(text + "\n" + url, document.getElementById("copyLinkBtn"));
  document.getElementById("shareToThreadsBtn").onclick = () =>
    window.open(
      `https://www.threads.net/intent/post?text=${encodedText}`,
      "_blank"
    );
  document.getElementById("shareToTwitterBtn").onclick = () =>
    window.open(
      `https://twitter.com/intent/tweet?text=${encodedText}`,
      "_blank"
    );
  document.getElementById("shareToLineBtn").onclick = () =>
    window.open(
      `https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(
        url
      )}&text=${encodeURIComponent(text)}`,
      "_blank"
    );
}

document.getElementById("shareBtnTrigger").addEventListener("click", () => {
  setupShareButtons();
  openModal("shareModal");
});

async function copyToClipboard(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
    const original = btn.innerHTML;
    btn.innerHTML = "已複製！";
    setTimeout(() => (btn.innerHTML = original), 2000);
  } catch (err) {
    alert("複製失敗");
  }
}

function openAiExportModal() {
  // 更新統計數據
  updateAIExportStats();

  // 重置提示詞區域
  document.getElementById("aiPromptSection").classList.add("hidden");
  document.getElementById("ai-prompt-output").value = "";

  openModal("aiExportModal");
}

function updateAIExportStats() {
  const records = Array.from(filledDates.values());

  // 計算統計數據
  const totalRecords = records.length;
  const totalBurnout = records.reduce(
    (sum, record) => sum + (record.annoyanceIndex || 0),
    0
  );
  const averageBurnout =
    totalRecords > 0 ? (totalBurnout / totalRecords).toFixed(1) : 0;
  const maxBurnout = records.reduce(
    (max, record) => Math.max(max, record.annoyanceIndex || 0),
    0
  );

  // 更新顯示
  document.getElementById("totalRecordsCount").textContent = totalRecords;
  document.getElementById("totalBurnoutScore").textContent = totalBurnout;
  document.getElementById("averageBurnoutScore").textContent = averageBurnout;
  document.getElementById("maxBurnoutScore").textContent = maxBurnout;
}

function generateAIPrompt() {
  const data = {
    exportDate: new Date().toISOString(),
    records: Array.from(filledDates.values()),
  };

  const records = data.records;
  const totalRecords = records.length;
  const totalBurnout = records.reduce(
    (sum, record) => sum + (record.annoyanceIndex || 0),
    0
  );
  const averageBurnout =
    totalRecords > 0 ? (totalBurnout / totalRecords).toFixed(1) : 0;

  // 計算心情分布
  const moodDistribution = {
    money: 0,
    burnout: 0,
    annoying: 0,
    stuck: 0,
    bad: 0,
    bullying: 0,
  };

  records.forEach((record) => {
    if (record.mood && moodDistribution.hasOwnProperty(record.mood)) {
      moodDistribution[record.mood]++;
    }
  });

  // 獲取最近的記錄（最多10筆）
  const recentEntries = records
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 10)
    .map((record) => ({
      date: record.date,
      mood: getMoodDisplayName(record.mood),
      description: record.description || "無詳細描述",
      burnoutScore: record.annoyanceIndex || 0,
    }));

  const timeRange =
    records.length > 0
      ? {
          start: records.reduce(
            (min, r) => (r.date < min ? r.date : min),
            records[0].date
          ),
          end: records.reduce(
            (max, r) => (r.date > max ? r.date : max),
            records[0].date
          ),
        }
      : { start: "", end: "" };

  const jsonData = JSON.stringify(
    {
      exportDate: data.exportDate,
      totalEntries: totalRecords,
      totalBurnoutScore: totalBurnout,
      moodDistribution: {
        money: moodDistribution.money,
        burnout: moodDistribution.burnout,
        annoying: moodDistribution.annoying,
        stuck: moodDistribution.stuck,
        bad: moodDistribution.bad,
        bullying: moodDistribution.bullying,
      },
      recentEntries,
      timeRange,
    },
    null,
    2
  );

  const promptTemplate = `你是一位资深职业心理咨询师和职场教练。

以下是我通过「工人解压卡」记录的近期职场情绪数据，请据此进行专业分析。

## 数据摘要
- 导出时间：${data.exportDate}
- 总记录数：${totalRecords} 笔
- 总压力指数：${totalBurnout}
- 平均压力指数：${averageBurnout}
- 时间范围：${timeRange.start || "无"} 至 ${timeRange.end || "无"}
- 心情分布：
  - 画饼大师：${moodDistribution.money} 次
  - 精力透支：${moodDistribution.burnout} 次
  - 甩锅现场：${moodDistribution.annoying} 次
  - 原地踏步：${moodDistribution.stuck} 次
  - 心态崩了：${moodDistribution.bad} 次
  - 职场霸凌：${moodDistribution.bullying} 次

## 详细数据（JSON）
\`\`\`json
${jsonData}
\`\`\`

## 请按以下结构回复（保持专业、温和但直接，避免空洞鸡汤）：

1. **当前职业内耗评估**  
   用 1-10 分打分，并简要说明理由。

2. **主要压力源排序**  
   根据心情分布和近期记录，列出最需要优先处理的 3 个压力源。

3. **情绪模式与趋势**  
   简要分析是否有明显的情绪模式或时间趋势。

4. **离职参考指数**  
   给出 1-100 的离职参考指数，并说明主要依据。

5. **未来 30 天可落地行动建议**  
   提供 3 条具体、可执行的行动建议（每条建议要说清楚「做什么」和「预期效果」）。

请用中文回复。`;

  document.getElementById("ai-prompt-output").value = promptTemplate;
  document.getElementById(
    "promptCharCount"
  ).textContent = `${promptTemplate.length} 字符`;

  // 顯示提示詞區域
  document.getElementById("aiPromptSection").classList.remove("hidden");
}

/* function generateAIPrompt() {
  const data = {
    exportDate: new Date().toISOString(),
    records: Array.from(filledDates.values()),
  };

  const records = data.records;
  const totalRecords = records.length;
  const totalBurnout = records.reduce(
    (sum, record) => sum + (record.annoyanceIndex || 0),
    0
  );
  const averageBurnout =
    totalRecords > 0 ? (totalBurnout / totalRecords).toFixed(1) : 0;

  // 計算心情分布
  const moodDistribution = {
    money: 0,
    burnout: 0,
    annoying: 0,
    stuck: 0,
    bad: 0,
    bullying: 0,
  };

  records.forEach((record) => {
    if (record.mood && moodDistribution.hasOwnProperty(record.mood)) {
      moodDistribution[record.mood]++;
    }
  });

  // 獲取最近的記錄（最多10筆）
  const recentEntries = records
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 10)
    .map((record) => ({
      date: record.date,
      mood: getMoodDisplayName(record.mood),
      description: record.description || "無詳細描述",
      burnoutScore: record.annoyanceIndex || 0,
    }));

  const timeRange =
    records.length > 0
      ? {
          start: records.reduce(
            (min, r) => (r.date < min ? r.date : min),
            records[0].date
          ),
          end: records.reduce(
            (max, r) => (r.date > max ? r.date : max),
            records[0].date
          ),
        }
      : { start: "", end: "" };

  const jsonData = JSON.stringify(
    {
      exportDate: data.exportDate,
      totalEntries: totalRecords,
      totalBurnoutScore: totalBurnout,
      moodDistribution: {
        money: moodDistribution.money,
        burnout: moodDistribution.burnout,
        annoying: moodDistribution.annoying,
        stuck: moodDistribution.stuck,
        bad: moodDistribution.bad,
        bullying: moodDistribution.bullying,
      },
      recentEntries,
      timeRange,
    },
    null,
    2
  );

  const promptTemplate = `你是一位資深的職涯教練與心理諮詢師。請根據以下 JSON 格式的職場心情日誌，進行深入分析。

## 分析任務
請幫我分析我的職場心情日誌，並提供專業建議：

1. **情緒模式分析**：分析我的主要情緒模式和觸發因素
2. **壓力源識別**：根據压力指數和描述，找出最大壓力來源
3. **時間趨勢**：分析情緒是否有時間上的變化趨勢
4. **離職評估**：給出 1-100 的離職建議指數，並說明理由
5. **改善建議**：提供 3-5 個具體的工作環境改善或職涯規劃建議

## 數據摘要
- 總記錄數：${totalRecords} 筆
- 總压力指數：${totalBurnout}
- 平均压力指數：${averageBurnout}
- 心情分布：
  - 画饼大师：${moodDistribution.money} 次
  - 精力透支：${moodDistribution.burnout} 次  
  - 甩锅现场：${moodDistribution.annoying} 次
  - 原地踏步：${moodDistribution.stuck} 次
  - 心态崩了：${moodDistribution.bad} 次
  - 职场霸凌：${moodDistribution.bullying} 次

## 詳細數據
\`\`\`json
${jsonData}
\`\`\`

請以同理心且專業的口吻，提供深入且實用的分析建議。`;

  document.getElementById("ai-prompt-output").value = promptTemplate;
  document.getElementById(
    "promptCharCount"
  ).textContent = `${promptTemplate.length} 字符`;

  // 顯示提示詞區域
  document.getElementById("aiPromptSection").classList.remove("hidden");
} */

function getMoodDisplayName(mood) {
  const moodNames = {
    money: "画饼大师",
    burnout: "精力透支",
    annoying: "甩锅现场",
    stuck: "原地踏步",
    bad: "心态崩了",
    bullying: "职场霸凌",
  };
  return moodNames[mood] || mood;
}

function openAIService(service) {
  const urls = {
    chatgpt: "https://chat.openai.com/",
    claude: "https://claude.ai/",
    gemini: "https://gemini.google.com/",
    grok: "https://x.com/i/grok",
  };

  if (urls[service]) {
    // 複製提示詞到剪貼板
    copyAIPrompt();

    // 開啟AI服務
    window.open(urls[service], "_blank");
  }
}

function copyAIPrompt() {
  const textarea = document.getElementById("ai-prompt-output");
  const copyBtn = document.getElementById("copyAIPromptBtn");

  if (textarea.value) {
    navigator.clipboard
      .writeText(textarea.value)
      .then(() => {
        // 顯示複製成功提示
        const originalText = copyBtn.innerHTML;
        copyBtn.innerHTML = '<i class="fas fa-check"></i> 已複製';
        copyBtn.classList.remove(
          "bg-gray-100",
          "hover:bg-gray-200",
          "text-gray-900"
        );
        copyBtn.classList.add("bg-green-100", "text-green-800");

        setTimeout(() => {
          copyBtn.innerHTML = originalText;
          copyBtn.classList.remove("bg-green-100", "text-green-800");
          copyBtn.classList.add(
            "bg-gray-100",
            "hover:bg-gray-200",
            "text-gray-900"
          );
        }, 2000);
      })
      .catch((err) => {
        console.error("複製失敗:", err);
        // 備用方案：選中文字
        textarea.select();
        textarea.setSelectionRange(0, 99999);
        document.execCommand("copy");
      });
  }
}

document
  .getElementById("copyAIPromptBtn")
  .addEventListener("click", copyAIPrompt);

// --- 成就動畫效果 ---
function createSparkleEffect() {
  const colors = ["#FFD700", "#FFA500", "#FF69B4", "#00CED1", "#9370DB"];
  for (let i = 0; i < 20; i++) {
    setTimeout(() => {
      const sparkle = document.createElement("div");
      sparkle.className = "sparkle-particle fixed pointer-events-none z-50";
      sparkle.style.cssText = `
        width: 6px;
        height: 6px;
        background: ${colors[Math.floor(Math.random() * colors.length)]};
        border-radius: 50%;
        left: ${Math.random() * window.innerWidth}px;
        top: ${Math.random() * window.innerHeight}px;
        animation: sparkle-float 2s ease-out forwards;
      `;
      document.body.appendChild(sparkle);
      setTimeout(() => sparkle.remove(), 2000);
    }, i * 50);
  }
}

function createGoldShimmerEffect() {
  const shimmer = document.createElement("div");
  shimmer.className = "gold-shimmer fixed inset-0 pointer-events-none z-40";
  shimmer.style.cssText = `
    background: linear-gradient(45deg, transparent 30%, rgba(255, 215, 0, 0.4) 50%, transparent 70%);
    animation: gold-sweep 1.5s ease-out;
  `;
  document.body.appendChild(shimmer);
  setTimeout(() => shimmer.remove(), 1500);
}

function createFireEffect() {
  for (let i = 0; i < 15; i++) {
    setTimeout(() => {
      const flame = document.createElement("div");
      flame.className = "flame-particle fixed pointer-events-none z-50";
      flame.style.cssText = `
        width: 8px;
        height: 12px;
        background: radial-gradient(circle, #FF4500 0%, #FF6347 50%, #DC143C 100%);
        border-radius: 50% 50% 50% 50% / 60% 60% 40% 40%;
        left: ${Math.random() * window.innerWidth}px;
        top: ${window.innerHeight - 20}px;
        animation: fire-rise 2s ease-out forwards;
      `;
      document.body.appendChild(flame);
      setTimeout(() => flame.remove(), 2000);
    }, i * 100);
  }
}

function createLightningEffect() {
  const lightning = document.createElement("div");
  lightning.className =
    "lightning-effect fixed inset-0 pointer-events-none z-50";
  lightning.style.cssText = `
    background: linear-gradient(0deg, transparent 0%, #FFFF00 45%, #FFFFFF 50%, #FFFF00 55%, transparent 100%);
    opacity: 0;
    animation: lightning-flash 0.3s ease-in-out 3;
  `;
  document.body.appendChild(lightning);
  setTimeout(() => lightning.remove(), 1000);
}

function createRainbowEffect() {
  const rainbow = document.createElement("div");
  rainbow.className = "rainbow-effect fixed inset-0 pointer-events-none z-40";
  rainbow.style.cssText = `
    background: linear-gradient(45deg, 
      red 0%, orange 14%, yellow 28%, green 42%, 
      blue 57%, indigo 71%, violet 85%, red 100%);
    opacity: 0.6;
    animation: rainbow-wave 3s ease-in-out;
  `;
  document.body.appendChild(rainbow);
  setTimeout(() => rainbow.remove(), 3000);
}

function createFreedomBurst() {
  // 創建白鴿飛翔效果 - 增加數量和持續時間
  for (let i = 0; i < 15; i++) {
    setTimeout(() => {
      const dove = document.createElement("div");
      dove.className = "dove-particle fixed pointer-events-none z-50";
      dove.innerHTML = '<i class="fas fa-dove text-white text-3xl"></i>';
      dove.style.cssText = `
        left: ${20 + Math.random() * 60}%;
        top: ${20 + Math.random() * 60}%;
        transform: translate(-50%, -50%);
        animation: dove-fly-${i % 8} ${
        4 + Math.random() * 3
      }s ease-out forwards;
        filter: drop-shadow(0 0 12px rgba(255, 255, 255, 0.9));
      `;
      document.body.appendChild(dove);
      setTimeout(() => dove.remove(), 8000);
    }, i * 300);
  }

  // 創建自由文字效果
  const freedomText = document.createElement("div");
  freedomText.className =
    "freedom-text fixed inset-0 flex items-center justify-center pointer-events-none z-50";
  freedomText.innerHTML = `
    <div class="text-4xl sm:text-6xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-red-500 to-pink-500 animate-pulse text-center px-4">
      <i class="fas fa-party-horn mr-2"></i>恭喜自由啦！<i class="fas fa-party-horn ml-2"></i>
    </div>
  `;
  document.body.appendChild(freedomText);
  setTimeout(() => freedomText.remove(), 5000);

  // 創建20秒大型煙火慶祝效果
  createMegaFireworks();
}

function createMegaFireworks() {
  const colors = [
    "#ff6b6b",
    "#4ecdc4",
    "#45b7d1",
    "#96ceb4",
    "#feca57",
    "#ff9ff3",
    "#54a0ff",
    "#5f27cd",
    "#00d2d3",
    "#ff9f43",
    "#10ac84",
    "#ee5a24",
    "#0abde3",
    "#feca57",
    "#ff6348",
  ];

  let fireworkCount = 0;
  const maxFireworks = 100; // 20秒內發射100發煙火

  const fireworkInterval = setInterval(() => {
    if (fireworkCount >= maxFireworks) {
      clearInterval(fireworkInterval);
      return;
    }

    // 隨機位置發射煙火
    const x = Math.random() * window.innerWidth;
    const y =
      Math.random() * (window.innerHeight * 0.7) + window.innerHeight * 0.1;

    createMegaFireworkBurst(
      x,
      y,
      colors[Math.floor(Math.random() * colors.length)]
    );
    fireworkCount++;
  }, 200); // 每200ms發射一發

  // 20秒後停止
  setTimeout(() => {
    clearInterval(fireworkInterval);
  }, 20000);
}

function createMegaFireworkBurst(x, y, color) {
  const particleCount = 25 + Math.random() * 15; // 25-40個粒子

  for (let i = 0; i < particleCount; i++) {
    const particle = document.createElement("div");
    particle.className =
      "mega-firework-particle fixed pointer-events-none z-40";
    particle.style.cssText = `
      left: ${x}px;
      top: ${y}px;
      width: 6px;
      height: 6px;
      background: ${color};
      border-radius: 50%;
      box-shadow: 0 0 10px ${color}, 0 0 20px ${color}, 0 0 30px ${color};
    `;

    const angle = (Math.PI * 2 * i) / particleCount;
    const velocity = 100 + Math.random() * 100;
    const vx = Math.cos(angle) * velocity;
    const vy = Math.sin(angle) * velocity;

    particle.animate(
      [
        {
          transform: "translate(0, 0) scale(1)",
          opacity: 1,
        },
        {
          transform: `translate(${vx}px, ${vy + 200}px) scale(0)`,
          opacity: 0,
        },
      ],
      {
        duration: 1500 + Math.random() * 1000,
        easing: "cubic-bezier(0.25, 0.46, 0.45, 0.94)",
      }
    ).onfinish = () => particle.remove();

    document.body.appendChild(particle);
  }

  // 添加爆炸音效視覺反饋
  const flash = document.createElement("div");
  flash.className = "firework-flash fixed pointer-events-none z-39";
  flash.style.cssText = `
    left: ${x - 50}px;
    top: ${y - 50}px;
    width: 100px;
    height: 100px;
    background: radial-gradient(circle, ${color}88 0%, transparent 70%);
    border-radius: 50%;
  `;

  flash.animate(
    [
      { transform: "scale(0)", opacity: 1 },
      { transform: "scale(3)", opacity: 0 },
    ],
    {
      duration: 300,
      easing: "ease-out",
    }
  ).onfinish = () => flash.remove();

  document.body.appendChild(flash);
}

// --- 彩蛋功能 ---
function createEasterEgg() {
  const eggs = [
    {
      icon: '<i class="fas fa-egg text-orange-500"></i>',
      message: "社畜彩蛋：你找到了隱藏的蛋！",
      bgColor: "bg-orange-50",
      borderColor: "border-orange-200",
    },
    {
      icon: '<i class="fas fa-gift text-purple-500"></i>',
      message: "隱藏禮物：老闆今天心情好！",
      bgColor: "bg-purple-50",
      borderColor: "border-purple-200",
    },
    {
      icon: '<i class="fas fa-clover text-green-500"></i>',
      message: "幸運草：今天是個好日子！",
      bgColor: "bg-green-50",
      borderColor: "border-green-200",
    },
    {
      icon: '<i class="fas fa-gem text-blue-500"></i>',
      message: "鑽石時刻：你值得更好的！",
      bgColor: "bg-blue-50",
      borderColor: "border-blue-200",
    },
    {
      icon: '<i class="fas fa-star text-yellow-500"></i>',
      message: "閃亮時刻：相信自己！",
      bgColor: "bg-yellow-50",
      borderColor: "border-yellow-200",
    },
  ];

  const egg = eggs[Math.floor(Math.random() * eggs.length)];
  const easterEgg = document.createElement("div");
  easterEgg.className = `easter-egg fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 ${egg.bgColor} border-2 ${egg.borderColor} p-4 sm:p-6 rounded-xl shadow-lg animate-bounce max-w-xs sm:max-w-sm mx-4`;
  easterEgg.innerHTML = `
    <div class="text-center">
      <div class="text-4xl sm:text-6xl mb-4">${egg.icon}</div>
      <div class="text-base sm:text-lg font-bold text-gray-800 mb-3">${egg.message}</div>
      <button onclick="this.parentElement.parentElement.remove()" class="w-full px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors duration-200 font-medium">
        <i class="fas fa-check mr-2"></i>太棒了！
      </button>
    </div>
  `;
  document.body.appendChild(easterEgg);
}

// --- 隱藏彩蛋觸發 ---
let konamiCode = [];
const konamiSequence = [
  "ArrowUp",
  "ArrowUp",
  "ArrowDown",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowLeft",
  "ArrowRight",
  "KeyB",
  "KeyA",
];

document.addEventListener("keydown", (e) => {
  konamiCode.push(e.code);
  if (konamiCode.length > konamiSequence.length) {
    konamiCode.shift();
  }

  if (JSON.stringify(konamiCode) === JSON.stringify(konamiSequence)) {
    createEasterEgg();
    createFreedomBurst();
    konamiCode = [];
  }
});

// --- 成就檢查頻率控制 ---
let lastAchievementCheck = 0;
const originalCheckAchievements = checkAchievements;

// --- 成就顯示函數 ---
function renderAchievements() {
  const container = document.getElementById("achievementsContainer");
  const progressEl = document.getElementById("achievementProgress");

  if (!container || !progressEl) return;

  const totalAchievements = Object.keys(ACHIEVEMENT_DEFINITIONS).length;
  const unlockedCount = achievements.size;

  progressEl.textContent = `${unlockedCount}/${totalAchievements}`;

  container.innerHTML = Object.entries(ACHIEVEMENT_DEFINITIONS)
    .map(([key, achievement]) => {
      const isUnlocked = achievements.has(key);
      const rarityClass = {
        common: "border-gray-300",
        uncommon: "border-green-400",
        rare: "border-blue-400",
        epic: "border-purple-400",
        legendary: "border-yellow-400",
      }[achievement.rarity];

      return `
      <div class="achievement-item ${
        isUnlocked ? "unlocked" : "locked"
      } relative group">
        <div class="bg-white border-2 ${rarityClass} rounded-lg p-3 text-center transition-all duration-300 hover:scale-105 ${
        isUnlocked ? "" : "opacity-50 grayscale"
      }">
          <div class="text-xl sm:text-2xl mb-1">${achievement.icon}</div>
          <div class="text-xs font-semibold truncate">${achievement.name}</div>
          ${
            isUnlocked
              ? '<div class="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center"><i class="fas fa-check text-white text-xs"></i></div>'
              : ""
          }
        </div>
        <div class="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-black text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 whitespace-nowrap">
          <div class="font-semibold">${achievement.name}</div>
          <div class="text-gray-300">${achievement.description}</div>
          <div class="text-xs text-gray-400 mt-1">${
            achievement.category
          } • ${achievement.rarity.toUpperCase()}</div>
          ${
            isUnlocked
              ? `<div class="text-green-400 text-xs">✓ 已解鎖</div>`
              : `<div class="text-gray-400 text-xs">🔒 未解鎖</div>`
          }
        </div>
      </div>
    `;
    })
    .join("");
}

checkAchievements = function () {
  const now = Date.now();
  if (now - lastAchievementCheck > 1000) {
    // 1秒內只檢查一次
    lastAchievementCheck = now;
    const oldCount = achievements.size;

    try {
      originalCheckAchievements();
      if (achievements.size > oldCount) {
        // 延遲渲染成就，避免循環調用
        setTimeout(() => {
          try {
            renderAchievements();
          } catch (error) {
            console.warn("成就渲染失敗:", error);
          }
        }, 100);
      }
    } catch (error) {
      console.warn("成就檢查失敗:", error);
    }
  }
};

// --- 應用程式啟動 ---
document.addEventListener("DOMContentLoaded", function () {
  console.log("DOM 載入完成，開始初始化應用程式...");

  // 初始化應用程式
  initializeApplication();

  // 初始化 Service Worker（最高優先級）
  initServiceWorker();

  // 設置事件監聽器
  setupEventListeners();

  // 設置觸控優化
  setupTouchOptimization();

  // 生成網格
  generateGrid();

  // 渲染心情圖標
  renderMoodIcons();

  // 渲染預設按鈕
  renderPresetButtons();

  // 更新統計
  updateAllStats();

  // 渲染成就
  renderAchievements();

  // 初始化圖表
  initChart();

  // 設置分享按鈕
  setupShareButtons();

  // 檢查PWA提示
  checkAndShowPwaPrompt();

  // 安排每日更新
  scheduleDailyUpdate();

  // 設置編輯描述欄位的即時更新事件監聽器
  const editDescriptionField = document.getElementById("editEventDescription");
  if (editDescriptionField) {
    editDescriptionField.addEventListener("input", (e) => {
      updateEditAnnoyanceScore(e.target.value);
    });
  }

  console.log("應用程式初始化完成");
});

// --- 觸控滑動優化 ---
function setupTouchOptimization() {
  // 確保 touch 事件為 passive
  document.addEventListener(
    "touchstart",
    function (e) {
      // 不要 preventDefault，讓瀏覽器處理滑動
    },
    { passive: true }
  );

  document.addEventListener(
    "touchmove",
    function (e) {
      // 不要 preventDefault，讓瀏覽器處理滑動
    },
    { passive: true }
  );

  // 針對 iOS 的額外優化
  document.body.style.webkitOverflowScrolling = "touch";
  document.body.style.touchAction = "pan-y";
}

// --- 編輯記錄功能 ---
let currentEditingIndex = null;

function editRecord(index) {
  currentEditingIndex = index;
  const record = filledDates.get(index);

  if (!record) {
    console.error("找不到要編輯的記錄");
    return;
  }

  // 填入表單資料
  document.getElementById("editEventDate").value = record.date;
  document.getElementById("editEventDescription").value =
    record.description || "";

  // 更新压力分數顯示
  updateEditAnnoyanceScore(record.description || "");

  // 渲染編輯模態窗的心情圖標
  renderEditMoodIcons();

  // 設置選中的心情
  document.querySelectorAll(".edit-mood-btn").forEach((btn) => {
    const isSelected = btn.dataset.mood === record.mood;
    btn.classList.toggle("selected", isSelected);
  });

  // 開啟模態窗
  openModal("editRecordModal");
}

function renderEditMoodIcons() {
  Object.keys(moodIcons).forEach((mood) => {
    const iconContainer = document.querySelector(
      `[data-mood="${mood}"] .edit-mood-icon`
    );
    if (iconContainer) {
      iconContainer.innerHTML = moodIcons[mood];
    }
  });

  // 設置事件監聽器
  document.querySelectorAll(".edit-mood-btn").forEach((btn) => {
    btn.onclick = () => setEditMood(btn.dataset.mood);
  });
}

function setEditMood(mood) {
  document.querySelectorAll(".edit-mood-btn").forEach((btn) => {
    const isSelected = btn.dataset.mood === mood;
    btn.classList.toggle("selected", isSelected);
  });
}

function updateEditAnnoyanceScore(text) {
  const score = calculateAnnoyanceIndex(text);
  const scoreElement = document.getElementById("editAnnoyanceScore");
  if (scoreElement) {
    scoreElement.textContent = `${score} 分`;
    scoreElement.className = `record-score ${getEditScoreColor(score)}`;
  }
}

function getEditScoreColor(score) {
  if (score >= 8) return "bg-red-100 text-red-700";
  if (score >= 5) return "bg-orange-100 text-orange-700";
  if (score >= 3) return "bg-yellow-100 text-yellow-700";
  return "bg-green-100 text-green-700";
}

function saveEditedRecord() {
  if (currentEditingIndex === null) {
    console.error("沒有正在編輯的記錄");
    return;
  }

  try {
    // 獲取選中的心情
    const selectedMoodBtn = document.querySelector(".edit-mood-btn.selected");
    if (!selectedMoodBtn) {
      alert("請選擇一種心情分類！");
      return;
    }

    // 獲取表單資料
    const description = document
      .getElementById("editEventDescription")
      .value.trim();
    const score = calculateAnnoyanceIndex(description);

    // 獲取原始記錄
    const originalRecord = filledDates.get(currentEditingIndex);

    // 創建更新的記錄
    const updatedRecord = {
      ...originalRecord,
      mood: selectedMoodBtn.dataset.mood,
      description: description,
      annoyanceIndex: score,
      timestamp: new Date().toISOString(), // 更新編輯時間
    };

    // 更新記錄
    filledDates.set(currentEditingIndex, updatedRecord);

    // 更新對應的格子
    const cellElement = document.querySelector(
      `[data-index="${currentEditingIndex}"]`
    );
    if (cellElement) {
      fillCell(cellElement, updatedRecord);
    }
	// ↓↓↓ 新增这一行 ↓↓↓
	saveMoodEvent(updatedRecord);

    // 儲存資料
    saveData();

    // 更新所有統計資料
    updateAllStats();

    // 關閉模態窗
    closeModal("editRecordModal");
    currentEditingIndex = null;

    // 顯示成功訊息
    if (score > 0) {
      showAnnoyanceFeedback(score);
    }

    console.log("記錄編輯完成");
  } catch (error) {
    console.error("編輯記錄失敗:", error);
    alert("編輯失敗：" + error.message);
  }
}

// 云同步开关按钮
/* document.getElementById("cloudSyncBtn")?.addEventListener("click", () => {
  localStorage.setItem("user_token", "test-token-123");
  localStorage.setItem("user_id", "usr_test_001");
  window.USER_TOKEN = "test-token-123";
  window.USER_ID = "usr_test_001"; */
  
  // 更新按钮文字提示已开启
/*   const btn = document.getElementById("cloudSyncBtn");
  if (btn) {
    btn.textContent = "云同步已开启";
    btn.classList.remove("bg-green-600", "hover:bg-green-700");
    btn.classList.add("bg-gray-500");
    btn.disabled = true;
  }
  
  alert("✅ 云同步已开启！\n现在记录的事件会同步到后端。");
}); */

// ---------- 绑定事件（放在 DOMContentLoaded 里或文件末尾） ----------
document.getElementById("authOpenBtn")?.addEventListener("click", () => {
  if (window.USER_TOKEN) {
    if (confirm("已登录，是否退出？")) logout();
  } else {
    openAuthModal();
  }
});
document.getElementById("authModalClose")?.addEventListener("click", closeAuthModal);
document.getElementById("tabLogin")?.addEventListener("click", () => setAuthMode("login"));
document.getElementById("tabRegister")?.addEventListener("click", () => setAuthMode("register"));
document.getElementById("authSubmit")?.addEventListener("click", handleAuthSubmit);
 
// 页面加载时更新按钮状态；若已登录可静默拉取
updateAuthButton();
if (window.USER_TOKEN) {
  // 可选：静默同步
  // pullCloudEvents();
}
