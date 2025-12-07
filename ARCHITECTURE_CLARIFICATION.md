# 架构澄清：Redis 缓存在哪里？

## 一、两种架构模式对比

### 模式 1：Redis 在 Node.js 服务端（本项目采用）✅

```
客户端浏览器
    ↓ HTTP 请求
Node.js 服务器 (Koa)
    ├─ Redis 缓存 ← 在这里！
    └─ 调用后端 API（缓存未命中时）
        ↓
后端 API 服务器
    └─ 数据库
```

**流程**：
1. 客户端请求 `/item/123`
2. Node.js 服务器接收请求
3. **Node.js 直接查询 Redis**（不经过后端）
4. 缓存命中 → 直接返回
5. 缓存未命中 → Node.js 调用后端 API
6. 后端 API 返回数据给 Node.js
7. **Node.js 写入 Redis**
8. Node.js 进行 SSR 渲染
9. 返回 HTML 给客户端

---

### 模式 2：Redis 在后端 API 服务器（你理解的）

```
客户端浏览器
    ↓ HTTP 请求
Node.js 服务器 (Koa)
    ↓ 调用后端 API
后端 API 服务器
    ├─ Redis 缓存 ← 在这里
    └─ 数据库
```

**流程**：
1. 客户端请求 `/item/123`
2. Node.js 服务器接收请求
3. Node.js 调用后端 API
4. **后端 API 查询 Redis**
5. 缓存命中 → 后端返回数据
6. 缓存未命中 → 后端查询数据库
7. **后端写入 Redis**
8. 后端返回数据给 Node.js
9. Node.js 进行 SSR 渲染
10. 返回 HTML 给客户端

---

## 二、本项目采用的架构（模式 1）

### 为什么 Redis 在 Node.js 服务端？

**原因 1：减少网络请求**
- 如果 Redis 在后端，Node.js 每次都要调用后端 API
- Redis 在 Node.js，可以直接查询，减少一次网络往返

**原因 2：缓存 SSR 渲染结果**
- SSR 渲染是在 Node.js 完成的
- 渲染结果（HTML）需要缓存在 Node.js 侧
- 后端 API 不知道 HTML 长什么样

**原因 3：更灵活的缓存策略**
- Node.js 可以缓存预检结果、SSR 结果、商品数据
- 后端只需要提供原始数据，不关心缓存

---

## 三、详细流程图

### 场景 1：普通商品 SSR 渲染（首次访问）

```
┌─────────────┐
│ 客户端浏览器 │
└──────┬──────┘
       │ GET /item/123
       ↓
┌─────────────────────────────────────────┐
│ Node.js 服务器 (Koa)                     │
│                                          │
│ 1. 接收请求                              │
│    ↓                                     │
│ 2. 调用预检接口                          │
│    ├─ 查询 Redis: precheck:123          │
│    │  └─ 未命中                          │
│    ├─ 调用后端 API ─────────────────┐   │
│    │                                 │   │
│    │  ┌──────────────────────────┐  │   │
│    │  │ 后端 API 服务器           │  │   │
│    │  │ - 查询数据库              │  │   │
│    │  │ - 返回 { isSeckill: false }│ │   │
│    │  └──────────────────────────┘  │   │
│    │                                 │   │
│    └─ 写入 Redis: precheck:123 ◄────┘   │
│    ↓                                     │
│ 3. 判断为普通商品，执行 SSR              │
│    ├─ 查询 Redis: ssr:123               │
│    │  └─ 未命中                          │
│    ├─ 获取商品数据                       │
│    │  ├─ 查询 Redis: item:123           │
│    │  │  └─ 未命中                       │
│    │  ├─ 调用后端 API ────────────┐     │
│    │  │                            │     │
│    │  │  ┌──────────────────────┐ │     │
│    │  │  │ 后端 API 服务器       │ │     │
│    │  │  │ - 查询数据库          │ │     │
│    │  │  │ - 返回商品数据        │ │     │
│    │  │  └──────────────────────┘ │     │
│    │  │                            │     │
│    │  └─ 写入 Redis: item:123 ◄───┘     │
│    ├─ React.renderToString() 渲染       │
│    └─ 写入 Redis: ssr:123               │
│    ↓                                     │
│ 4. 返回 HTML                             │
└──────┬───────────────────────────────────┘
       │ HTML (包含初始数据)
       ↓
┌─────────────┐
│ 客户端浏览器 │
│ - 渲染 HTML  │
│ - Hydration  │
└─────────────┘
```

### 场景 2：普通商品 SSR 渲染（缓存命中）

