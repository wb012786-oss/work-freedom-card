# 社畜解放卡 后端（阶段二）

基于 SQLite + Hono + Drizzle 的轻量后端，支持情绪记录云同步。

## 目录结构

```
backend/
├── package.json
├── tsconfig.json
├── drizzle.config.ts
├── .gitignore
├── src/
│   ├── index.ts          # 主服务入口
│   └── db/
│       └── schema.ts     # 数据库表结构
└── README.md
```

## 快速启动（Windows / macOS / Linux）

1. 解压后进入目录
```bash
cd backend
```

2. 安装依赖
```bash
npm install
```

3. 初始化数据库（会生成 data.db 文件）
```bash
npx drizzle-kit push
```

4. 启动开发服务
```bash
npm run dev
```

看到以下提示即表示成功：
```
🚀 社畜解放卡后端已启动：http://localhost:3001
```

## 测试接口

### 健康检查
```
GET http://localhost:3001/
```

### 提交情绪记录
```
POST http://localhost:3001/api/v1/mood/events
Header: Authorization: Bearer test-token-123
Content-Type: application/json

{
  "user_id": "usr_test_001",
  "category_code": "bullying",
  "score": 1,
  "note": "今天又被画饼"
}
```

### 获取统计
```
GET http://localhost:3001/api/v1/mood/stats?user_id=usr_test_001&days=14
Header: Authorization: Bearer test-token-123
```

## 测试 Token

当前使用固定测试 Token：`test-token-123`

正式环境请替换为 JWT 鉴权。

## 前端对接

在浏览器控制台执行：
```js
localStorage.setItem("user_token", "test-token-123");
localStorage.setItem("user_id", "usr_test_001");
```

然后在 script.js 中实现双模式保存（本地 + 云端同步）。

## 常见问题

### better-sqlite3 安装失败（Windows）
需要安装 windows-build-tools 或 Visual Studio Build Tools。
也可临时改用 sql.js（纯 JS 实现，无需编译）。

### 端口被占用
修改 src/index.ts 底部的 `port = 3001` 即可。
