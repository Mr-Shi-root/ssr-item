# Redis 缓存层工作流程详解

## 一、Redis 缓存层的位置

Redis 缓存层是在**服务端（Node.js）**，不是在前端。

```
前端浏览器
    ↓ (HTTP 请求)
Node.js 服务端 (Koa)
    ↓ (查询缓存)
Redis 缓存层 ← 这里！
    ↓ (缓存未命中)
后端 API 服务
    ↓
数据库
```

---

## 二、完整的请求流程

### 场景 1：用户访问普通商品详情页（SSR）

```
1. 用户浏览器
   ↓ GET /item/123

2. Nginx (反向代理)
   ↓ 转发到 Node.js

3. Koa 服务端接收请求
   ↓ 调用预检接口

4. 预检接口逻辑 (src/api/precheck.js)
   ├─ 先查 Redis: GET precheck:123
   ├─ 缓存命中 → 直接返回 (5ms)
   └─ 缓存未命中 → 调用后端 API (50ms)
       └─ 写入 Redis: SET precheck:123 {data} EX 60

5. 判断为普通商品，执行 SSR 渲染
   ↓

6. SSR 渲染逻辑 (src/server/ssr.js)
   ├─ 先查 Redis: GET ssr:123
   ├─ 缓存命中 → 直接返回 HTML (5ms)
   └─ 缓存未命中 → 执行渲染
       ├─ 调用后端 API 获取商品数据
       │   ├─ 先查 Redis: GET item:123
       │   ├─ 缓存命中 → 返回数据
       │   └─ 缓存未命中 → 查询数据库
       │       └─ 写入 Redis: SET item:123 {data} EX 300
       ├─ React.renderToString() 渲染组件
       └─ 写入 Redis: SET ssr:123 {html} EX 60

7. 返回 HTML 给浏览器
   ↓

8. 浏览器渲染页面
   ↓

9. 客户端 hydration (加载 client.bundle.js)
```

### 场景 2：用户访问秒杀商品详情页（CSR）

```
1. 用户浏览器
   ↓ GET /item/SK001

2. Nginx (反向代理)
   ↓ 转发到 Node.js

3. Koa 服务端接收请求
   ↓ 调用预检接口

4. 预检接口逻辑
   ├─ 先查 Redis: GET precheck:SK001
   ├─ 缓存命中 → 返回 { isSeckill: true }
   └─ 缓存未命中 → 调用后端 API
       └─ 写入 Redis

5. 判断为秒杀商品，返回骨架页 HTML
   ↓ (直接返回静态 HTML，不查 Redis)

6. 浏览器接收骨架页 HTML
   ↓ 显示骨架屏

7. 浏览器加载 skeleton.bundle.js
   ↓ React 客户端渲染

8. 客户端发起 AJAX 请求
   ↓ GET /api/item/SK001

9. Koa 服务端接收 API 请求
   ├─ 先查 Redis: GET item:SK001
   ├─ 缓存命中 → 返回 JSON 数据
   └─ 缓存未命中 → 调用后端 API
       └─ 写入 Redis

10. 浏览器接收数据，渲染页面
```

---

## 三、Redis 缓存的三种用途

### 3.1 预检结果缓存

**位置**：`src/api/precheck.js`（服务端）

```javascript
// 伪代码示例
async function precheckItem(itemId) {
  const cacheKey = `precheck:${itemId}`;

  // 1. 先查 Redis
  const cached = await redis.get(cacheKey);
  if (cached) {
    console.log('预检缓存命中');
    return JSON.parse(cached);
  }

  // 2. 缓存未命中，调用后端 API
  const result = await axios.get(`https://api.example.com/precheck/${itemId}`);

  // 3. 写入 Redis，TTL 60 秒
  await redis.setex(cacheKey, 60, JSON.stringify(result.data));

  return result.data;
}
```

**缓存内容**：
```json
{
  "isSeckill": false,
  "data": {
    "itemId": "123",
    "type": "normal",
    "timestamp": 1701234567890
  }
}
```

**缓存时间**：60 秒

---

### 3.2 SSR 渲染结果缓存

**位置**：`src/server/ssr.js`（服务端）

```javascript
// 伪代码示例
async function renderSSR(itemId) {
  const cacheKey = `ssr:${itemId}`;

  // 1. 先查 Redis
  const cachedHtml = await redis.get(cacheKey);
  if (cachedHtml) {
    console.log('SSR 缓存命中');
    return cachedHtml;
  }

  // 2. 缓存未命中，执行 SSR 渲染
  const itemData = await fetchItemData(itemId);
  const html = ReactDOMServer.renderToString(
    React.createElement(ItemDetailPage, { itemData })
  );
  const fullHtml = generateHTML(html, itemData);

  // 3. 写入 Redis，TTL 60 秒
  await redis.setex(cacheKey, 60, fullHtml);

  return fullHtml;
}
```

**缓存内容**：完整的 HTML 字符串

**缓存时间**：60 秒

---

### 3.3 商品数据缓存

**位置**：`src/server/ssr.js` 或 `src/server/index.js`（服务端）

```javascript
// 伪代码示例
async function fetchItemData(itemId) {
  const cacheKey = `item:${itemId}`;

  // 1. 先查 Redis
  const cached = await redis.get(cacheKey);
  if (cached) {
    console.log('商品数据缓存命中');
    return JSON.parse(cached);
  }

  // 2. 缓存未命中，调用后端 API
  const response = await axios.get(`https://api.example.com/item/${itemId}`);
  const itemData = response.data;

  // 3. 写入 Redis，TTL 5 分钟
  await redis.setex(cacheKey, 300, JSON.stringify(itemData));

  return itemData;
}
```

**缓存内容**：
```json
{
  "itemId": "123",
  "title": "商品标题",
  "price": 199.99,
  "stock": 500,
  "description": "商品描述",
  "images": ["url1", "url2"]
}
```

**缓存时间**：300 秒（5 分钟）

---

## 四、前端和后端的职责划分

### 前端（浏览器）的职责

```javascript
// 前端只负责：
1. 发起 HTTP 请求
2. 接收 HTML 或 JSON 数据
3. 渲染页面
4. 用户交互

