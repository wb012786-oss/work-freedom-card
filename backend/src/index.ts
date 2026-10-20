import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { cors } from "hono/cors";
import { randomUUID, randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, "..", "data.json");

const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 天
const BCRYPT_ROUNDS = 10;

type TokenRecord = { userId: string; expiresAt: number };
type UserRecord = {
  id: string;
  email: string;
  nickname: string;
  passwordHash: string;
  createdAt: string;
  wechatOpenId: string | null;
};
type Store = {
  users: UserRecord[];
  events: any[];
  tokens: Record<string, TokenRecord>;
};

function loadData(): Store {
  const empty: Store = { users: [], events: [], tokens: {} };
  if (!fs.existsSync(DATA_FILE)) return empty;
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
    const tokens: Record<string, TokenRecord> = {};
    const rawTokens = parsed.tokens && typeof parsed.tokens === "object" ? parsed.tokens : {};
    for (const [token, value] of Object.entries(rawTokens)) {
      if (typeof value === "string") {
        tokens[token] = { userId: value, expiresAt: Date.now() + TOKEN_TTL_MS };
      } else if (value && typeof value === "object" && (value as any).userId) {
        tokens[token] = {
          userId: (value as any).userId,
          expiresAt: Number((value as any).expiresAt) || Date.now() + TOKEN_TTL_MS,
        };
      }
    }
    return {
      users: Array.isArray(parsed.users) ? parsed.users : [],
      events: Array.isArray(parsed.events) ? parsed.events : [],
      tokens,
    };
  } catch {
    return empty;
  }
}

function saveData(data: Store) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf-8");
}

function generateToken() {
  return "tok_" + randomBytes(24).toString("hex");
}

function issueToken(data: Store, userId: string) {
  const token = generateToken();
  data.tokens[token] = { userId, expiresAt: Date.now() + TOKEN_TTL_MS };
  return token;
}

function pruneExpired(data: Store) {
  const now = Date.now();
  for (const [token, rec] of Object.entries(data.tokens)) {
    if (!rec || rec.expiresAt < now) delete data.tokens[token];
  }
}

// 简易限流：同一 IP 每分钟最多 8 次注册/登录
const hits = new Map<string, number[]>();
function rateLimit(ip: string, limit = 8, windowMs = 60_000) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) return false;
  recent.push(now);
  hits.set(ip, recent);
  return true;
}

const app = new Hono<{ Variables: { userId: string; token: string } }>();

app.use(
  "*",
  cors({
    origin: ["http://localhost:8000", "http://127.0.0.1:8000", "http://localhost:3000", "https://你的前端域名.pages.dev", "https://你的前端域名.vercel.app"],
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  })
);

app.get("/", (c) =>
  c.json({ status: "ok", message: "打工人解压卡后端运行中", version: "2.1" })
);