```
┌─────────────┐
│ 客户端浏览器 │
└──────┬──────┘
       │ GET /item/123
       ↓
┌─────────────────────────────────────────┐
│ Node.js 服务器 (Koa)                     │
│                                          │
│ 1. 接收请求                              │
│    ↓                                     │
│ 2. 调用预检接口                          │
│    ├─ 查询 Redis: precheck:123          │
│    │  └─ ✅ 命中！直接返回               │
│    ↓                                     │
│ 3. 判断为普通商品，执行 SSR              │
│    ├─ 查询 Redis: ssr:123               │
│    │  └─ ✅ 命中！直接返回 HTML          │
│    ↓                                     │
│ 4. 返回 HTML                             │
│                                          │
│ ⚡ 总耗时：<10ms（全部从 Redis 返回）    │
└──────┬───────────────────────────────────┘
       │ HTML
       ↓
┌─────────────┐
│ 客户端浏览器 │
└─────────────┘
```

### 场景 3：秒杀商品 CSR 渲染

```
┌─────────────┐
│ 客户端浏览器 │
└──────┬──────┘
       │ GET /item/SK001
       ↓
┌─────────────────────────────────────────┐
│ Node.js 服务器 (Koa)                     │
│                                          │
│ 1. 接收请求                              │
│    ↓                                     │
│ 2. 调用预检接口                          │
│    ├─ 查询 Redis: precheck:SK001        │
│    │  └─ ✅ 命中！{ isSeckill: true }    │
│    ↓                                     │
│ 3. 判断为秒杀商品，返回骨架页            │
│    └─ 直接返回静态 HTML（不查 Redis）    │
│                                          │
│ ⚡ 总耗时：<5ms                          │
└──────┬───────────────────────────────────┘
       │ 骨架页 HTML
       ↓
┌─────────────────────────────────────────┐
│ 客户端浏览器                             │
│ 1. 渲染骨架屏                            │
│ 2. 加载 skeleton.bundle.js              │
│ 3. React 客户端渲染                      │
│ 4. 发起 AJAX 请求                        │
└──────┬───────────────────────────────────┘
       │ GET /api/item/SK001
       ↓
┌─────────────────────────────────────────┐
│ Node.js 服务器 (Koa)                     │
│                                          │
│ 1. 接收 API 请求                         │
│    ├─ 查询 Redis: item:SK001            │
│    │  └─ ✅ 命中！返回 JSON 数据         │
│    ↓                                     │
│ 2. 返回 JSON                             │
└──────┬───────────────────────────────────┘
       │ JSON 数据
       ↓
┌─────────────┐
│ 客户端浏览器 │
│ - 渲染页面   │
└─────────────┘
```

---

## 四、代码实现示例

### 4.1 Node.js 服务端直接操作 Redis

```javascript
// src/server/index.js
const Koa = require('koa');
const redis = require('./utils/redis'); // Node.js 直接连接 Redis

const app = new Koa();

router.get('/item/:id', async (ctx) => {
  const itemId = ctx.params.id;

  // ===== 步骤 1：预检（Node.js 查询 Redis）=====
  let precheckResult = await redis.get(`precheck:${itemId}`);

  if (!precheckResult) {
    // 缓存未命中，调用后端 API
    const response = await axios.get(`https://api.example.com/precheck/${itemId}`);
    precheckResult = response.data;

    // Node.js 写入 Redis
    await redis.setex(`precheck:${itemId}`, 60, JSON.stringify(precheckResult));
  } else {
    precheckResult = JSON.parse(precheckResult);
  }

  // ===== 步骤 2：根据结果选择渲染策略 =====
  if (precheckResult.isSeckill) {
    // 秒杀商品：返回骨架页
    ctx.body = renderSkeleton(itemId, precheckResult);
  } else {
    // 普通商品：SSR 渲染

    // 2.1 查询 SSR 缓存（Node.js 查询 Redis）
    let html = await redis.get(`ssr:${itemId}`);

    if (!html) {
      // 缓存未命中，执行 SSR 渲染

      // 2.2 获取商品数据（Node.js 查询 Redis）
      let itemData = await redis.get(`item:${itemId}`);

      if (!itemData) {
        // 缓存未命中，调用后端 API
        const response = await axios.get(`https://api.example.com/item/${itemId}`);
        itemData = response.data;

        // Node.js 写入 Redis
        await redis.setex(`item:${itemId}`, 300, JSON.stringify(itemData));
      } else {
        itemData = JSON.parse(itemData);
      }

      // 2.3 执行 SSR 渲染
      html = await renderSSR(itemId, itemData);

      // Node.js 写入 Redis
      await redis.setex(`ssr:${itemId}`, 60, html);
    }

    ctx.body = html;
  }
});
```

### 4.2 Redis 连接配置

```javascript
// src/utils/redis.js
const Redis = require('ioredis');