// 前端不知道 Redis 的存在！
// 前端只是调用接口，不关心后端怎么实现
```

**示例**：秒杀页面的客户端代码

```javascript
// src/pages/SeckillItemPage.jsx (运行在浏览器)
useEffect(() => {
  const itemId = window.__ITEM_ID__;

  // 前端发起 AJAX 请求
  axios.get(`/api/item/${itemId}`)
    .then(response => {
      setItemData(response.data.data);
      setLoading(false);
    });
}, []);
```

**前端视角**：
- 我只是调用了 `/api/item/SK001` 接口
- 我不知道后端是从 Redis 返回的还是从数据库返回的
- 我只关心能拿到数据

---

### 后端（Node.js）的职责

```javascript
// 后端负责：
1. 接收前端请求
2. 查询 Redis 缓存
3. 缓存未命中时调用后端 API 或数据库
4. 将结果写入 Redis
5. 返回数据给前端

// 后端对 Redis 的操作对前端完全透明
```

**示例**：API 接口的后端代码

```javascript
// src/server/index.js (运行在 Node.js 服务端)
router.get('/api/item/:id', async (ctx) => {
  const itemId = ctx.params.id;
  const cacheKey = `item:${itemId}`;

  // 1. 先查 Redis（后端处理）
  let itemData = await redis.get(cacheKey);

  if (itemData) {
    // 缓存命中
    console.log('Redis 缓存命中');
    ctx.body = {
      success: true,
      data: JSON.parse(itemData)
    };
    return;
  }

  // 2. 缓存未命中，调用后端 API（后端处理）
  const response = await axios.get(`https://api.example.com/item/${itemId}`);
  itemData = response.data;

  // 3. 写入 Redis（后端处理）
  await redis.setex(cacheKey, 300, JSON.stringify(itemData));

  // 4. 返回给前端
  ctx.body = {
    success: true,
    data: itemData
  };
});
```

---

## 五、Redis 缓存的实现代码

### 5.1 安装 Redis 客户端

```bash
npm install ioredis
```

### 5.2 创建 Redis 连接

```javascript
// src/utils/redis.js
const Redis = require('ioredis');

const redis = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || '',
  db: 0,
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  }
});

redis.on('connect', () => {
  console.log('✅ Redis 连接成功');
});

redis.on('error', (err) => {
  console.error('❌ Redis 连接失败:', err);
});

module.exports = redis;
```

### 5.3 在预检接口中使用 Redis

```javascript
// src/api/precheck.js
const redis = require('../utils/redis');
const axios = require('axios');

async function precheckItem(itemId) {
  const cacheKey = `precheck:${itemId}`;

  try {
    // 1. 尝试从 Redis 获取
    const cached = await redis.get(cacheKey);
    if (cached) {
      console.log(`✅ 预检缓存命中: ${itemId}`);
      return JSON.parse(cached);
    }

    // 2. 缓存未命中，调用后端 API
    console.log(`⚠️ 预检缓存未命中: ${itemId}，调用后端 API`);
    const response = await axios.get(
      `https://api.example.com/precheck/${itemId}`,
      { timeout: 100 }
    );

    const result = {
      isSeckill: response.data.isSeckill,
      data: response.data
    };

    // 3. 写入 Redis，TTL 60 秒
    await redis.setex(cacheKey, 60, JSON.stringify(result));

    return result;
  } catch (error) {
    console.error('预检接口失败:', error);
    // 降级策略：失败时默认走 SSR
    return { isSeckill: false, data: {} };
  }
}