app.use("/api/v1/mood/*", async (c, next) => {
  const auth = c.req.header("Authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) return c.json({ error: "未登录，请先注册/登录" }, 401);

  const data = loadData();
  pruneExpired(data);
  const rec = data.tokens[token];
  if (!rec || rec.expiresAt < Date.now()) {
    if (rec) {
      delete data.tokens[token];
      saveData(data);
    }
    return c.json({ error: "Token 无效或已过期，请重新登录" }, 401);
  }
  c.set("userId", rec.userId);
  c.set("token", token);
  await next();
});

app.post("/api/v1/auth/register", async (c) => {
  try {
    const ip = c.req.header("x-forwarded-for") || "local";
    if (!rateLimit(ip)) return c.json({ error: "请求过于频繁，请稍后再试" }, 429);

    const body = await c.req.json();
    const email = (body.email || "").trim().toLowerCase();
    const password = body.password || "";
    const nickname = (body.nickname || "打工人").trim();

    if (!email || !password) return c.json({ error: "邮箱和密码不能为空" }, 400);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return c.json({ error: "邮箱格式不正确" }, 400);
    if (password.length < 6) return c.json({ error: "密码至少 6 位" }, 400);

    const data = loadData();
    if (data.users.some((u) => u.email === email)) return c.json({ error: "该邮箱已注册" }, 409);

    const userId = "usr_" + randomUUID().slice(0, 12);
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    data.users.push({
      id: userId,
      email,
      nickname,
      passwordHash,
      createdAt: new Date().toISOString(),
      wechatOpenId: null,
    });
    const token = issueToken(data, userId);
    saveData(data);

    return c.json(
      {
        user_id: userId,
        email,
        nickname,
        token,
        expires_in: TOKEN_TTL_MS / 1000,
        message: "注册成功",
      },
      201
    );
  } catch (err) {
    console.error(err);
    return c.json({ error: "服务器内部错误" }, 500);
  }
});

app.post("/api/v1/auth/login", async (c) => {
  try {
    const ip = c.req.header("x-forwarded-for") || "local";
    if (!rateLimit(ip)) return c.json({ error: "请求过于频繁，请稍后再试" }, 429);

    const body = await c.req.json();
    const email = (body.email || "").trim().toLowerCase();
    const password = body.password || "";
    if (!email || !password) return c.json({ error: "邮箱和密码不能为空" }, 400);

    const data = loadData();
    const user = data.users.find((u) => u.email === email);
    if (!user) return c.json({ error: "邮箱或密码错误" }, 401);

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return c.json({ error: "邮箱或密码错误" }, 401);

    const token = issueToken(data, user.id);
    saveData(data);

    return c.json({
      user_id: user.id,
      email: user.email,
      nickname: user.nickname,
      token,
      expires_in: TOKEN_TTL_MS / 1000,
      message: "登录成功",
    });
  } catch (err) {
    console.error(err);
    return c.json({ error: "服务器内部错误" }, 500);
  }
});

// 用未过期 Token 换新 Token
app.post("/api/v1/auth/refresh", async (c) => {
  try {
    const auth = c.req.header("Authorization") || "";
    const old = auth.replace(/^Bearer\s+/i, "").trim();
    if (!old) return c.json({ error: "缺少 Token" }, 401);

    const data = loadData();
    pruneExpired(data);
    const rec = data.tokens[old];
    if (!rec || rec.expiresAt < Date.now()) {
      return c.json({ error: "Token 无效或已过期，请重新登录" }, 401);
    }
    delete data.tokens[old];
    const token = issueToken(data, rec.userId);
    saveData(data);
    return c.json({ token, expires_in: TOKEN_TTL_MS / 1000, user_id: rec.userId });
  } catch (err) {
    console.error(err);
    return c.json({ error: "服务器内部错误" }, 500);
  }
});

app.post("/api/v1/mood/events", async (c) => {
  try {
    const body = await c.req.json();
    const userId = c.get("userId");
    const { category_code, score = 1, note, date } = body;
    if (!category_code) return c.json({ error: "缺少 category_code" }, 400);

    const data = loadData();
    const eventId = "evt_" + randomUUID().slice(0, 8);
    const recordedAt = date ? new Date(date).toISOString() : new Date().toISOString();
    data.events.push({
      id: eventId,
      userId,
      categoryCode: category_code,
      score: Number(score) || 1,
      note: note || "",
      recordedAt,
    });
    saveData(data);

    const userEvents = data.events.filter((e) => e.userId === userId);
    const totalPoints = userEvents.reduce((s, e) => s + (e.score || 1), 0);
    const disgustIndex = Math.min(100, Number(((totalPoints / 100) * 80 + 10).toFixed(1)));
    return c.json({ event_id: eventId, total_points: totalPoints, disgust_index: disgustIndex }, 201);
  } catch (err) {
    console.error(err);
    return c.json({ error: "服务器内部错误" }, 500);
  }
});

app.get("/api/v1/mood/events", async (c) => {
  try {
    const userId = c.get("userId");
    const data = loadData();
    const events = data.events
      .filter((e) => e.userId === userId)
      .sort((a, b) => (a.recordedAt || "").localeCompare(b.recordedAt || ""));
    return c.json({ events, total: events.length });
  } catch (err) {
    console.error(err);
    return c.json({ error: "服务器内部错误" }, 500);
  }
});

app.get("/api/v1/mood/stats", async (c) => {
  try {
    const userId = c.get("userId");
    const days = Number(c.req.query("days") || 14);
    const data = loadData();
    const since = new Date();
    since.setDate(since.getDate() - days);
    const events = data.events.filter((e) => e.userId === userId && new Date(e.recordedAt) >= since);

    const categoryBreakdown: Record<string, number> = {};
    const trendMap: Record<string, number> = {};
    events.forEach((e) => {
      categoryBreakdown[e.categoryCode] = (categoryBreakdown[e.categoryCode] || 0) + (e.score || 1);
      const dateStr = (e.recordedAt || "").slice(0, 10);
      if (dateStr) trendMap[dateStr] = (trendMap[dateStr] || 0) + (e.score || 1);
    });
    const trend = Object.entries(trendMap)
      .map(([date, points]) => ({ date, points }))
      .sort((a, b) => a.date.localeCompare(b.date));
    const totalPoints = events.reduce((s, e) => s + (e.score || 1), 0);
    return c.json({ total_points: totalPoints, category_breakdown: categoryBreakdown, trend });
  } catch (err) {
    console.error(err);
    return c.json({ error: "服务器内部错误" }, 500);
  }
});

// 微信登录预留
// app.post("/api/v1/auth/wechat", ...)

const port = Number(process.env.PORT) || 3001;

serve(
  {
    fetch: app.fetch,
    port,
  },
  (info) => {
    console.log(`Server is running on port ${info.port}`);
  }
);
//const port = 3001;
//console.log(`社畜解放卡后端已启动：http://localhost:${port}`);
//serve({ fetch: app.fetch, port });