// Node.js 直接连接 Redis 服务器
const redis = new Redis({
  host: '127.0.0.1',  // Redis 服务器地址
  port: 6379,
  password: '',
  db: 0
});

module.exports = redis;
```

---

## 五、关键区别总结

### 你理解的架构（模式 2）

```
Node.js → 后端 API (Redis 在这里) → 数据库
```

**问题**：
- ❌ 每次都要调用后端 API，增加网络延迟
- ❌ 无法缓存 SSR 渲染结果（后端不知道 HTML）
- ❌ 预检结果也要经过后端，慢

---

### 实际的架构（模式 1）✅

```
Node.js (Redis 在这里) → 后端 API → 数据库
```

**优势**：
- ✅ Node.js 直接查询 Redis，快
- ✅ 可以缓存 SSR 渲染结果
- ✅ 可以缓存预检结果
- ✅ 减少网络往返

---

## 六、水合（Hydration）的位置

### 水合发生在哪里？

**水合（Hydration）发生在客户端浏览器，不在服务端！**

```
1. Node.js 服务端
   └─ React.renderToString() → 生成 HTML 字符串

2. 返回 HTML 给浏览器
   └─ HTML 包含初始数据和 <script> 标签

3. 浏览器接收 HTML
   ├─ 立即渲染 HTML（用户看到内容）
   └─ 加载 client.bundle.js

4. client.bundle.js 执行
   └─ ReactDOM.hydrateRoot() ← 水合在这里！
       └─ 将静态 HTML 变成可交互的 React 组件
```

### 水合的代码

```javascript
// src/client/index.js (运行在浏览器)
import React from 'react';
import ReactDOM from 'react-dom/client';
import ItemDetailPage from '../pages/ItemDetailPage';

// 从服务端注入的初始数据
const initialData = window.__INITIAL_DATA__;

// 水合：将服务端渲染的静态 HTML 变成可交互的 React 组件
ReactDOM.hydrateRoot(
  document.getElementById('root'),
  <ItemDetailPage itemData={initialData} />
);
```

---

## 七、完整流程总结

### SSR 渲染的完整流程

```
1. 客户端请求 /item/123
   ↓
2. Node.js 接收请求
   ↓
3. Node.js 查询 Redis (precheck:123)
   ├─ 命中 → 跳到步骤 5
   └─ 未命中 → 步骤 4
   ↓
4. Node.js 调用后端 API
   └─ 后端查询数据库，返回数据
   └─ Node.js 写入 Redis
   ↓
5. Node.js 查询 Redis (ssr:123)
   ├─ 命中 → 跳到步骤 9
   └─ 未命中 → 步骤 6
   ↓
6. Node.js 查询 Redis (item:123)
   ├─ 命中 → 跳到步骤 8
   └─ 未命中 → 步骤 7
   ↓
7. Node.js 调用后端 API
   └─ 后端查询数据库，返回商品数据
   └─ Node.js 写入 Redis
   ↓
8. Node.js 执行 SSR 渲染
   └─ React.renderToString() 生成 HTML
   └─ Node.js 写入 Redis (ssr:123)
   ↓
9. Node.js 返回 HTML 给客户端
   ↓
10. 客户端浏览器渲染 HTML
    ↓
11. 客户端加载 client.bundle.js
    ↓
12. 客户端执行 Hydration
    └─ ReactDOM.hydrateRoot() 激活交互
```

---

## 八、关键要点

### ✅ 正确理解

1. **Redis 在 Node.js 服务端**，不在后端 API
2. **Node.js 直接查询 Redis**，不经过后端
3. **缓存未命中时**，Node.js 才调用后端 API
4. **Node.js 负责写入 Redis**
5. **水合（Hydration）在客户端浏览器**，不在服务端

### ❌ 常见误解

1. ~~Redis 在后端 API 服务器~~
2. ~~Node.js 每次都要调用后端 API~~
3. ~~后端负责写入 Redis~~
4. ~~水合在服务端进行~~

---

## 九、为什么这样设计？

### 优势

1. **性能最优**
   - Redis 在 Node.js，查询延迟 <1ms
   - 如果 Redis 在后端，需要网络往返，延迟 10-50ms

2. **缓存灵活**
   - 可以缓存预检结果、SSR 结果、商品数据
   - 不同类型的缓存有不同的 TTL

3. **减少后端压力**
   - 大部分请求在 Node.js 层就返回了
   - 后端只处理缓存未命中的请求

4. **架构清晰**
   - Node.js：负责渲染和缓存
   - 后端 API：只负责提供数据
   - 职责分离，易于维护

---

希望这次解释清楚了！**Redis 在 Node.js 服务端，不在后端 API 服务器**。