module.exports = { precheckItem };
```

### 5.4 在 SSR 渲染中使用 Redis

```javascript
// src/server/ssr.js
const redis = require('../utils/redis');

async function renderSSR(itemId) {
  const cacheKey = `ssr:${itemId}`;

  try {
    // 1. 尝试从 Redis 获取
    const cachedHtml = await redis.get(cacheKey);
    if (cachedHtml) {
      console.log(`✅ SSR 缓存命中: ${itemId}`);
      return cachedHtml;
    }

    // 2. 缓存未命中，执行 SSR 渲染
    console.log(`⚠️ SSR 缓存未命中: ${itemId}，执行渲染`);
    const itemData = await fetchItemData(itemId);
    const appHtml = ReactDOMServer.renderToString(
      React.createElement(ItemDetailPage, { itemData })
    );
    const fullHtml = generateHTML(appHtml, itemData);

    // 3. 写入 Redis，TTL 60 秒
    await redis.setex(cacheKey, 60, fullHtml);

    return fullHtml;
  } catch (error) {
    console.error('SSR 渲染失败:', error);
    throw error;
  }
}

async function fetchItemData(itemId) {
  const cacheKey = `item:${itemId}`;

  // 1. 尝试从 Redis 获取
  const cached = await redis.get(cacheKey);
  if (cached) {
    console.log(`✅ 商品数据缓存命中: ${itemId}`);
    return JSON.parse(cached);
  }

  // 2. 缓存未命中，调用后端 API
  console.log(`⚠️ 商品数据缓存未命中: ${itemId}，调用后端 API`);
  const response = await axios.get(`https://api.example.com/item/${itemId}`);
  const itemData = response.data;

  // 3. 写入 Redis，TTL 5 分钟
  await redis.setex(cacheKey, 300, JSON.stringify(itemData));

  return itemData;
}

module.exports = { renderSSR };
```

---

## 六、Redis 缓存的监控

### 6.1 缓存命中率统计

```javascript
// src/utils/cache-monitor.js
class CacheMonitor {
  constructor() {
    this.stats = {
      precheck: { hit: 0, miss: 0 },
      ssr: { hit: 0, miss: 0 },
      item: { hit: 0, miss: 0 }
    };
  }

  recordHit(type) {
    this.stats[type].hit++;
  }

  recordMiss(type) {
    this.stats[type].miss++;
  }

  getHitRate(type) {
    const { hit, miss } = this.stats[type];
    const total = hit + miss;
    return total === 0 ? 0 : (hit / total * 100).toFixed(2);
  }

  getReport() {
    return {
      precheck: {
        ...this.stats.precheck,
        hitRate: this.getHitRate('precheck') + '%'
      },
      ssr: {
        ...this.stats.ssr,
        hitRate: this.getHitRate('ssr') + '%'
      },
      item: {
        ...this.stats.item,
        hitRate: this.getHitRate('item') + '%'
      }
    };
  }
}

module.exports = new CacheMonitor();
```

### 6.2 监控接口

```javascript
// src/server/index.js
const cacheMonitor = require('../utils/cache-monitor');

router.get('/api/cache-stats', (ctx) => {
  ctx.body = cacheMonitor.getReport();
});

// 输出示例：
// {
//   "precheck": { "hit": 9500, "miss": 500, "hitRate": "95.00%" },
//   "ssr": { "hit": 9000, "miss": 1000, "hitRate": "90.00%" },
//   "item": { "hit": 8500, "miss": 1500, "hitRate": "85.00%" }
// }
```

---

## 七、总结

### Redis 缓存层的关键点

1. **位置**：在服务端（Node.js），不在前端
2. **职责**：缓存预检结果、SSR 渲染结果、商品数据
3. **对前端透明**：前端不知道 Redis 的存在，只是调用接口
4. **三级缓存**：
   - 预检缓存（60 秒）
   - SSR 缓存（60 秒）
   - 商品数据缓存（300 秒）

### 请求流程总结

```
前端发起请求
    ↓
Node.js 接收请求
    ↓
查询 Redis 缓存 ← 这里是 Redis 的位置
    ├─ 缓存命中 → 直接返回（快）
    └─ 缓存未命中 → 调用后端 API（慢）
        └─ 写入 Redis
    ↓
返回数据给前端
```

### 性能提升

- **预检接口**：50ms → 5ms（提升 10 倍）
- **SSR 渲染**：100ms → 5ms（提升 20 倍）
- **商品数据**：200ms → 5ms（提升 40 倍）

**Redis 缓存是在服务端处理的，前端只是发起请求和接收响应，完全不需要关心缓存逻辑！**
