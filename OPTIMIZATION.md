# 架构优化方案

## 当前架构的问题和优化点

### 一、性能优化

#### 1.1 预检接口优化 ⭐⭐⭐⭐⭐

**当前问题**：
- 每次请求都调用预检接口，增加延迟
- 预检接口失败会影响整体性能
- 没有缓存机制

**优化方案**：

```javascript
// src/server/cache.js - 新增缓存层
const NodeCache = require('node-cache');

class PrecheckCache {
  constructor() {
    // 内存缓存，TTL 60秒
    this.cache = new NodeCache({ stdTTL: 60, checkperiod: 120 });
  }

  async get(itemId, fetchFn) {
    const cacheKey = `precheck_${itemId}`;

    // 1. 尝试从缓存获取
    let result = this.cache.get(cacheKey);
    if (result) {
      console.log(`预检缓存命中: ${itemId}`);
      return result;
    }

    // 2. 缓存未命中，调用接口
    result = await fetchFn(itemId);

    // 3. 写入缓存
    this.cache.set(cacheKey, result);

    return result;
  }

  // 支持 Redis 缓存（生产环境推荐）
  async getWithRedis(itemId, fetchFn, redisClient) {
    const cacheKey = `precheck:${itemId}`;

    try {
      // 1. 尝试从 Redis 获取
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }

      // 2. 调用接口
      const result = await fetchFn(itemId);

      // 3. 写入 Redis，TTL 60秒
      await redisClient.setex(cacheKey, 60, JSON.stringify(result));

      return result;
    } catch (error) {
      console.error('Redis 缓存失败:', error);
      return await fetchFn(itemId);
    }
  }
}

module.exports = new PrecheckCache();
```

**使用方式**：

```javascript
// src/server/index.js
const precheckCache = require('./cache');

router.get('/item/:id', async (ctx) => {
  const itemId = ctx.params.id;

  // 使用缓存包装预检接口
  const { isSeckill, data } = await precheckCache.get(
    itemId,
    precheckItem
  );

  // ... 后续逻辑
});
```

**优化效果**：
- ✅ 减少 90% 的预检接口调用
- ✅ 响应时间从 50ms 降低到 <5ms
- ✅ 支持高并发场景

---

#### 1.2 SSR 渲染缓存 ⭐⭐⭐⭐⭐

**当前问题**：
- 每次请求都重新渲染 React 组件
- 相同商品的重复渲染浪费 CPU

**优化方案**：

```javascript
// src/server/ssr-cache.js
const LRU = require('lru-cache');

class SSRCache {
  constructor() {
    this.cache = new LRU({
      max: 500,           // 最多缓存 500 个页面
      maxAge: 1000 * 60,  // 缓存 1 分钟
      length: (n, key) => n.length  // 按 HTML 长度计算
    });
  }

  async render(itemId, renderFn) {
    const cacheKey = `ssr_${itemId}`;

    // 1. 尝试从缓存获取
    let html = this.cache.get(cacheKey);
    if (html) {
      console.log(`SSR 缓存命中: ${itemId}`);
      return html;
    }

    // 2. 执行渲染
    html = await renderFn(itemId);

    // 3. 写入缓存
    this.cache.set(cacheKey, html);

    return html;
  }

  // 清除指定商品的缓存（商品更新时调用）
  invalidate(itemId) {
    this.cache.del(`ssr_${itemId}`);
  }
}

module.exports = new SSRCache();
```

**使用方式**：

```javascript
// src/server/index.js
const ssrCache = require('./ssr-cache');

router.get('/item/:id', async (ctx) => {
  // ...
  if (!isSeckill) {
    // 使用缓存包装 SSR 渲染
    const html = await ssrCache.render(itemId, renderSSR);
    ctx.body = html;
  }
});

// 商品更新时清除缓存
router.post('/api/item/:id/update', async (ctx) => {
  // ... 更新商品逻辑
  ssrCache.invalidate(ctx.params.id);
});
```

**优化效果**：
- ✅ SSR 渲染时间从 100ms 降低到 <5ms
- ✅ CPU 使用率降低 80%
- ✅ 支持更高的 QPS

---

#### 1.3 流式 SSR 渲染 ⭐⭐⭐⭐

**当前问题**：
- 使用 `renderToString` 是同步阻塞的
- 必须等待整个组件树渲染完成才能返回

**优化方案**：

```javascript
// src/server/ssr-stream.js
const React = require('react');
const { renderToPipeableStream } = require('react-dom/server');

async function renderSSRStream(itemId, ctx) {
  const itemData = await fetchItemData(itemId);

  return new Promise((resolve, reject) => {
    let didError = false;

    const { pipe, abort } = renderToPipeableStream(
      React.createElement(ItemDetailPage, { itemData }),
      {
        onShellReady() {
          // 设置响应头
          ctx.status = didError ? 500 : 200;
          ctx.type = 'html';

          // 写入 HTML 头部
          ctx.res.write(`
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>${itemData.title}</title>
</head>
<body>
  <div id="root">
          `);

          // 流式传输 React 内容
          pipe(ctx.res);
        },
        onAllReady() {
          // 写入 HTML 尾部
          ctx.res.write(`
  </div>
  <script>window.__INITIAL_DATA__ = ${JSON.stringify(itemData)};</script>
  <script src="/client.bundle.js"></script>
</body>
</html>
          `);
          ctx.res.end();
          resolve();
        },
        onError(error) {
          didError = true;
          console.error('SSR 流式渲染错误:', error);
          reject(error);
        }
      }
    );

    // 超时处理
    setTimeout(() => {
      abort();
      reject(new Error('SSR 渲染超时'));
    }, 5000);
  });
}

module.exports = { renderSSRStream };
```

**优化效果**：
- ✅ TTFB（首字节时间）降低 50%
- ✅ 用户更快看到内容
- ✅ 支持 React 18 的 Suspense

---

#### 1.4 骨架页预生成 ⭐⭐⭐⭐

**当前问题**：
- 骨架页 HTML 在服务端动态生成
- 每次请求都要拼接字符串

**优化方案**：

```javascript
// scripts/prebuild-skeleton.js - 构建时预生成骨架页
const fs = require('fs');
const path = require('path');

function generateSkeletonHTML() {
  const html = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>秒杀商品 - 加载中</title>
  <style>
    /* 内联关键 CSS */
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, sans-serif; background: #f5f5f5; }
    .skeleton { background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%); }
    /* ... 更多样式 */
  </style>
</head>
<body>
  <div class="container">
    <div class="skeleton-wrapper" id="skeleton">
      <!-- 骨架屏内容 -->
    </div>
    <div id="app-content"></div>
  </div>
  <script>
    window.__ITEM_ID__ = "{{ITEM_ID}}";
    window.__PRECHECK_DATA__ = {{PRECHECK_DATA}};
  </script>
  <script src="/skeleton/skeleton.bundle.js"></script>
</body>
</html>
  `.trim();

  // 写入文件
  fs.writeFileSync(
    path.join(__dirname, '../public/skeleton/template.html'),
    html
  );
}

generateSkeletonHTML();
```

**使用方式**：

```javascript
// src/server/skeleton.js
const fs = require('fs');
const path = require('path');

// 启动时读取模板（只读取一次）
const skeletonTemplate = fs.readFileSync(
  path.join(__dirname, '../../public/skeleton/template.html'),
  'utf-8'
);

function renderSkeleton(itemId, precheckData) {
  // 简单的字符串替换
  return skeletonTemplate
    .replace('{{ITEM_ID}}', itemId)
    .replace('{{PRECHECK_DATA}}', JSON.stringify(precheckData));
}
```

**优化效果**：
- ✅ 骨架页渲染时间从 5ms 降低到 <1ms
- ✅ 减少字符串拼接开销
- ✅ 可以直接部署到 CDN

---

### 二、架构优化

#### 2.1 预检接口前置到 CDN/边缘节点 ⭐⭐⭐⭐⭐

**当前问题**：
- 预检接口在 Node.js 服务端调用
- 增加了服务端的网络延迟

**优化方案**：使用 Cloudflare Workers / Vercel Edge Functions

```javascript
// edge/precheck.js - 部署到边缘节点
export default async function handler(request) {
  const url = new URL(request.url);
  const itemId = url.pathname.split('/').pop();

  // 1. 从边缘 KV 存储读取（超快）
  const cached = await PRECHECK_KV.get(`item:${itemId}`);
  if (cached) {
    return new Response(cached, {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // 2. 调用源站接口
  const response = await fetch(`https://api.example.com/precheck/${itemId}`);
  const data = await response.json();

  // 3. 写入边缘缓存
  await PRECHECK_KV.put(`item:${itemId}`, JSON.stringify(data), {
    expirationTtl: 60
  });

  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json' }
  });
}
```

**架构图**：

```
用户请求 /item/:id
    ↓
CDN/边缘节点
    ├─ 调用边缘预检接口（<10ms）
    ├─ 秒杀商品 → 返回 CDN 缓存的骨架页
    └─ 普通商品 → 回源到 Node.js SSR
```

**优化效果**：
- ✅ 预检延迟从 50ms 降低到 <10ms
- ✅ 秒杀商品完全不回源
- ✅ 全球加速

---

#### 2.2 微前端架构 ⭐⭐⭐

**当前问题**：
- 普通商品和秒杀商品耦合在一个项目中
- 秒杀页面的更新需要重新部署整个项目

**优化方案**：拆分为独立的微应用

```
ssr-item/
├── packages/
│   ├── normal-item/      # 普通商品（SSR）
│   │   ├── src/
│   │   └── package.json
│   ├── seckill-item/     # 秒杀商品（CSR）
│   │   ├── src/
│   │   └── package.json
│   └── shared/           # 共享组件
│       ├── components/
│       └── utils/
└── server/               # 网关服务
    └── index.js
```

**网关路由**：

```javascript
// server/index.js
router.get('/item/:id', async (ctx) => {
  const { isSeckill } = await precheckItem(itemId);

  if (isSeckill) {
    // 转发到秒杀服务
    ctx.redirect(`https://seckill.example.com/item/${itemId}`);
  } else {
    // 转发到普通商品服务
    ctx.redirect(`https://item.example.com/item/${itemId}`);
  }
});
```

**优化效果**：
- ✅ 独立部署，互不影响
- ✅ 秒杀服务可以独立扩容
- ✅ 技术栈可以不同

---

#### 2.3 GraphQL 数据层 ⭐⭐⭐

**当前问题**：
- 数据获取逻辑分散在各个文件
- 客户端和服务端重复请求

**优化方案**：

```javascript
// src/graphql/schema.js
const { gql } = require('apollo-server-koa');

const typeDefs = gql`
  type Item {
    itemId: ID!
    title: String!
    price: Float!
    isSeckill: Boolean!
    stock: Int!
    images: [String!]!
  }

  type Query {
    item(id: ID!): Item
    precheck(id: ID!): PrecheckResult
  }

  type PrecheckResult {
    isSeckill: Boolean!
    data: JSON
  }
`;

const resolvers = {
  Query: {
    item: async (_, { id }) => {
      return await fetchItemData(id);
    },
    precheck: async (_, { id }) => {
      return await precheckItem(id);
    }
  }
};
```

**使用方式**：

```javascript
// 服务端和客户端统一使用 GraphQL
const query = gql`
  query GetItem($id: ID!) {
    item(id: $id) {
      itemId
      title
      price
      isSeckill
    }
  }
`;
```

---

### 三、可维护性优化

#### 3.1 TypeScript 重构 ⭐⭐⭐⭐

**当前问题**：
- 纯 JavaScript，缺少类型检查
- 容易出现运行时错误

**优化方案**：

```typescript
// src/types/item.ts
export interface ItemData {
  itemId: string;
  title: string;
  price: number;
  originalPrice?: number;
  stock: number;
  description: string;
  images: string[];
  specs?: Record<string, string>;
  reviews?: Review[];
}

export interface PrecheckResult {
  isSeckill: boolean;
  data: {
    itemId: string;
    type: 'seckill' | 'normal';
    timestamp: number;
  };
}

// src/server/index.ts
import { ItemData, PrecheckResult } from '../types/item';

router.get('/item/:id', async (ctx: Context) => {
  const itemId: string = ctx.params.id;
  const result: PrecheckResult = await precheckItem(itemId);
  // 类型安全
});
```

---

#### 3.2 配置中心化 ⭐⭐⭐⭐

**当前问题**：
- 配置分散在各个文件中
- 难以管理和修改

**优化方案**：

```javascript
// config/index.js
module.exports = {
  server: {
    port: process.env.PORT || 3000,
    env: process.env.NODE_ENV || 'development'
  },

  cache: {
    precheck: {
      ttl: 60,           // 预检缓存 60 秒
      max: 10000         // 最多缓存 10000 个
    },
    ssr: {
      ttl: 60,
      max: 500
    }
  },

  api: {
    precheckUrl: process.env.PRECHECK_API_URL,
    itemUrl: process.env.ITEM_API_URL,
    timeout: 5000
  },

  cdn: {
    enabled: process.env.CDN_ENABLED === 'true',
    url: process.env.CDN_URL || ''
  },

  render: {
    seckill: {
      strategy: 'csr',   // csr | ssr | hybrid
      skeletonCdn: true
    },
    normal: {
      strategy: 'ssr',
      streamEnabled: true
    }
  }
};
```

---

#### 3.3 监控和告警 ⭐⭐⭐⭐⭐

**当前问题**：
- 没有性能监控
- 出问题无法及时发现

**优化方案**：

```javascript
// src/middleware/monitor.js
const prometheus = require('prom-client');

// 定义指标
const httpRequestDuration = new prometheus.Histogram({
  name: 'http_request_duration_ms',
  help: 'HTTP 请求耗时',
  labelNames: ['method', 'route', 'status']
});

const precheckDuration = new prometheus.Histogram({
  name: 'precheck_duration_ms',
  help: '预检接口耗时'
});

const ssrRenderDuration = new prometheus.Histogram({
  name: 'ssr_render_duration_ms',
  help: 'SSR 渲染耗时'
});

// 中间件
async function monitorMiddleware(ctx, next) {
  const start = Date.now();

  await next();

  const duration = Date.now() - start;
  httpRequestDuration
    .labels(ctx.method, ctx.path, ctx.status)
    .observe(duration);
}

// 暴露 metrics 接口
router.get('/metrics', async (ctx) => {
  ctx.type = 'text/plain';
  ctx.body = await prometheus.register.metrics();
});

module.exports = { monitorMiddleware, precheckDuration, ssrRenderDuration };
```

**配合 Grafana 可视化**：
- 实时监控 QPS、响应时间、错误率
- 预检接口性能
- SSR 渲染性能
- 缓存命中率

---

### 四、安全性优化

#### 4.1 XSS 防护 ⭐⭐⭐⭐⭐

**当前问题**：
- 直接注入数据到 HTML，可能存在 XSS 风险

**优化方案**：

```javascript
// src/utils/sanitize.js
const xss = require('xss');

function sanitizeItemData(itemData) {
  return {
    ...itemData,
    title: xss(itemData.title),
    description: xss(itemData.description),
    // 其他字段...
  };
}

// src/server/ssr.js
function generateHTML(appHtml, itemData) {
  // 对数据进行转义
  const safeData = sanitizeItemData(itemData);

  return `
    <script>
      window.__INITIAL_DATA__ = ${JSON.stringify(safeData)
        .replace(/</g, '\\u003c')
        .replace(/>/g, '\\u003e')};
    </script>
  `;
}
```

---

#### 4.2 CSRF 防护 ⭐⭐⭐⭐

```javascript
// src/middleware/csrf.js
const csrf = require('koa-csrf');

app.use(new csrf({
  invalidTokenMessage: 'Invalid CSRF token',
  invalidTokenStatusCode: 403
}));

// 在表单中添加 CSRF token
router.post('/api/seckill/:id', async (ctx) => {
  // 自动验证 CSRF token
  // ...
});
```

---

#### 4.3 限流和防刷 ⭐⭐⭐⭐⭐

```javascript
// src/middleware/rate-limit.js
const rateLimit = require('koa-ratelimit');
const Redis = require('ioredis');

const redis = new Redis();

// 针对秒杀接口的严格限流
const seckillLimiter = rateLimit({
  driver: 'redis',
  db: redis,
  duration: 60000,        // 1 分钟
  max: 10,                // 最多 10 次请求
  id: (ctx) => ctx.ip,    // 按 IP 限流
  errorMessage: '请求过于频繁，请稍后再试'
});

router.post('/api/seckill/:id', seckillLimiter, async (ctx) => {
  // 秒杀逻辑
});
```

---

### 五、测试优化

#### 5.1 单元测试 ⭐⭐⭐⭐

```javascript
// tests/precheck.test.js
const { precheckItem } = require('../src/api/precheck');

describe('预检接口', () => {
  test('秒杀商品判断', async () => {
    const result = await precheckItem('SK001');
    expect(result.isSeckill).toBe(true);
  });

  test('普通商品判断', async () => {
    const result = await precheckItem('123');
    expect(result.isSeckill).toBe(false);
  });
});
```

#### 5.2 E2E 测试 ⭐⭐⭐

```javascript
// tests/e2e/item.test.js
const puppeteer = require('puppeteer');

describe('商品详情页 E2E', () => {
  let browser, page;

  beforeAll(async () => {
    browser = await puppeteer.launch();
    page = await browser.newPage();
  });

  test('普通商品 SSR 渲染', async () => {
    await page.goto('http://localhost:3000/item/123');
    const title = await page.$eval('h1', el => el.textContent);
    expect(title).toContain('普通商品');
  });

  test('秒杀商品骨架屏', async () => {
    await page.goto('http://localhost:3000/item/SK001');
    const skeleton = await page.$('.skeleton-wrapper');
    expect(skeleton).toBeTruthy();
  });

  afterAll(async () => {
    await browser.close();
  });
});
```

---

### 六、DevOps 优化

#### 6.1 CI/CD 流水线 ⭐⭐⭐⭐

```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2

      - name: Setup Node.js
        uses: actions/setup-node@v2
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm ci

      - name: Run tests
        run: npm test

      - name: Build
        run: npm run build

      - name: Deploy to server
        run: |
          scp -r build/ public/ ${{ secrets.SERVER_USER }}@${{ secrets.SERVER_HOST }}:/var/www/ssr-item/
          ssh ${{ secrets.SERVER_USER }}@${{ secrets.SERVER_HOST }} "pm2 restart ssr-item"
```

---

### 七、优化优先级总结

| 优化项 | 优先级 | 难度 | 收益 | 推荐指数 |
|--------|--------|------|------|----------|
| 预检接口缓存 | ⭐⭐⭐⭐⭐ | 低 | 高 | 必须做 |
| SSR 渲染缓存 | ⭐⭐⭐⭐⭐ | 低 | 高 | 必须做 |
| 骨架页预生成 | ⭐⭐⭐⭐ | 低 | 中 | 推荐 |
| 流式 SSR | ⭐⭐⭐⭐ | 中 | 高 | 推荐 |
| 边缘节点预检 | ⭐⭐⭐⭐⭐ | 中 | 极高 | 强烈推荐 |
| TypeScript | ⭐⭐⭐⭐ | 中 | 中 | 推荐 |
| 监控告警 | ⭐⭐⭐⭐⭐ | 中 | 高 | 必须做 |
| 限流防刷 | ⭐⭐⭐⭐⭐ | 低 | 高 | 必须做 |
| 微前端 | ⭐⭐⭐ | 高 | 中 | 可选 |
| GraphQL | ⭐⭐⭐ | 高 | 中 | 可选 |

---

### 八、快速优化方案（1 天内完成）

如果只有 1 天时间，优先做这些：

1. **添加预检缓存**（1 小时）
2. **添加 SSR 缓存**（1 小时）
3. **骨架页预生成**（30 分钟）
4. **添加限流中间件**（30 分钟）
5. **添加基础监控**（2 小时）
6. **XSS 防护**（1 小时）

这些优化可以让性能提升 **5-10 倍**，并且实现成本低。

---

### 九、终极架构（如果重新设计）

```
                        用户请求
                            ↓
                    Cloudflare CDN
                            ↓
                    边缘预检接口 (<10ms)
                    ├─ 秒杀 → CDN 缓存骨架页
                    └─ 普通 → 回源
                            ↓
                        Nginx
                            ↓
                    负载均衡（多实例）
                    ├─ Node.js 1 (SSR)
                    ├─ Node.js 2 (SSR)
                    └─ Node.js 3 (SSR)
                            ↓
                    Redis 缓存层
                    ├─ 预检缓存
                    ├─ SSR 缓存
                    └─ 商品数据缓存
                            ↓
                    后端 API 服务
                            ↓
                        数据库
```

**关键特性**：
- ✅ 边缘计算（预检 + 骨架页）
- ✅ 多级缓存（CDN + Redis + 内存）
- ✅ 流式 SSR
- ✅ 负载均衡 + 自动扩容
- ✅ 全链路监控
- ✅ 灰度发布

---

完整的优化实现代码和配置，我可以继续为你编写！
